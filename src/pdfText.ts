// 2.8 · Texto de un PDF con su posición en la página, sin dependencias nativas (corre en
// Hermes): objetos sin comprimir u ObjStm no hace falta para los PDF que imprime Chrome
// (Skia). Soporta flujos FlateDecode, fuentes Type0/Identity-H con ToUnicode y fuentes
// simples (WinAnsi), matrices cm/Tm y anchos de glifo (/W y /Widths) para unir palabras.
import { unzlibSync, inflateSync } from "fflate";

export type PdfText = { page: number; x: number; y: number; w: number; size: number; text: string };

type Ref = { ref: number };
type PdfValue = number | string | boolean | null | Ref | PdfName | PdfValue[] | { [k: string]: PdfValue };
class PdfName {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}
type Dict = { [k: string]: PdfValue };
type Obj = { dict: PdfValue; stream?: Uint8Array };

const isWhite = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;
const isDelim = (c: number) =>
  c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;

/** Lector de objetos PDF (diccionarios, arreglos, nombres, cadenas, números y referencias). */
class Lexer {
  pos: number;
  b: Uint8Array;
  constructor(b: Uint8Array, start = 0) {
    this.b = b;
    this.pos = start;
  }
  skip() {
    const b = this.b;
    while (this.pos < b.length) {
      const c = b[this.pos];
      if (isWhite(c)) this.pos++;
      else if (c === 0x25) {
        while (this.pos < b.length && b[this.pos] !== 0x0a && b[this.pos] !== 0x0d) this.pos++;
      } else break;
    }
  }
  word(): string {
    this.skip();
    const b = this.b;
    const s = this.pos;
    while (this.pos < b.length && !isWhite(b[this.pos]) && !isDelim(b[this.pos])) this.pos++;
    return latin1(b, s, this.pos);
  }
  peek(): number {
    this.skip();
    return this.b[this.pos];
  }
  /** Un valor; `ops` regresa operadores sueltos como cadena con prefijo "op:". */
  value(): PdfValue | undefined {
    this.skip();
    const b = this.b;
    if (this.pos >= b.length) return undefined;
    const c = b[this.pos];
    if (c === 0x2f) {
      this.pos++;
      const s = this.pos;
      while (this.pos < b.length && !isWhite(b[this.pos]) && !isDelim(b[this.pos])) this.pos++;
      return new PdfName(latin1(b, s, this.pos).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
    }
    if (c === 0x28) return this.literal();
    if (c === 0x3c) {
      if (b[this.pos + 1] === 0x3c) {
        this.pos += 2;
        const d: Dict = {};
        for (;;) {
          this.skip();
          if (b[this.pos] === 0x3e && b[this.pos + 1] === 0x3e) {
            this.pos += 2;
            return d;
          }
          if (this.pos >= b.length) return d;
          const k = this.value();
          const v = this.value();
          if (k instanceof PdfName) d[k.name] = v === undefined ? null : v;
        }
      }
      this.pos++;
      const s = this.pos;
      while (this.pos < b.length && b[this.pos] !== 0x3e) this.pos++;
      const hex = latin1(b, s, this.pos).replace(/[^0-9a-fA-F]/g, "");
      this.pos++;
      let out = "";
      for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt((hex.slice(i, i + 2) + "0").slice(0, 2), 16));
      return out;
    }
    if (c === 0x5b) {
      this.pos++;
      const arr: PdfValue[] = [];
      for (;;) {
        this.skip();
        if (b[this.pos] === 0x5d) {
          this.pos++;
          return arr;
        }
        if (this.pos >= b.length) return arr;
        const v = this.value();
        if (v === undefined) return arr;
        arr.push(v);
      }
    }
    if (c === 0x5d || c === 0x3e || c === 0x29 || c === 0x7b || c === 0x7d) {
      this.pos++;
      return this.value();
    }
    const w = this.word();
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) {
      // ¿Referencia "n g R"?
      const save = this.pos;
      const g = this.word();
      if (/^\d+$/.test(g)) {
        const r = this.word();
        if (r === "R" && /^\d+$/.test(w)) return { ref: Number(w) };
      }
      this.pos = save;
      return Number(w);
    }
    if (w === "true") return true;
    if (w === "false") return false;
    if (w === "null") return null;
    return "op:" + w;
  }
  literal(): string {
    const b = this.b;
    this.pos++;
    let depth = 1;
    let out = "";
    while (this.pos < b.length) {
      const c = b[this.pos++];
      if (c === 0x5c) {
        const n = b[this.pos++];
        if (n === 0x6e) out += "\n";
        else if (n === 0x72) out += "\r";
        else if (n === 0x74) out += "\t";
        else if (n === 0x62) out += "\b";
        else if (n === 0x66) out += "\f";
        else if (n >= 0x30 && n <= 0x37) {
          let oct = String.fromCharCode(n);
          for (let k = 0; k < 2 && b[this.pos] >= 0x30 && b[this.pos] <= 0x37; k++) oct += String.fromCharCode(b[this.pos++]);
          out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        } else if (n === 0x0d) {
          if (b[this.pos] === 0x0a) this.pos++;
        } else if (n !== 0x0a) out += String.fromCharCode(n);
      } else if (c === 0x28) {
        depth++;
        out += "(";
      } else if (c === 0x29) {
        if (--depth === 0) break;
        out += ")";
      } else out += String.fromCharCode(c);
    }
    return out;
  }
}

