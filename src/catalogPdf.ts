// 2.1 · Catálogo para clientes: PDF con fotos y precios, y mensaje de WhatsApp.
// Los precios son los que paga el cliente (tu precio + la comisión que absorbe).
import { money } from "./business";
import { base64ToBytes } from "./photos";
import { PdfDoc, jpegSize, wrap, type PdfImage } from "./pdf";

export type CatalogItem = { id: string; name: string; segment: string; price: number; tag?: string; imageKey?: string; imageBase64?: string | null };
export type CatalogInfo = { store: string; whatsapp?: string; note?: string; date: string };

const NAVY: [number, number, number] = [0.09, 0.2, 0.3];
const MUTED: [number, number, number] = [0.4, 0.45, 0.5];
const RED: [number, number, number] = [0.75, 0.17, 0.17];

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
    out.push(`• ${it.name} — ${money(it.price)}${it.tag ? ` 🏷️ ${it.tag}` : ""}`);
  }
  out.push("");
  if (info.note) out.push(info.note);
  if (info.whatsapp) out.push(`Pedidos por WhatsApp: ${prettyPhone(info.whatsapp)}`);
  out.push("Precios sujetos a cambio y a existencias.");
  return out.join("\n");
}

/** PDF A4: 3 columnas × 4 renglones de productos por página, con encabezado y pie. */
export function catalogPdf(items: CatalogItem[], info: CatalogInfo): Uint8Array {
  const doc = new PdfDoc();
  const M = 32,
    GAP = 10,
    COLS = 3,
    ROWS = 4;
  const cardW = (doc.W - M * 2 - GAP * (COLS - 1)) / COLS;
  const top = 108,
    bottom = 40;
  const cardH = (doc.H - top - bottom - GAP * (ROWS - 1)) / ROWS;
  const perPage = COLS * ROWS;
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const images = new Map<string, PdfImage | null>();
  const imageOf = (it: CatalogItem): PdfImage | null => {
    const key = it.imageKey || it.id;
    if (images.has(key)) return images.get(key)!;
    let img: PdfImage | null = null;
    if (it.imageBase64) {
      const bytes = base64ToBytes(it.imageBase64);
      const size = jpegSize(bytes);
      if (size) img = { id: "Im" + (images.size + 1), ...size, bytes };
    }
    images.set(key, img);
    return img;
  };
  for (let page = 0; page < pages; page++) {
    doc.addPage();
    doc.rect(0, 0, doc.W, 84, { fill: NAVY });
    doc.text(M, 40, info.store, 22, { bold: true, color: [1, 1, 1] });
    doc.text(M, 62, `Catálogo de productos · ${info.date}`, 11, { color: [0.85, 0.9, 0.95] });
    if (info.whatsapp) doc.text(M, 62, `Pedidos por WhatsApp: ${prettyPhone(info.whatsapp)}`, 11, { bold: true, color: [1, 1, 1], align: "right", width: doc.W - M * 2 });
    if (info.note) doc.text(M, 100, info.note, 9, { color: MUTED });
    items.slice(page * perPage, (page + 1) * perPage).forEach((it, i) => {
      const col = i % COLS,
        row = Math.floor(i / COLS);
      const x = M + col * (cardW + GAP),
        y = top + row * (cardH + GAP);
      doc.rect(x, y, cardW, cardH, { stroke: [0.85, 0.88, 0.9] });
      const imgH = cardH - 70;
      const img = imageOf(it);
      if (img) doc.image(img, x + 8, y + 8, cardW - 16, imgH - 8);
      else {
        doc.rect(x + 8, y + 8, cardW - 16, imgH - 8, { fill: [0.95, 0.96, 0.97] });
        doc.text(x + 8, y + imgH / 2 + 6, it.segment || "Producto", 10, { color: MUTED, align: "center", width: cardW - 16 });
      }
      let ty = y + imgH + 10;
      doc.text(x + 8, ty, it.segment.toUpperCase(), 7, { color: MUTED });
      for (const line of wrap(it.name, 9, cardW - 16, 2, true)) {
        ty += 11;
        doc.text(x + 8, ty, line, 9, { bold: true });
      }
      doc.text(x + 8, y + cardH - 10, money(it.price), 14, { bold: true, color: NAVY });
      if (it.tag) doc.text(x + 8, y + cardH - 10, `PROMO ${it.tag}`, 9, { bold: true, color: RED, align: "right", width: cardW - 16 });
    });
    doc.text(M, doc.H - 18, "Precios sujetos a cambio y a existencias.", 8, { color: MUTED });
    doc.text(M, doc.H - 18, `${page + 1} / ${pages}`, 8, { color: MUTED, align: "right", width: doc.W - M * 2 });
  }
  return doc.build(`${info.store} · Catálogo`);
}
