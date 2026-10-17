// 2.5 · PNG → píxeles RGB sobre fondo blanco (para el PDF del catálogo). Fotos de productos
// con fondo transparente: el blanco evita que se vean negras. Sin módulos nativos.
import { unzlibSync } from "fflate";

export type RgbImage = { width: number; height: number; rgb: Uint8Array };

export const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** Decodifica un PNG de 8 bits (gris, RGB, paleta, con o sin transparencia, sin entrelazar). */
export function decodePng(bytes: Uint8Array): RgbImage | null {
  if (!isPng(bytes)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8,
    width = 0,
    height = 0,
    depth = 0,
    type = 0,
    interlace = 0;
  let palette: Uint8Array | null = null,
    trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos + 8 <= bytes.length) {
    const len = dv.getUint32(pos);
    const name = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (name === "IHDR") {
      width = dv.getUint32(pos + 8);
      height = dv.getUint32(pos + 12);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (name === "PLTE") palette = data;
    else if (name === "tRNS") trns = data;
    else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") break;
    pos += 12 + len;
  }
  if (!width || !height || depth !== 8 || interlace || width * height > 16_000_000) return null;
  const channels = type === 0 ? 1 : type === 2 ? 3 : type === 3 ? 1 : type === 4 ? 2 : type === 6 ? 4 : 0;
  if (!channels || (type === 3 && !palette)) return null;
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of idat) {
    joined.set(c, o);
    o += c.length;
  }
  let raw: Uint8Array;
  try {
    raw = unzlibSync(joined);
  } catch {
    return null;
  }
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const out = new Uint8Array(width * height * 3);
  let prev = new Uint8Array(stride);
  let line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      let r: number, g: number, bl: number, al = 255;
      if (type === 0 || type === 4) {
        r = g = bl = line[x * channels];
        if (type === 4) al = line[x * channels + 1];
      } else if (type === 3) {
        const idx = line[x];
        r = palette![idx * 3];
        g = palette![idx * 3 + 1];
        bl = palette![idx * 3 + 2];
        if (trns && idx < trns.length) al = trns[idx];
      } else {
        r = line[x * channels];
        g = line[x * channels + 1];
        bl = line[x * channels + 2];
        if (type === 6) al = line[x * channels + 3];
      }
      // Sobre blanco.
      const k = (x + y * width) * 3;
      out[k] = (r * al + 255 * (255 - al)) / 255;
      out[k + 1] = (g * al + 255 * (255 - al)) / 255;
      out[k + 2] = (bl * al + 255 * (255 - al)) / 255;
    }
    const t = prev;
    prev = line;
    line = t;
  }
  return { width, height, rgb: out };
}

/** Reduce una imagen RGB promediando bloques (lado mayor ≤ maxSide). */
export function shrinkRgb(img: RgbImage, maxSide: number): RgbImage {
  const scale = Math.max(img.width, img.height) / maxSide;
  if (scale <= 1) return img;
  const w = Math.max(1, Math.round(img.width / scale)),
    h = Math.max(1, Math.round(img.height / scale));
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * scale),
      y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * scale)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * scale),
        x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * scale)));
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const k = (yy * img.width + xx) * 3;
          r += img.rgb[k];
          g += img.rgb[k + 1];
          b += img.rgb[k + 2];
          n++;
        }
      const o = (y * w + x) * 3;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return { width: w, height: h, rgb: out };
}