function latin1(b: Uint8Array, s: number, e: number): string {
  let out = "";
  for (let i = s; i < e; i += 4096) out += String.fromCharCode.apply(null, Array.from(b.subarray(i, Math.min(e, i + 4096))));
  return out;
}
function indexOf(b: Uint8Array, needle: string, from: number): number {
  const n = needle.length;
  const first = needle.charCodeAt(0);
  outer: for (let i = from; i <= b.length - n; i++) {
    if (b[i] !== first) continue;
    for (let k = 1; k < n; k++) if (b[i + k] !== needle.charCodeAt(k)) continue outer;
    return i;
  }
  return -1;
}

/** Lee todos los objetos "n g obj … endobj" en orden, saltando el contenido de los flujos por su /Length. */
function readObjects(b: Uint8Array): Map<number, Obj> {
  const objs = new Map<number, Obj>();
  const pending: { n: number; dict: PdfValue; start: number; len: PdfValue }[] = [];
  let pos = 0;
  const head = /^(\d+)\s+(\d+)\s+obj\b/;
  while (pos < b.length) {
    const at = indexOf(b, " obj", pos);
    if (at < 0) break;
    // Retrocede al inicio de "n g obj".
    let s = at - 1;
    while (s > 0 && (isWhite(b[s]) || (b[s] >= 0x30 && b[s] <= 0x39))) s--;
    if (s > 0 || !(b[s] >= 0x30 && b[s] <= 0x39)) s++;
    const m = head.exec(latin1(b, s, at + 5).trim());
    if (!m) {
      pos = at + 4;
      continue;
    }
    const n = Number(m[1]);
    const lx = new Lexer(b, at + 4);
    const dict = lx.value();
    lx.skip();
    const kw = latin1(b, lx.pos, lx.pos + 6);
    if (kw === "stream") {
      let start = lx.pos + 6;
      if (b[start] === 0x0d) start++;
      if (b[start] === 0x0a) start++;
      const len = dict && typeof dict === "object" && !Array.isArray(dict) && !(dict instanceof PdfName) ? (dict as Dict).Length : undefined;
      if (typeof len === "number") {
        objs.set(n, { dict: dict ?? null, stream: b.subarray(start, start + len) });
        pos = start + len;
      } else {
        // Longitud indirecta: se resuelve al final; mientras, se busca "endstream".
        const end = indexOf(b, "endstream", start);
        pending.push({ n, dict: dict ?? null, start, len: len ?? null });
        objs.set(n, { dict: dict ?? null, stream: b.subarray(start, end < 0 ? b.length : end) });
        pos = end < 0 ? b.length : end + 9;
      }
    } else {
      objs.set(n, { dict: dict ?? null });
      pos = lx.pos;
    }
  }
  for (const p of pending) {
    const l = p.len && typeof p.len === "object" && "ref" in (p.len as any) ? objs.get((p.len as Ref).ref)?.dict : null;
    if (typeof l === "number") objs.set(p.n, { dict: p.dict, stream: b.subarray(p.start, p.start + l) });
  }
  return objs;
}

