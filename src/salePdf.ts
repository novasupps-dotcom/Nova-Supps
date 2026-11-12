// 2.11 · Comprobante de venta en PDF: logo, productos con foto, fecha y hora, totales y
// el detalle del cobro (efectivo con lo que pagó y el cambio; tarjeta con la operación de
// la terminal, últimos 4 dígitos y si es crédito o débito; transferencia con cuenta,
// emisor y receptor). Sin módulos nativos: usa el mismo generador que el catálogo.
import { money, type Row } from "./business";
import { LOGO_JPEG, LOGO_JPEG_SIZE } from "./brandPdf";
import type { CatalogPhoto } from "./catalogPdf";
import { FONT_DATA, FONT_METRICS } from "./fontData";
import { PdfDoc, jpegSize, type PdfImage } from "./pdf";
import { BRANDS_LABEL, type CardInfo } from "./receipt";
import type { TransferAccount } from "./transfer";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;
/** Base64 → bytes (local: así este módulo no depende de expo y se prueba en Node). */
function base64ToBytes(b64: string): Uint8Array {
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

type RGB = [number, number, number];
const INK: RGB = [0.11, 0.11, 0.12];
const MUTED: RGB = [0.42, 0.42, 0.44];
const SOFT: RGB = [0.957, 0.957, 0.965];
const LINE: RGB = [0.88, 0.88, 0.9];
const GREEN: RGB = [0.12, 0.48, 0.24];
const WHITE: RGB = [1, 1, 1];

export type SalePdfLine = { name: string; qty: number; unit: number; total: number; photo?: CatalogPhoto | null };
export type SalePayment =
  | { kind: "Efectivo"; account: string; amount: number; given: number | null }
  | { kind: "Tarjeta"; account: string; amount: number; card: CardInfo | null; terminal: boolean }
  | { kind: "Transferencia"; account: string; amount: number; from: string; to: string }
  | { kind: "Otro"; account: string; amount: number };
export type SalePdfInfo = {
  store: string;
  folio: string;
  when: Date;
  customer: string;
  seller: string;
  channel: string;
  lines: SalePdfLine[];
  subtotal: number;
  discount: number;
  commission: number;
  total: number;
  payments: SalePayment[];
  balance: number;
};

const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const two = (n: number) => String(n).padStart(2, "0");
/** «Martes 11 de noviembre de 2026 · 14:05 h». */
export function longDate(d: Date): string {
  const day = DAYS[d.getDay()];
  return `${day[0].toUpperCase()}${day.slice(1)} ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()} · ${two(d.getHours())}:${two(d.getMinutes())} h`;
}

/** Tarjeta legible: «Visa · Débito». */
export function cardKind(card: CardInfo | null): { brand: string; type: string } {
  const brandRaw = String(card?.brand || "").toLowerCase();
  const brand = BRANDS_LABEL[brandRaw] || (brandRaw ? brandRaw.replace(/^\w/, (x) => x.toUpperCase()) : "Tarjeta");
  const t = String(card?.type || "").toLowerCase();
  const type = /deb|prepaid/.test(t) || /^deb/.test(brandRaw) ? "Débito" : /cred/.test(t) ? "Crédito" : "";
  return { brand, type };
}

/** Renglones del detalle del cobro (también sirven para el texto del comprobante). */
export function paymentLines(p: SalePayment): [string, string][] {
  if (p.kind === "Efectivo") {
    const out: [string, string][] = [["Forma de pago", "Efectivo"], ["Importe cobrado", money(p.amount)]];
    if (p.given && p.given > p.amount) out.push(["Pagó con", money(p.given)], ["Cambio entregado", money(p.given - p.amount)]);
    else out.push(["Pagó con", p.given && p.given < p.amount ? money(p.given) : `${money(p.amount)} (exacto)`], ["Cambio", "Sin cambio · pago exacto"]);
    return out;
  }
  if (p.kind === "Tarjeta") {
    const { brand, type } = cardKind(p.card);
    return [
      ["Forma de pago", `Tarjeta${type ? ` de ${type.toLowerCase()}` : ""}${p.terminal ? " · terminal Mercado Pago" : ""}`],
      ["Importe cobrado", money(p.amount)],
      ["Tarjeta", `${brand}${p.card?.last4 ? ` •••• ${p.card.last4}` : ""}`],
      ["Tipo", type || "No informado"],
      ["No. de transacción", p.card?.operation || "No informado"],
      ...(p.card?.authorization ? ([["Autorización", p.card.authorization]] as [string, string][]) : []),
    ];
  }
  if (p.kind === "Transferencia")
    return [
      ["Forma de pago", "Transferencia"],
      ["Importe cobrado", money(p.amount)],
      ["Cuenta", p.account],
      ["Emisor (quién paga)", p.from || "No informado"],
      ["Receptor", p.to || p.account],
    ];
  return [["Forma de pago", p.account], ["Importe cobrado", money(p.amount)]];
}

/** Datos de transferencia del receptor: «Mercado Pago · Juan Pérez · CLABE ••• 1234». */
export function receiverLabel(account: string, list: TransferAccount[], accountId: string): string {
  const t = list.find((x) => x.accountId === accountId) || list.find((x) => x.label === account || x.bank === account);
  if (!t) return account;
  const tail = (x: string) => String(x || "").replace(/\D/g, "").slice(-4);
  const ref = t.clabe ? `CLABE ••• ${tail(t.clabe)}` : t.account ? `Cuenta ••• ${tail(t.account)}` : t.card ? `Tarjeta ••• ${tail(t.card)}` : "";
  return [t.bank || t.label || account, t.holder, ref].filter(Boolean).join(" · ");
}

/** Arma los datos del comprobante a partir de `saleDetail` (sin fotos; se agregan aparte). */
export function salePdfInfo(
  v: Row,
  opts: { store: string; accounts: Row[]; products: Map<string, Row>; transferAccounts: TransferAccount[] },
): SalePdfInfo {
  const commission = Number(v.commission) > 0 ? Number(v.commission) : 0;
  const lines: SalePdfLine[] = (v.lines as Row[]).map((l) => {
    const unit = Number.isFinite(Number(l.unitPrice)) && l.unitPrice !== undefined ? Number(l.unitPrice) : Number(opts.products.get(l.productId)?.price) || 0;
    return { name: String(l.name), qty: Number(l.qty), unit, total: unit * Number(l.qty) };
  });
  const subtotal = lines.reduce((n, l) => n + l.total, 0);
  const goods = Math.max(0, Number(v.total) - commission);
  const kindOf = (id: string) => opts.accounts.find((a) => a.id === id)?.kind || "";
  const mp: Row[] = Array.isArray(v.mpPayments) ? v.mpPayments : [];
  const payments: SalePayment[] = (v.movements as Row[])
    .filter((x) => x.kind === "sale" && x.amount > 0)
    .map((x): SalePayment => {
      const kind = kindOf(x.accountId);
      if (kind === "Efectivo") return { kind: "Efectivo", account: x.account, amount: x.amount, given: Number(v.cashGiven) || null };
      if (kind === "Tarjeta") {
        const fromMp = mp.find((e) => e.card && (e.card.last4 || e.card.operation))?.card as CardInfo | undefined;
        const manual = v.cardManual as Row | undefined;
        const card: CardInfo | null = fromMp
          ? { ...fromMp, operation: fromMp.operation || v.mpPaymentId || undefined }
          : manual
            ? { last4: manual.last4 || undefined, type: manual.type === "Crédito" ? "credit_card" : manual.type === "Débito" ? "debit_card" : undefined, operation: manual.operation || undefined }
            : v.mpPaymentId
              ? { operation: String(v.mpPaymentId) }
              : null;
        return { kind: "Tarjeta", account: x.account, amount: x.amount, card, terminal: !!(fromMp || v.mpOrderId) };
      }
      if (kind === "Banco" || kind === "Billetera")
        return { kind: "Transferencia", account: x.account, amount: x.amount, from: String(v.transferFrom || ""), to: receiverLabel(x.account, opts.transferAccounts, x.accountId) };
      return { kind: "Otro", account: x.account, amount: x.amount };
    });
  const paid = payments.reduce((n, p) => n + p.amount, 0);
  return {
    store: opts.store,
    folio: String(v.folio || String(v.id).slice(-8).toUpperCase()),
    when: new Date(v.created),
    customer: String(v.customer || "Público en general"),
    seller: String(v.seller || "Dueño"),
    channel: String(v.channel || "Mostrador"),
    lines,
    subtotal,
    discount: Math.max(0, subtotal - goods),
    commission,
    total: Number(v.total),
    payments,
    balance: Math.max(0, Number(v.total) - paid),
  };
}

/** PDF de una página (o más, si hay muchos productos). */
export function salePdf(info: SalePdfInfo): Uint8Array {
  const doc = new PdfDoc();
  const fonts: Record<string, string> = { R: "Inter-Regular", M: "Inter-Medium", S: "Inter-SemiBold", B: "Inter-Bold", D: "InterDisplay-Bold" };
  for (const [key, name] of Object.entries(fonts))
    if (FONT_DATA[name] && FONT_METRICS[name]) doc.addFont(key, name, base64ToBytes(FONT_DATA[name]), FONT_METRICS[name]);
  const logo: PdfImage = { id: "Logo", ...LOGO_JPEG_SIZE, bytes: base64ToBytes(LOGO_JPEG) };
  const W = doc.W,
    H = doc.H,
    M = 48,
    CW = W - M * 2;
  const bottom = H - 70;
  let y = 0;
  let imgN = 0;
  const imageOf = (photo?: CatalogPhoto | null): PdfImage | null => {
    if (!photo) return null;
    const id = "P" + ++imgN;
    if (photo.kind === "jpeg") {
      const bytes = base64ToBytes(photo.base64);
      const size = jpegSize(bytes);
      return size ? { id, ...size, bytes } : null;
    }
    return { id, width: photo.image.width, height: photo.image.height, bytes: photo.image.rgb, kind: "rgb" };
  };
  const footer = () => {
    doc.hline(M, H - 50, CW, LINE);
    doc.text(M, H - 34, `${info.store}  ·  Gracias por tu compra`, 8.5, { font: "R", color: MUTED, align: "center", width: CW });
  };
  const page = (first: boolean) => {
    doc.addPage();
    footer();
    if (first) {
      const lw = 130,
        lh = (lw * logo.height) / logo.width;
      doc.image(logo, (W - lw) / 2, 30, lw, lh);
      y = 30 + lh + 26;
      doc.text(M, y, "Comprobante de venta", 20, { font: "D", color: INK, align: "center", width: CW });
      y += 18;
      doc.text(M, y, `Folio ${info.folio}  ·  ${longDate(info.when)}`, 10, { font: "R", color: MUTED, align: "center", width: CW });
      y += 22;
      doc.rect(M, y, CW, 44, { fill: SOFT, radius: 12 });
      const col = CW / 3;
      [
        ["Cliente", info.customer],
        ["Vendió", info.seller],
        ["Canal", info.channel],
      ].forEach(([k, val], i) => {
        doc.text(M + 14 + col * i, y + 17, k.toUpperCase(), 7.5, { font: "S", color: MUTED, tracking: 0.5 });
        doc.text(M + 14 + col * i, y + 33, doc.wrap(val, 10.5, col - 22, 1, { font: "M" })[0] || "", 10.5, { font: "M", color: INK });
      });
      y += 62;
    } else {
      const lh = 26,
        lw = (lh * logo.width) / logo.height;
      doc.image(logo, M, 26, lw, lh);
      doc.text(M, 44, `Folio ${info.folio} · continúa`, 9, { font: "R", color: MUTED, align: "right", width: CW });
      y = 74;
    }
  };
  const need = (h: number) => {
    if (y + h > bottom) page(false);
  };

  page(true);
  // Productos
  doc.text(M, y, "PRODUCTOS", 9, { font: "S", color: MUTED, tracking: 0.8 });
  y += 10;
  const ROW = 70;
  for (const l of info.lines) {
    need(ROW);
    doc.rect(M, y, 54, 60, { fill: SOFT, radius: 10 });
    const img = imageOf(l.photo);
    if (img) doc.image(img, M + 4, y + 4, 46, 52);
    const nameLines = doc.wrap(l.name, 11, CW - 54 - 16 - 110, 2, { font: "M" });
    let ty = y + 22;
    for (const t of nameLines) {
      doc.text(M + 68, ty, t, 11, { font: "M", color: INK });
      ty += 14;
    }
    doc.text(M + 68, ty + 2, `${l.qty} × ${money(l.unit)}`, 9.5, { font: "R", color: MUTED });
    doc.text(M, y + 34, money(l.total), 12, { font: "B", color: INK, align: "right", width: CW });
    y += ROW;
    doc.hline(M + 68, y - 5, CW - 68, LINE);
  }
  // Totales
  y += 6;
  const totalRows: [string, string][] = [["Subtotal", money(info.subtotal)]];
  if (info.discount) totalRows.push(["Descuento", "−" + money(info.discount)]);
  if (info.commission) totalRows.push(["Comisión por forma de pago", money(info.commission)]);
  need(totalRows.length * 18 + 50);
  for (const [k, val] of totalRows) {
    doc.text(M + CW / 2, y + 12, k, 10.5, { font: "R", color: MUTED });
    doc.text(M, y + 12, val, 10.5, { font: "M", color: INK, align: "right", width: CW });
    y += 18;
  }
  doc.rect(M + CW / 2 - 12, y + 4, CW / 2 + 12, 38, { fill: INK, radius: 12 });
  doc.text(M + CW / 2, y + 28, "TOTAL", 10, { font: "S", color: WHITE, tracking: 0.8 });
  doc.text(M, y + 29, money(info.total), 16, { font: "B", color: WHITE, align: "right", width: CW - 14 });
  y += 58;
  // Cobro
  for (const p of info.payments) {
    const rows = paymentLines(p);
    const h = 26 + rows.length * 18 + 8;
    need(h + 10);
    doc.rect(M, y, CW, h, { fill: SOFT, radius: 14 });
    doc.text(M + 16, y + 20, "DETALLE DEL COBRO", 8.5, { font: "S", color: MUTED, tracking: 0.8 });
    let ry = y + 40;
    for (const [k, val] of rows) {
      doc.text(M + 16, ry, k, 10.5, { font: "R", color: MUTED });
      const strong = /^Cambio entregado$|^Importe cobrado$/.test(k);
      doc.text(M, ry, val, 10.5, { font: strong ? "S" : "M", color: k === "Cambio entregado" ? GREEN : INK, align: "right", width: CW - 16 });
      ry += 18;
    }
    y += h + 10;
  }
  if (!info.payments.length) {
    need(30);
    doc.text(M, y + 14, "Sin cobro registrado.", 10.5, { font: "R", color: MUTED });
    y += 26;
  }
  if (info.balance > 0) {
    need(24);
    doc.text(M, y + 14, `Saldo pendiente: ${money(info.balance)}`, 11, { font: "S", color: INK });
    y += 24;
  }
  const n = doc.pageCount;
  if (n > 1)
    for (let i = 0; i < n; i++) {
      doc.setPage(i);
      doc.text(M, H - 34, `${i + 1} / ${n}`, 8, { font: "R", color: MUTED, align: "right", width: CW });
    }
  return doc.build(`${info.store} · Venta ${info.folio}`);
}
