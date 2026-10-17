// PDF en JavaScript (sin módulos nativos): páginas A4, letra Inter incrustada (TrueType,
// codificación WinAnsi: acentos y ñ) o Helvetica, imágenes JPG tal cual (DCTDecode) o RGB
// comprimidas (FlateDecode), rectángulos redondeados y recorte. 2.5: contenido comprimido.
import { zlibSync } from "fflate";

export type PdfImage =
  | { id: string; width: number; height: number; bytes: Uint8Array; kind?: "jpeg" }
  /** Píxeles RGB sin comprimir (3 bytes por pixel). */
  | { id: string; width: number; height: number; bytes: Uint8Array; kind: "rgb" };
type RGB = [number, number, number];
type Op = string;
export type FontMetrics = { widths: number[]; ascent: number; descent: number; capHeight: number; bbox: number[] };
type FontDef = { key: string; name: string; ttf?: Uint8Array; metrics?: FontMetrics; base14?: string };

/** Ancho y alto de un JPG (marcador SOF); null si no es un JPG válido. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0..SOF15 excepto DHT (C4), JPG (C8) y DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width && height ? { width, height } : null;
    }
    if (marker === 0xda) return null;
    i += 2 + len;
  }
  return null;
}

const WIN: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99, "−": 0x2d, "→": 0x3e };
const WIN_CODES = new Set(Object.values(WIN));
/** Código WinAnsi de cada letra (? si no existe). */
function winCodes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text.normalize("NFC")) {
    let code = WIN[ch] ?? ch.charCodeAt(0);
    if (code > 0xff || (code >= 0x80 && code < 0xa0 && !WIN_CODES.has(code))) code = 0x3f;
    out.push(code < 0x20 ? 0x20 : code);
  }
  return out;
}
/** Texto → string de PDF escapado. */
function pdfString(text: string): string {
  return winCodes(text)
    .map((code) => {
      const c = String.fromCharCode(code);
      return c === "(" || c === ")" || c === "\\" ? "\\" + c : c;
    })
    .join("");
}
/** Ancho aproximado de un texto en Helvetica (para cortar renglones). */
export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) w += /[il.,;:'|!]/.test(ch) ? 0.28 : /[mwMW@]/.test(ch) ? 0.83 : /[A-Z0-9$]/.test(ch) ? 0.64 : ch === " " ? 0.28 : 0.52;
  return w * size * (bold ? 1.06 : 1);
}
/** Corta un texto en renglones (máximo `lines`; el último con "…") según una función de ancho. */
function wrapWith(measure: (s: string) => number, text: string, width: number, lines: number): string[] {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (measure(next) <= width) cur = next;
    else {
      if (cur) out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    let last = kept[lines - 1];
    while (last.length > 1 && measure(last + "…") > width) last = last.slice(0, -1);
    kept[lines - 1] = last.trimEnd() + "…";
    return kept;
  }
  return out;
}
export function wrap(text: string, size: number, width: number, lines = 2, bold = false): string[] {
  return wrapWith((s) => textWidth(s, size, bold), text, width, lines);
}
const f = (n: number) => (Math.round(n * 100) / 100).toString();
const color = (c: RGB) => c.map((v) => (Math.round(v * 1000) / 1000).toString()).join(" ");