function inflate(data: Uint8Array): Uint8Array {
  try {
    return unzlibSync(data);
  } catch {
    try {
      return inflateSync(data);
    } catch {
      // Flujo truncado: se usa lo que se pudo recuperar quitando bytes del final.
      for (let cut = 1; cut < 16 && cut < data.length; cut++) {
        try {
          return unzlibSync(data.subarray(0, data.length - cut));
        } catch {}
      }
      return new Uint8Array(0);
    }
  }
}

/** Fuente: código → texto, bytes por código y ancho de cada código (1/1000 del tamaño). */
type Font = { map: Map<number, string>; bytes: number; width: (code: number) => number; simple: boolean };

const WIN_ANSI: Record<number, string> = { 0x80: "€", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x96: "–", 0x97: "—", 0x85: "…" };

export function extractPdfText(bytes: Uint8Array): PdfText[] {
  const objs = readObjects(bytes);
  const get = (v: PdfValue | undefined, depth = 0): PdfValue | undefined =>
    v && typeof v === "object" && !Array.isArray(v) && "ref" in (v as any) && depth < 20 ? get(objs.get((v as Ref).ref)?.dict, depth + 1) : v;
  const dictOf = (v: PdfValue | undefined): Dict => {
    const d = get(v);
    return d && typeof d === "object" && !Array.isArray(d) && !(d instanceof PdfName) ? (d as Dict) : {};
  };
  const name = (v: PdfValue | undefined) => {
    const d = get(v);
    return d instanceof PdfName ? d.name : "";
  };
  const streamOf = (v: PdfValue | undefined): Uint8Array => {
    if (!v || typeof v !== "object" || !("ref" in (v as any))) return new Uint8Array(0);
    const o = objs.get((v as Ref).ref);
    if (!o?.stream) return new Uint8Array(0);
    const d = dictOf(o.dict);
    const filter = get(d.Filter);
    const filters = Array.isArray(filter) ? filter.map((f) => (f instanceof PdfName ? f.name : "")) : [name(d.Filter)];
    let data = o.stream;
    for (const f of filters) if (f === "FlateDecode") data = inflate(data);
    return data;
  };

  // Páginas en orden (árbol /Pages desde el catálogo; si falla, en el orden del archivo).
  const pages: Dict[] = [];
  const walk = (node: PdfValue | undefined, depth = 0) => {
    const d = dictOf(node);
    if (depth > 30) return;
    if (name(d.Type) === "Page") pages.push(d);
    else {
      const kids = get(d.Kids);
      if (Array.isArray(kids)) for (const k of kids) walk(k, depth + 1);
    }
  };
  let root: PdfValue | undefined;
  for (const o of objs.values()) {
    const d = dictOf(o.dict);
    if (name(d.Type) === "Catalog") {
      root = d.Pages;
      break;
    }
  }
  if (root) walk(root);
  if (!pages.length) for (const o of objs.values()) if (name(dictOf(o.dict).Type) === "Page") pages.push(dictOf(o.dict));

  const fontCache = new Map<PdfValue, Font>();
  const loadFont = (ref: PdfValue): Font => {
    const cached = fontCache.get(ref);
    if (cached) return cached;
    const d = dictOf(ref);
    const type0 = name(d.Subtype) === "Type0";
    const map = new Map<number, string>();
    let bytesPer = type0 ? 2 : 1;
    if (d.ToUnicode) {
      const cmap = latin1(streamOf(d.ToUnicode), 0, streamOf(d.ToUnicode).length);
      const hex = (h: string) => parseInt(h, 16);
      const uni = (h: string) => {
        let s = "";
        for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(hex(h.slice(i, i + 4)));
        return s;
      };
      const space = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(cmap);
      if (space) bytesPer = space[1].length / 2;
      for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
        for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(hex(m[1]), uni(m[2]));
      for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
        for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]*)>|\[([^\]]*)\])/g)) {
          const lo = hex(m[1]),
            hi = hex(m[2]);
          if (m[4] !== undefined) {
            const base = hex(m[4].slice(-4) || "0");
            const prefix = uni(m[4].slice(0, -4));
            for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, prefix + String.fromCharCode(base + c - lo));
          } else {
            const items = [...(m[5] || "").matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => uni(x[1]));
            items.forEach((t, i) => map.set(lo + i, t));
          }
        }
    }
    let width: (code: number) => number = () => 500;
    if (type0) {
      const desc = get(d.DescendantFonts);
      const cid = dictOf(Array.isArray(desc) ? desc[0] : undefined);
      const dw = typeof get(cid.DW) === "number" ? (get(cid.DW) as number) : 1000;
      const widths = new Map<number, number>();
      const w = get(cid.W);
      if (Array.isArray(w))
        for (let i = 0; i < w.length; ) {
          const first = get(w[i]) as number;
          const next = get(w[i + 1]);
          if (Array.isArray(next)) {
            next.forEach((v, k) => widths.set(first + k, Number(get(v)) || 0));
            i += 2;
          } else {
            const last = Number(next),
              val = Number(get(w[i + 2]));
            for (let c = first; c <= last && c - first < 65536; c++) widths.set(c, val);
            i += 3;
          }
        }
      width = (c) => widths.get(c) ?? dw;
    } else {
      const fc = Number(get(d.FirstChar)) || 0;
      const ws = get(d.Widths);
      if (Array.isArray(ws)) width = (c) => Number(get(ws[c - fc])) || 500;
    }
    const font: Font = { map, bytes: bytesPer, width, simple: !type0 };
    fontCache.set(ref, font);
    return font;
  };

  const out: PdfText[] = [];
  pages.forEach((page, pi) => {
    // Recursos heredados del padre si la página no los trae.
    let res = dictOf(page.Resources);
    if (!Object.keys(res).length) res = dictOf(dictOf(page.Parent).Resources);
    const fonts = dictOf(res.Font);
    const contents = get(page.Contents);
    const parts = Array.isArray(contents) ? contents : [page.Contents];
    const chunks = parts.map((p) => streamOf(p as PdfValue));
    const total = chunks.reduce((n, c) => n + c.length + 1, 0);
    const data = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      data.set(c, off);
      off += c.length;
      data[off++] = 0x0a;
    }
    runContent(data, pi + 1, (n) => (fonts[n] !== undefined ? loadFont(fonts[n]) : null), out);
  });
  return out;
}

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

