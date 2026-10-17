// 2.1 · Catálogo para clientes: PDF con fotos y precios, y mensaje de WhatsApp.
// 2.5 · PDF con el mismo estilo de la app: letra Inter, tarjetas redondeadas sobre blanco,
// logo centrado, productos agrupados por categoría y todas las fotos disponibles.
// Los precios son los que paga el cliente (tu precio + la comisión que absorbe).
import { money } from "./business";
import { LOGO_JPEG, LOGO_JPEG_SIZE } from "./brandPdf";
import { FONT_DATA, FONT_METRICS } from "./fontData";
import { base64ToBytes } from "./photos";
import { PdfDoc, jpegSize, type PdfImage } from "./pdf";
import type { RgbImage } from "./png";

export type CatalogPhoto = { kind: "jpeg"; base64: string } | { kind: "rgb"; image: RgbImage };
export type CatalogItem = {
  id: string;
  name: string;
  segment: string;
  price: number;
  tag?: string;
  imageKey?: string;
  /** JPG en base64 (compatibilidad). */
  imageBase64?: string | null;
  photo?: CatalogPhoto | null;
  /** Sin existencias: se marca «Agotado». */
  out?: boolean;
};
export type CatalogInfo = { store: string; whatsapp?: string; note?: string; date: string };

type RGB = [number, number, number];
const INK: RGB = [0.11, 0.11, 0.12];
const MUTED: RGB = [0.42, 0.42, 0.44];
const SOFT: RGB = [0.957, 0.957, 0.965];
const LINE: RGB = [0.88, 0.88, 0.9];
const BRAND: RGB = [0.851, 0.145, 0.184];
const WHITE: RGB = [1, 1, 1];

/** "5512345678" → "55 1234 5678". */
export function prettyPhone(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : raw;
}

/** Mensaje de WhatsApp con el catálogo agrupado por categoría. */
export function catalogText(items: CatalogItem[], info: CatalogInfo): string {
  const out = [`*${info.store}* · Catálogo ${info.date}`, ""];
  let seg = "";
  for (const it of items) {
    if (it.segment !== seg) {
      if (seg) out.push("");
      seg = it.segment;
      out.push(`*${seg}*`);
    }
    out.push(`• ${it.name} — ${money(it.price)}${it.tag ? ` 🏷️ ${it.tag}` : ""}${it.out ? " (agotado)" : ""}`);
  }
  out.push("");
  if (info.note) out.push(info.note);
  if (info.whatsapp) out.push(`Pedidos por WhatsApp: ${prettyPhone(info.whatsapp)}`);
  out.push("Precios sujetos a cambio y a existencias.");
  return out.join("\n");
}