export class PdfDoc {
  readonly W = 595.28;
  readonly H = 841.89;
  private pages: Op[][] = [];
  private images = new Map<string, PdfImage>();
  private fonts: FontDef[] = [
    { key: "F1", name: "Helvetica", base14: "Helvetica" },
    { key: "F2", name: "Helvetica-Bold", base14: "Helvetica-Bold" },
  ];
  private cur: Op[] | null = null;
  /** Registra una letra TrueType (Inter); se usa con text(..., { font: key }). */
  addFont(key: string, name: string, ttf: Uint8Array, metrics: FontMetrics) {
    this.fonts = this.fonts.filter((x) => x.key !== key);
    this.fonts.push({ key, name, ttf, metrics });
  }
  private fontOf(key?: string, bold?: boolean): FontDef {
    return this.fonts.find((x) => x.key === (key || (bold ? "F2" : "F1"))) || this.fonts[0];
  }
  /** Ancho real del texto con la letra elegida (Helvetica: aproximado). */
  measure(text: string, size: number, opts: { font?: string; bold?: boolean; tracking?: number } = {}): number {
    const font = this.fontOf(opts.font, opts.bold);
    const codes = winCodes(text);
    const track = (opts.tracking ?? 0) * Math.max(0, codes.length - 1);
    if (!font.metrics) return textWidth(text, size, opts.bold) + track;
    let w = 0;
    for (const c of codes) w += font.metrics.widths[c - 32] || 500;
    return (w / 1000) * size + track;
  }
  wrap(text: string, size: number, width: number, lines = 2, opts: { font?: string; bold?: boolean } = {}): string[] {
    return wrapWith((s) => this.measure(s, size, opts), text, width, lines);
  }
  addPage() {
    this.cur = [];
    this.pages.push(this.cur);
  }
  /** Vuelve a una página ya creada (para numerarlas al final). */
  setPage(i: number) {
    this.cur = this.pages[i] ?? this.cur;
  }
  private op(s: string) {
    if (!this.cur) this.addPage();
    this.cur!.push(s);
  }
  /** Texto con la línea base en (x, yTop) medida desde ARRIBA de la página. */
  text(
    x: number,
    yTop: number,
    text: string,
    size = 10,
    opts: { bold?: boolean; font?: string; color?: RGB; align?: "left" | "center" | "right"; width?: number; tracking?: number } = {},
  ) {
    const font = this.fontOf(opts.font, opts.bold);
    let dx = x;
    if (opts.align && opts.align !== "left" && opts.width) {
      const w = this.measure(text, size, opts);
      dx = opts.align === "center" ? x + (opts.width - w) / 2 : x + opts.width - w;
    }
    // El espaciado entre letras (Tc) se queda puesto en la página: siempre se fija.
    const tc = `${f(opts.tracking ?? 0)} Tc `;
    this.op(`BT ${color(opts.color ?? [0.07, 0.07, 0.09])} rg /${font.key} ${f(size)} Tf ${tc}${f(dx)} ${f(this.H - yTop)} Td (${pdfString(text)}) Tj ET`);
  }
  private roundPath(x: number, yTop: number, w: number, h: number, r: number): string {
    const y = this.H - yTop - h;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    const k = r * 0.5523;
    if (!r) return `${f(x)} ${f(y)} ${f(w)} ${f(h)} re`;
    return [
      `${f(x + r)} ${f(y)} m`,
      `${f(x + w - r)} ${f(y)} l`,
      `${f(x + w - r + k)} ${f(y)} ${f(x + w)} ${f(y + r - k)} ${f(x + w)} ${f(y + r)} c`,
      `${f(x + w)} ${f(y + h - r)} l`,
      `${f(x + w)} ${f(y + h - r + k)} ${f(x + w - r + k)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} c`,
      `${f(x + r)} ${f(y + h)} l`,
      `${f(x + r - k)} ${f(y + h)} ${f(x)} ${f(y + h - r + k)} ${f(x)} ${f(y + h - r)} c`,
      `${f(x)} ${f(y + r)} l`,
      `${f(x)} ${f(y + r - k)} ${f(x + r - k)} ${f(y)} ${f(x + r)} ${f(y)} c h`,
    ].join(" ");
  }
  /** Rectángulo (con esquinas redondeadas si `radius`). */
  rect(x: number, yTop: number, w: number, h: number, opts: { fill?: RGB; stroke?: RGB; radius?: number; line?: number } = {}) {
    const path = this.roundPath(x, yTop, w, h, opts.radius ?? 0);
    if (opts.fill) this.op(`${color(opts.fill)} rg ${path} f`);
    if (opts.stroke) this.op(`${f(opts.line ?? 0.6)} w ${color(opts.stroke)} RG ${path} S`);
  }
  /** Línea horizontal fina. */
  hline(x: number, yTop: number, w: number, c: RGB, width = 0.5) {
    const y = this.H - yTop;
    this.op(`${f(width)} w ${color(c)} RG ${f(x)} ${f(y)} m ${f(x + w)} ${f(y)} l S`);
  }
  /** Imagen ajustada dentro de la caja (sin deformarla); con `radius`, recortada redondeada. */
  image(img: PdfImage, x: number, yTop: number, boxW: number, boxH: number, opts: { radius?: number; cover?: boolean } = {}) {
    this.images.set(img.id, img);
    const k = opts.cover ? Math.max(boxW / img.width, boxH / img.height) : Math.min(boxW / img.width, boxH / img.height);
    const w = img.width * k,
      h = img.height * k;
    const px = x + (boxW - w) / 2,
      py = this.H - yTop - boxH + (boxH - h) / 2;
    const clip = opts.radius || opts.cover ? `${this.roundPath(x, yTop, boxW, boxH, opts.radius ?? 0)} W n ` : "";
    this.op(`q ${clip}${f(w)} 0 0 ${f(h)} ${f(px)} ${f(py)} cm /${img.id} Do Q`);
  }
  get pageCount() {
    return this.pages.length;
  }
  /** Bytes del PDF terminado. */
  build(title = "Catálogo"): Uint8Array {
    if (!this.pages.length) this.addPage();
    const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let size = 0;
    const push = (u: Uint8Array) => {
      chunks.push(u);
      size += u.length;
    };
    let next = 1;
    const alloc = () => next++;
    const obj = (n: number, body: (string | Uint8Array)[]) => {
      offsets[n] = size;
      push(enc(`${n} 0 obj\n`));
      for (const part of body) push(typeof part === "string" ? enc(part) : part);
      push(enc("\nendobj\n"));
    };
    const stream = (n: number, dict: string, data: Uint8Array, compress = true) => {
      const body = compress ? zlibSync(data, { level: 6 }) : data;
      obj(n, [`<< ${dict}${compress ? " /Filter /FlateDecode" : ""} /Length ${body.length} >>\nstream\n`, body, "\nendstream"]);
    };
    push(enc("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"));
    const catalog = alloc(),
      pagesId = alloc(),
      info = alloc();
    const fontIds = new Map<string, number>();
    for (const font of this.fonts) fontIds.set(font.key, alloc());
    const imageIds = new Map<string, number>();
    for (const img of this.images.values()) imageIds.set(img.id, alloc());
    const pageIds = this.pages.map(() => [alloc(), alloc()]);
    obj(catalog, [`<< /Type /Catalog /Pages ${pagesId} 0 R >>`]);
    obj(pagesId, [`<< /Type /Pages /Count ${this.pages.length} /Kids [${pageIds.map(([p]) => `${p} 0 R`).join(" ")}] >>`]);
    obj(info, [`<< /Title (${pdfString(title)}) /Producer (Nova Negocio) >>`]);
    for (const font of this.fonts) {
      const id = fontIds.get(font.key)!;
      if (font.base14) {
        obj(id, [`<< /Type /Font /Subtype /Type1 /BaseFont /${font.base14} /Encoding /WinAnsiEncoding >>`]);
        continue;
      }
      const m = font.metrics!;
      const desc = alloc(),
        file = alloc();
      obj(id, [`<< /Type /Font /Subtype /TrueType /BaseFont /${font.name} /FirstChar 32 /LastChar 255 /Widths [${m.widths.join(" ")}] /Encoding /WinAnsiEncoding /FontDescriptor ${desc} 0 R >>`]);
      obj(desc, [`<< /Type /FontDescriptor /FontName /${font.name} /Flags 32 /FontBBox [${m.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${m.ascent} /Descent ${m.descent} /CapHeight ${m.capHeight} /StemV 80 /FontFile2 ${file} 0 R >>`]);
      stream(file, `/Length1 ${font.ttf!.length}`, font.ttf!);
    }
    for (const img of this.images.values()) {
      const id = imageIds.get(img.id)!;
      const dict = `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8`;
      if (img.kind === "rgb") stream(id, dict, img.bytes);
      else obj(id, [`<< ${dict} /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`, img.bytes, "\nendstream"]);
    }
    const fonts = this.fonts.map((x) => `/${x.key} ${fontIds.get(x.key)} 0 R`).join(" ");
    const xobjects = [...this.images.values()].map((im) => `/${im.id} ${imageIds.get(im.id)} 0 R`).join(" ");
    this.pages.forEach((ops, i) => {
      const [p, c] = pageIds[i];
      obj(p, [`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << ${fonts} >> /XObject << ${xobjects} >> >> /Contents ${c} 0 R >>`]);
      stream(c, "", enc(ops.join("\n")));
    });
    const total = next;
    const xref = size;
    let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++) table += `${String(offsets[n] ?? 0).padStart(10, "0")} 00000 n \n`;
    push(enc(table + `trailer\n<< /Size ${total} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    const out = new Uint8Array(size);
    let p = 0;
    for (const c of chunks) {
      out.set(c, p);
      p += c.length;
    }
    return out;
  }
}
