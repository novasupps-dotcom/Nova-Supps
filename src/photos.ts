// Fotos de productos: se guardan como archivos dentro de la app (no en la base)
// y las JPG se reducen a ~1024 px antes de guardarse. Todo en JavaScript: no
// requiere módulos nativos nuevos.
import * as FS from "expo-file-system/legacy";
import { decode as decodeJpeg, encode as encodeJpeg } from "jpeg-js";
import type { Business, Row } from "./business";

export const MAX_SIDE = 1024;
export const QUALITY = 78;
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const MAX_RAW_BYTES = 1024 * 1024;

// ---------- base64 ----------
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < ALPHA.length; i++) LOOKUP[ALPHA.charCodeAt(i)] = i;
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)],
      b = LOOKUP[clean.charCodeAt(i + 1)],
      c = LOOKUP[clean.charCodeAt(i + 2)],
      d = LOOKUP[clean.charCodeAt(i + 3)];
    if (p < len) out[p++] = (a << 2) | (b >> 4);
    if (p < len) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < len) out[p++] = ((c & 3) << 6) | d;
  }
  return out;
}
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i],
      b = i + 1 < bytes.length ? bytes[i + 1] : 0,
      c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    chunk += ALPHA[a >> 2] + ALPHA[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? ALPHA[((b & 15) << 2) | (c >> 6)] : "=") + (i + 2 < bytes.length ? ALPHA[c & 63] : "=");
    if (chunk.length > 8192) {
      parts.push(chunk);
      chunk = "";
    }
  }
  parts.push(chunk);
  return parts.join("");
}

// ---------- JPG ----------
/** Orientación EXIF (1–8) de un JPG; 1 si no tiene. */
export function exifOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let off = 2;
  while (off + 4 < bytes.length) {
    if (bytes[off] !== 0xff) return 1;
    const marker = bytes[off + 1];
    const size = (bytes[off + 2] << 8) | bytes[off + 3];
    if (marker === 0xda) return 1; // inicio de la imagen: ya no hay EXIF
    if (marker === 0xe1 && bytes[off + 4] === 0x45 && bytes[off + 5] === 0x78 && bytes[off + 6] === 0x69 && bytes[off + 7] === 0x66) {
      const tiff = off + 10;
      const little = bytes[tiff] === 0x49;
      const u16 = (p: number) => (little ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1]);
      const u32 = (p: number) => (little ? (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16)) + bytes[p + 3] * 0x1000000 : bytes[p] * 0x1000000 + ((bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]));
      const ifd = tiff + u32(tiff + 4);
      const count = u16(ifd);
      for (let i = 0; i < count; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > bytes.length) break;
        if (u16(e) === 0x0112) {
          const v = u16(e + 8);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    off += 2 + size;
  }
  return 1;
}
/**
 * Reduce un RGBA a un lado máximo `maxSide` aplicando la orientación EXIF
 * (para que la foto no quede de lado). Promedia una muestra de hasta 3×3 píxeles.
 */
export function resizeOriented(src: Uint8Array, W: number, H: number, orientation: number, maxSide: number) {
  const swap = orientation >= 5;
  const OW = swap ? H : W,
    OH = swap ? W : H;
  const scale = Math.max(1, Math.max(OW, OH) / maxSide);
  const tw = Math.max(1, Math.round(OW / scale)),
    th = Math.max(1, Math.round(OH / scale));
  const out = new Uint8Array(tw * th * 4);
  const steps = Math.min(3, Math.max(1, Math.floor(scale)));
  const map = (u: number, v: number) => {
    let x = u,
      y = v;
    switch (orientation) {
      case 2: x = W - 1 - u; y = v; break;
      case 3: x = W - 1 - u; y = H - 1 - v; break;
      case 4: x = u; y = H - 1 - v; break;
      case 5: x = v; y = u; break;
      case 6: x = v; y = H - 1 - u; break;
      case 7: x = W - 1 - v; y = H - 1 - u; break;
      case 8: x = W - 1 - v; y = u; break;
    }
    return (y * W + x) * 4;
  };
  for (let ty = 0; ty < th; ty++) {
    const v0 = ty * scale;
    for (let tx = 0; tx < tw; tx++) {
      const u0 = tx * scale;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let sy = 0; sy < steps; sy++) {
        const v = Math.min(OH - 1, Math.floor(v0 + ((sy + 0.5) * scale) / steps));
        for (let sx = 0; sx < steps; sx++) {
          const u = Math.min(OW - 1, Math.floor(u0 + ((sx + 0.5) * scale) / steps));
          const i = map(u, v);
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          n++;
        }
      }
      const o = (ty * tw + tx) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: tw, height: th };
}
/** JPG (base64) → JPG reducido y orientado (base64). */
export function compressJpegBase64(b64: string, maxSide = MAX_SIDE, quality = QUALITY): string {
  const bytes = base64ToBytes(b64);
  const orientation = exifOrientation(bytes);
  const img = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 400, maxResolutionInMP: 60 } as any);
  const small = resizeOriented(img.data as Uint8Array, img.width, img.height, orientation, maxSide);
  // jpeg-js devuelve Buffer.from(...); Hermes no tiene Buffer: se presta uno mínimo solo durante la llamada.
  const g = globalThis as any;
  const hadBuffer = typeof g.Buffer !== "undefined";
  if (!hadBuffer) g.Buffer = { from: (a: ArrayLike<number>) => Uint8Array.from(a) };
  try {
    const encoded = encodeJpeg(small as any, quality);
    return bytesToBase64(encoded.data instanceof Uint8Array ? encoded.data : Uint8Array.from(encoded.data as any));
  } finally {
    if (!hadBuffer) delete g.Buffer;
  }
}