/** PDF A4 con portada breve, secciones por categoría y 3 tarjetas por renglón. */
export function catalogPdf(items: CatalogItem[], info: CatalogInfo): Uint8Array {
  const doc = new PdfDoc();
  const fonts: Record<string, string> = { R: "Inter-Regular", M: "Inter-Medium", S: "Inter-SemiBold", B: "Inter-Bold", D: "InterDisplay-Bold" };
  for (const [key, name] of Object.entries(fonts))
    if (FONT_DATA[name] && FONT_METRICS[name]) doc.addFont(key, name, base64ToBytes(FONT_DATA[name]), FONT_METRICS[name]);
  const logo: PdfImage = { id: "Logo", ...LOGO_JPEG_SIZE, bytes: base64ToBytes(LOGO_JPEG) };
  const M = 36,
    GAP = 12,
    COLS = 3;
  const W = doc.W,
    H = doc.H;
  const cardW = (W - M * 2 - GAP * (COLS - 1)) / COLS;
  const PHOTO = 132;
  const cardH = 8 + PHOTO + 12 + 26 + 22 + 10;
  const bottom = H - 58;
  const images = new Map<string, PdfImage | null>();
  const imageOf = (it: CatalogItem): PdfImage | null => {
    const key = it.imageKey || it.id;
    if (images.has(key)) return images.get(key)!;
    const id = "Im" + (images.size + 1);
    let img: PdfImage | null = null;
    const photo: CatalogPhoto | null = it.photo || (it.imageBase64 ? { kind: "jpeg", base64: it.imageBase64 } : null);
    if (photo?.kind === "jpeg") {
      const bytes = base64ToBytes(photo.base64);
      const size = jpegSize(bytes);
      if (size) img = { id, ...size, bytes };
    } else if (photo?.kind === "rgb") img = { id, width: photo.image.width, height: photo.image.height, bytes: photo.image.rgb, kind: "rgb" };
    images.set(key, img);
    return img;
  };

  let y = 0;
  const footer = () => {
    doc.hline(M, H - 44, W - M * 2, LINE);
    doc.text(M, H - 28, `${info.store}  ·  Precios sujetos a cambio y a existencias`, 8, { font: "R", color: MUTED });
  };
  const newPage = (first = false) => {
    doc.addPage();
    footer();
    if (first) {
      const lw = 168,
        lh = (lw * logo.height) / logo.width;
      doc.image(logo, (W - lw) / 2, 34, lw, lh);
      let ty = 34 + lh + 34;
      doc.text(M, ty, "Catálogo de productos", 24, { font: "D", color: INK, align: "center", width: W - M * 2 });
      ty += 20;
      doc.text(M, ty, `${info.date}  ·  ${items.length} ${items.length === 1 ? "producto" : "productos"}`, 10.5, { font: "R", color: MUTED, align: "center", width: W - M * 2 });
      ty += 14;
      if (info.whatsapp) {
        const label = `Pedidos por WhatsApp  ·  ${prettyPhone(info.whatsapp)}`;
        const pw = doc.measure(label, 10, { font: "S" }) + 32;
        doc.rect((W - pw) / 2, ty, pw, 26, { fill: SOFT, radius: 13 });
        doc.text(M, ty + 17, label, 10, { font: "S", color: INK, align: "center", width: W - M * 2 });
        ty += 36;
      }
      if (info.note) {
        for (const line of doc.wrap(info.note, 10, W - M * 4, 2, { font: "R" })) {
          ty += 4;
          doc.text(M, ty + 10, line, 10, { font: "R", color: MUTED, align: "center", width: W - M * 2 });
          ty += 12;
        }
        ty += 6;
      }
      y = ty + 18;
    } else {
      const lh = 30,
        lw = (lh * logo.width) / logo.height;
      doc.image(logo, M, 24, lw, lh);
      doc.text(M, 46, `Catálogo  ·  ${info.date}`, 9, { font: "R", color: MUTED, align: "right", width: W - M * 2 });
      doc.hline(M, 66, W - M * 2, LINE);
      y = 88;
    }
  };
  const sectionHeader = (name: string, count: number, cont = false) => {
    const label = name.toUpperCase();
    doc.text(M + 2, y + 10, label, 10.5, { font: "S", color: INK, tracking: 0.8 });
    const lw = doc.measure(label, 10.5, { font: "S", tracking: 0.8 });
    doc.text(M + 2 + lw + 10, y + 10, cont ? "continúa" : `${count} ${count === 1 ? "producto" : "productos"}`, 9, { font: "R", color: MUTED });
    y += 24;
  };
  const card = (it: CatalogItem, x: number, top: number) => {
    doc.rect(x, top, cardW, cardH, { fill: SOFT, radius: 16 });
    const px = x + 8,
      pw = cardW - 16;
    doc.rect(px, top + 8, pw, PHOTO, { fill: WHITE, radius: 12 });
    const img = imageOf(it);
    if (img) doc.image(img, px + 8, top + 16, pw - 16, PHOTO - 16);
    else doc.text(px, top + 8 + PHOTO / 2 + 4, it.segment || "Producto", 9.5, { font: "M", color: MUTED, align: "center", width: pw });
    const badge = it.out ? "AGOTADO" : it.tag ? `PROMO ${it.tag}`.toUpperCase() : "";
    if (badge) {
      const bw = doc.measure(badge, 7, { font: "B", tracking: 0.4 }) + 14;
      doc.rect(px + 7, top + 15, bw, 15, { fill: it.out ? MUTED : BRAND, radius: 7.5 });
      doc.text(px + 14, top + 25.4, badge, 7, { font: "B", color: WHITE, tracking: 0.4 });
    }
    let ty = top + 8 + PHOTO + 15;
    for (const line of doc.wrap(it.name, 9.5, pw, 2, { font: "M" })) {
      doc.text(px, ty, line, 9.5, { font: "M", color: INK });
      ty += 12.5;
    }
    doc.text(px, top + cardH - 13, money(it.price), 13.5, { font: "B", color: it.out ? MUTED : INK });
  };

  newPage(true);
  const groups: { name: string; list: CatalogItem[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.name === it.segment) last.list.push(it);
    else groups.push({ name: it.segment, list: [it] });
  }
  for (const g of groups) {
    if (y + 24 + cardH > bottom) newPage();
    sectionHeader(g.name, g.list.length);
    for (let i = 0; i < g.list.length; i += COLS) {
      if (y + cardH > bottom) {
        newPage();
        sectionHeader(g.name, g.list.length, true);
      }
      g.list.slice(i, i + COLS).forEach((it, c) => card(it, M + c * (cardW + GAP), y));
      y += cardH + GAP;
    }
    y += 10;
  }
  if (!items.length) doc.text(M, y + 20, "Sin productos para mostrar.", 11, { font: "R", color: MUTED, align: "center", width: W - M * 2 });
  const total = doc.pageCount;
  for (let i = 0; i < total; i++) {
    doc.setPage(i);
    doc.text(M, H - 28, `${i + 1} / ${total}`, 8, { font: "R", color: MUTED, align: "right", width: W - M * 2 });
  }
  return doc.build(`${info.store} · Catálogo`);
}