function runContent(data: Uint8Array, page: number, fontFor: (n: string) => Font | null, out: PdfText[]) {
  const lx = new Lexer(data);
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  let tm: M = [1, 0, 0, 1, 0, 0];
  let tlm: M = [1, 0, 0, 1, 0, 0];
  let font: Font | null = null;
  let size = 12;
  let leading = 0,
    charSpace = 0,
    wordSpace = 0,
    hScale = 1;
  let args: PdfValue[] = [];
  const show = (s: string) => {
    if (!font) font = { map: new Map(), bytes: 1, width: () => 500, simple: true };
    let text = "";
    let adv = 0;
    for (let i = 0; i + font.bytes <= s.length; i += font.bytes) {
      let code = 0;
      for (let k = 0; k < font.bytes; k++) code = code * 256 + s.charCodeAt(i + k);
      const t = font.map.get(code) ?? (font.simple ? (WIN_ANSI[code] ?? String.fromCharCode(code)) : "");
      text += t;
      adv += (font.width(code) / 1000) * size + charSpace + (t === " " && font.bytes === 1 ? wordSpace : 0);
    }
    adv *= hScale;
    const m = mul(tm, ctm);
    const scale = Math.hypot(m[2], m[3]) || 1;
    const sx = Math.hypot(m[0], m[1]) || 1;
    if (text.trim()) out.push({ page, x: m[4], y: m[5], w: adv * sx, size: size * scale, text });
    tm = mul([1, 0, 0, 1, adv, 0], tm);
  };
  for (;;) {
    const v = lx.value();
    if (v === undefined) break;
    if (typeof v !== "string" || !v.startsWith("op:")) {
      args.push(v);
      continue;
    }
    const op = v.slice(3);
    const num = (i: number) => Number(args[i]) || 0;
    switch (op) {
      case "q":
        stack.push(ctm);
        break;
      case "Q":
        ctm = stack.pop() ?? ctm;
        break;
      case "cm":
        ctm = mul([num(0), num(1), num(2), num(3), num(4), num(5)], ctm);
        break;
      case "BT":
        tm = tlm = [1, 0, 0, 1, 0, 0];
        break;
      case "Tf":
        font = args[0] instanceof PdfName ? fontFor(args[0].name) : null;
        size = num(1);
        break;
      case "TL":
        leading = num(0);
        break;
      case "Tc":
        charSpace = num(0);
        break;
      case "Tw":
        wordSpace = num(0);
        break;
      case "Tz":
        hScale = num(0) / 100;
        break;
      case "Tm":
        tm = tlm = [num(0), num(1), num(2), num(3), num(4), num(5)];
        break;
      case "Td":
        tm = tlm = mul([1, 0, 0, 1, num(0), num(1)], tlm);
        break;
      case "TD":
        leading = -num(1);
        tm = tlm = mul([1, 0, 0, 1, num(0), num(1)], tlm);
        break;
      case "T*":
        tm = tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        break;
      case "Tj":
        if (typeof args[0] === "string") show(args[0]);
        break;
      case "'":
        tm = tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        if (typeof args[0] === "string") show(args[0]);
        break;
      case '"':
        wordSpace = num(0);
        charSpace = num(1);
        tm = tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        if (typeof args[2] === "string") show(args[2]);
        break;
      case "TJ": {
        const arr = Array.isArray(args[0]) ? args[0] : [];
        for (const item of arr) {
          if (typeof item === "string") show(item);
          else if (typeof item === "number") tm = mul([1, 0, 0, 1, (-item / 1000) * size * hScale, 0], tm);
        }
        break;
      }
      case "BI": {
        // Imagen en línea: se salta hasta "EI".
        const end = indexOf(data, "EI", lx.pos);
        lx.pos = end < 0 ? data.length : end + 2;
        break;
      }
    }
    args = [];
  }
}

/** Renglones visuales: piezas de texto en la misma altura, unidas de izquierda a derecha. */
export type PdfLine = { page: number; x: number; y: number; text: string; end: number };
export function pdfLines(items: PdfText[], gap = 6): PdfLine[] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const rows: PdfText[][] = [];
  for (const it of sorted) {
    const row = rows.at(-1);
    if (row && row[0].page === it.page && Math.abs(row[0].y - it.y) <= Math.max(1.5, it.size * 0.25)) row.push(it);
    else rows.push([it]);
  }
  const lines: PdfLine[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cur: PdfLine | null = null;
    for (const it of row) {
      if (cur && it.x - cur.end <= gap) {
        const space = it.x - cur.end > it.size * 0.12 && !cur.text.endsWith(" ") && !it.text.startsWith(" ");
        cur.text += (space ? " " : "") + it.text;
        cur.end = Math.max(cur.end, it.x + it.w);
      } else {
        if (cur) lines.push(cur);
        cur = { page: it.page, x: it.x, y: it.y, text: it.text, end: it.x + it.w };
      }
    }
    if (cur) lines.push(cur);
  }
  return lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() })).filter((l) => l.text);
}