// ---------- archivos ----------
export const photoDir = () => (FS.documentDirectory || "") + "fotos/";
const isOwnFile = (uri: string) => typeof uri === "string" && uri.startsWith(photoDir());
async function ensureDir() {
  try {
    await FS.makeDirectoryAsync(photoDir(), { intermediates: true });
  } catch {}
}
let seq = 0;
export async function writePhoto(b64: string, ext: string): Promise<string> {
  await ensureDir();
  const uri = `${photoDir()}p-${Date.now().toString(36)}-${(++seq).toString(36)}.${ext}`;
  await FS.writeAsStringAsync(uri, b64, { encoding: FS.EncodingType.Base64 });
  return uri;
}
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Prepara una foto elegida por el usuario: si es JPG la reduce; PNG/WebP solo
 * se aceptan hasta 1 MB. Devuelve la ruta del archivo guardado.
 */
export async function importPhoto(file: { uri: string; mimeType?: string | null; size?: number | null }): Promise<string> {
  const mime = String(file.mimeType || "").toLowerCase();
  const ext = EXT[mime];
  if (!ext) throw new Error("Elige una foto JPG, PNG o WebP.");
  if ((file.size || 0) > MAX_INPUT_BYTES) throw new Error("La foto pesa más de 15 MB. Elige otra o envíatela por WhatsApp primero.");
  const raw = await FS.readAsStringAsync(file.uri, { encoding: FS.EncodingType.Base64 });
  if (ext === "jpg") {
    try {
      return await writePhoto(compressJpegBase64(raw), "jpg");
    } catch {
      if (raw.length * 0.75 > MAX_RAW_BYTES) throw new Error("No se pudo optimizar esta foto. Prueba con una captura de pantalla o una foto enviada por WhatsApp.");
      return writePhoto(raw, "jpg");
    }
  }
  if (raw.length * 0.75 > MAX_RAW_BYTES) throw new Error("Las fotos PNG o WebP deben pesar máximo 1 MB. Las fotos JPG (como las de la cámara) se reducen solas.");
  return writePhoto(raw, ext);
}

/** Pasa a archivos las fotos que aún viven dentro de la base (data:…). Devuelve cuántas movió. */
export async function migratePhotos(b: Business): Promise<number> {
  let moved = 0;
  for (const { id, imageUri } of b.productPhotos()) {
    const m = /^data:(image\/[a-z]+);base64,/.exec(imageUri);
    if (!m) continue;
    try {
      const uri = await writePhoto(imageUri.slice(m[0].length), EXT[m[1]] || "jpg");
      b.setProductPhoto(id, uri);
      moved++;
    } catch {}
  }
  return moved;
}

/** Borra archivos de fotos que ya no usa ningún producto ni borrador. */
export async function removeOrphanPhotos(b: Business): Promise<number> {
  try {
    const used = new Set(b.productPhotos().map((x) => x.imageUri));
    const session = JSON.stringify(b.setting("uiSession", null) || {});
    const files: string[] = await FS.readDirectoryAsync(photoDir());
    let removed = 0;
    for (const name of files) {
      const uri = photoDir() + name;
      if (used.has(uri) || session.includes(name)) continue;
      await FS.deleteAsync(uri, { idempotent: true });
      removed++;
    }
    return removed;
  } catch {
    return 0;
  }
}

/** Para el respaldo: incrusta las fotos (archivo → data:) y así el JSON sirve en otro teléfono. */
export async function inlinePhotos(json: string): Promise<string> {
  const backup = JSON.parse(json);
  const rows: Row[] = backup?.data?.settings ?? [];
  let changed = false;
  for (const row of rows) {
    if (!String(row.key).startsWith("product:")) continue;
    let meta: Row;
    try {
      meta = JSON.parse(row.value);
    } catch {
      continue;
    }
    if (!isOwnFile(meta?.imageUri)) continue;
    try {
      const raw = await FS.readAsStringAsync(meta.imageUri, { encoding: FS.EncodingType.Base64 });
      const ext = String(meta.imageUri).split(".").pop() || "jpg";
      meta.imageUri = `data:${MIME[ext] || "image/jpeg"};base64,${raw}`;
    } catch {
      meta.imageUri = null; // el archivo ya no existe: se respalda sin foto
    }
    row.value = JSON.stringify(meta);
    changed = true;
  }
  return changed ? JSON.stringify(backup, null, 2) : json;
}
