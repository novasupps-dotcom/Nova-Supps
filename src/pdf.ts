// PDF mínimo en JavaScript (sin módulos nativos): páginas A4, texto con Helvetica
// (codificación WinAnsi: acentos y ñ) e imágenes JPG incrustadas tal cual (DCTDecode).

export type PdfImage = { id: string; width: number; height: number; bytes: Uint8Array };
type Op = string;

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

const WIN: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99, "−": 0x2d };
/** Texto → bytes WinAnsi escapados para un string de PDF. */
function pdfText(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    let code = WIN[ch] ?? ch.charCodeAt(0);
    if (code > 0xff || (code >= 0x80 && code < 0xa0 && !Object.values(WIN).includes(code))) code = 0x3f; // ?
    const c = String.fromCharCode(code);
    out += c === "(" || c === ")" || c === "\\" ? "\\" + c : code < 0x20 ? " " : c;
  }
  return out;
}
/** Ancho aproximado de un texto en Helvetica (para cortar renglones). */
export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) w += /[il.,;:'|!]/.test(ch) ? 0.28 : /[mwMW@]/.test(ch) ? 0.83 : /[A-Z0-9$]/.test(ch) ? 0.64 : ch === " " ? 0.28 : 0.52;
  return w * size * (bold ? 1.06 : 1);
}
/** Corta un texto en renglones que quepan en `width` (máximo `lines`; el último con "…"). */
export function wrap(text: string, size: number, width: number, lines = 2, bold = false): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (textWidth(next, size, bold) <= width) cur = next;
    else {
      if (cur) out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    let last = kept[lines - 1];
    while (last.length > 1 && textWidth(last + "…", size, bold) > width) last = last.slice(0, -1);
    kept[lines - 1] = last.trimEnd() + "…";
    return kept;
  }
  return out;
}

export class PdfDoc {
  readonly W = 595.28;
  readonly H = 841.89;
  private pages: Op[][] = [];
  private images = new Map<string, PdfImage>();
  private cur: Op[] | null = null;
  addPage() {
    this.cur = [];
    this.pages.push(this.cur);
  }
  private op(s: string) {
    if (!this.cur) this.addPage();
    this.cur!.push(s);
  }
  /** Texto con la esquina inferior izquierda en (x, y) medidos desde ARRIBA de la página. */
  text(x: number, yTop: number, text: string, size = 10, opts: { bold?: boolean; color?: [number, number, number]; align?: "left" | "center" | "right"; width?: number } = {}) {
    const [r, g, b] = opts.color ?? [0.07, 0.09, 0.15];
    let dx = x;
    if (opts.align && opts.align !== "left" && opts.width) {
      const w = textWidth(text, size, opts.bold);
      dx = opts.align === "center" ? x + (opts.width - w) / 2 : x + opts.width - w;
    }
    this.op(`BT ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg /${opts.bold ? "F2" : "F1"} ${size} Tf ${dx.toFixed(2)} ${(this.H - yTop).toFixed(2)} Td (${pdfText(text)}) Tj ET`);
  }
  rect(x: number, yTop: number, w: number, h: number, opts: { fill?: [number, number, number]; stroke?: [number, number, number] } = {}) {
    const y = this.H - yTop - h;
    if (opts.fill) this.op(`${opts.fill.map((v) => v.toFixed(3)).join(" ")} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    if (opts.stroke) this.op(`0.6 w ${opts.stroke.map((v) => v.toFixed(3)).join(" ")} RG ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
  }
  /** Imagen JPG ajustada dentro de la caja (sin deformarla). */
  image(img: PdfImage, x: number, yTop: number, boxW: number, boxH: number) {
    this.images.set(img.id, img);
    const k = Math.min(boxW / img.width, boxH / img.height);
    const w = img.width * k,
      h = img.height * k;
    const px = x + (boxW - w) / 2,
      py = this.H - yTop - boxH + (boxH - h) / 2;
    this.op(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${px.toFixed(2)} ${py.toFixed(2)} cm /${img.id} Do Q`);
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
    const obj = (n: number, body: (string | Uint8Array)[]) => {
      offsets[n] = size;
      push(enc(`${n} 0 obj\n`));
      for (const part of body) push(typeof part === "string" ? enc(part) : part);
      push(enc("\nendobj\n"));
    };
    push(enc("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"));
    const imgs = [...this.images.values()];
    // 1 catálogo · 2 páginas · 3 Helvetica · 4 Helvetica-Bold · 5 info · imágenes · páginas y contenidos
    const imgBase = 6;
    const pageBase = imgBase + imgs.length;
    const xobjects = imgs.map((im, i) => `/${im.id} ${imgBase + i} 0 R`).join(" ");
    obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
    obj(2, [`<< /Type /Pages /Count ${this.pages.length} /Kids [${this.pages.map((_, i) => `${pageBase + i * 2} 0 R`).join(" ")}] >>`]);
    obj(3, ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]);
    obj(4, ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"]);
    obj(5, [`<< /Title (${pdfText(title)}) /Producer (Nova Negocio) >>`]);
    imgs.forEach((im, i) =>
      obj(imgBase + i, [`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`, im.bytes, "\nendstream"]),
    );
    this.pages.forEach((ops, i) => {
      const content = enc(ops.join("\n"));
      const n = pageBase + i * 2;
      obj(n, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xobjects} >> >> /Contents ${n + 1} 0 R >>`]);
      obj(n + 1, [`<< /Length ${content.length} >>\nstream\n`, content, "\nendstream"]);
    });
    const total = pageBase + this.pages.length * 2;
    const xref = size;
    let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
    push(enc(table + `trailer\n<< /Size ${total} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    const out = new Uint8Array(size);
    let p = 0;
    for (const c of chunks) {
      out.set(c, p);
      p += c.length;
    }
    return out;
  }
}
