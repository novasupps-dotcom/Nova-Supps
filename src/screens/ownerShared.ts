import { localDay, money, type Row } from "../business";
import { type Outcome, type TerminalPayment } from "../mercadopago";

export const VERSION = "2.2.0";
export const HOME = "Vender";

export const PAGES = [
  "Vender",
  "Ventas",
  "Cobros",
  "Clientes",
  "Stock",
  "Parámetros",
  "Transferencias",
  "Equipo",
  "Catálogo",
  "Campañas",
  "Compañías",
  "Ubicaciones",
  "Lotes",
  "Cuentas",
  "Paquetes",
  "Oportunidades",
  "Datos importados",
  "Respaldo",
  "Detalle producto",
  "Detalle venta",
  "Resumen de ventas",
  "Control Operativo",
  "Terminal Mercado Pago",
  "Corte de caja",
  "Promociones",
  "Reportes",
  "Catálogo para clientes",
];

export const TABS = [
  { name: "Vender", icon: "🛒" },
  { name: "Ventas", icon: "🧾" },
  { name: "Clientes", icon: "👥" },
  { name: "Stock", icon: "📦" },
  { name: "Parámetros", icon: "⚙️" },
];

export type MenuItem = {
  page: string;
  icon: string;
  title: string;
  desc: string;
};

export const SETTINGS_MENU: { section: string; items: MenuItem[] }[] = [
  {
    section: "Cobros",
    items: [
      {
        page: "Terminal Mercado Pago",
        icon: "🏧",
        title: "Terminal Mercado Pago",
        desc: "Cobra con tu Point desde la app",
      },
      {
        page: "Cobros",
        icon: "💰",
        title: "Tabla de cobros",
        desc: "Pagos, abonos y devoluciones por fecha",
      },
      {
        page: "Transferencias",
        icon: "🏦",
        title: "Datos para transferencia",
        desc: "Para mandarlos al cliente y a tus vendedores",
      },
    ],
  },
  {
    section: "Ventas",
    items: [
      {
        page: "Promociones",
        icon: "🏷️",
        title: "Promociones",
        desc: "2x1, por volumen o % de descuento",
      },
      {
        page: "Reportes",
        icon: "📊",
        title: "Reportes",
        desc: "Por producto y por vendedor",
      },
      {
        page: "Catálogo para clientes",
        icon: "📒",
        title: "Catálogo para clientes",
        desc: "PDF o mensaje de WhatsApp con tus precios",
      },
    ],
  },
  {
    section: "Equipo",
    items: [
      {
        page: "Equipo",
        icon: "👥",
        title: "Vendedores",
        desc: "Invitar, formas de pago y sincronizar",
      },
    ],
  },
  {
    section: "Datos",
    items: [
      {
        page: "Respaldo",
        icon: "💾",
        title: "Respaldo y Excel",
        desc: "Copia de tus datos y Excel de ventas",
      },
    ],
  },
];

export const ADVANCED_MENU: MenuItem[] = [
  {
    page: "Lotes",
    icon: "🏷️",
    title: "Lotes y caducidades",
    desc: "Costos, caducidad y ubicación de cada lote",
  },
  {
    page: "Paquetes",
    icon: "🎁",
    title: "Paquetes",
    desc: "Combos que descuentan cada producto",
  },
  {
    page: "Cuentas",
    icon: "💳",
    title: "Cuentas y movimientos",
    desc: "Saldos, aportaciones y traspasos",
  },
  {
    page: "Control Operativo",
    icon: "📉",
    title: "Gastos operativos",
    desc: "Terminal, publicidad y demás gastos",
  },
  {
    page: "Campañas",
    icon: "📣",
    title: "Campañas",
    desc: "Venta atribuida, gasto y ROAS",
  },
  {
    page: "Oportunidades",
    icon: "💡",
    title: "Oportunidades",
    desc: "Reposición y seguimientos",
  },
  {
    page: "Compañías",
    icon: "🏢",
    title: "Compañías",
    desc: "Proveedores, socios y empresas",
  },
  {
    page: "Ubicaciones",
    icon: "📍",
    title: "Ubicaciones",
    desc: "Tiendas, almacenes y puntos de entrega",
  },
  {
    page: "Datos importados",
    icon: "📥",
    title: "Datos importados",
    desc: "Carga inicial desde Excel",
  },
];

export const channels = [
  "Mostrador",
  "WhatsApp",
  "Instagram",
  "Facebook",
  "TikTok",
  "Referido",
  "Otro",
];

export const PERIODS = ["Hoy", "7 días", "Mes", "Todo"];

export const normalize = (x: any) =>
  String(x ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const amount = (v: number) => (v / 100).toFixed(2);

export const strings = (r: Row) =>
  Object.fromEntries(
    Object.entries(r)
      .filter(([, v]) => typeof v === "string" || typeof v === "number")
      .map(([k, v]) => [k, String(v)]),
  );

export const options = (items: string[]) =>
  items.map((name) => ({ id: name, name }));

export const minus = (n: number) => (n ? "−" + money(n) : money(0));

export const units = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

export function periodFrom(p: string): string | null {
  const d = new Date();
  if (p === "Hoy")
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  if (p === "7 días")
    return new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() - 6,
    ).toISOString();
  if (p === "Mes")
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  return null;
}

export function saleDay(v: Row) {
  return v.dateOnly || localDay(v.created);
}

export type Cart = { productId: string; qty: number }[];

export type Draft = {
  form: string;
  f: Record<string, string>;
  cart: Cart;
  allow: boolean;
  advanced: boolean;
  field: string;
};

export type SaleDraft = {
  f: Record<string, string>;
  cart: Cart;
  allow: boolean;
  fromBasket?: boolean;
};

export type Abono = { saleId: string; accountId: string };

export type Pay = {
  orderId?: string;
  amount: number;
  draft: SaleDraft | null;
  abono?: Abono;
  test?: boolean;
  outcome:
    Outcome | "sending" | "error" | "notpdv" | "searching" | "choose" | "done";
  saleId?: string;
  /** 2.0.3 · terminal en modo normal: desde cuándo buscar el pago cobrado a mano y los candidatos. */
  since?: string;
  found?: TerminalPayment[];
  text: string;
  order?: any;
  tick?: number;
  fails?: number;
  saleError?: boolean;
  atTerminal?: boolean;
};

export const POLL_MS = () =>
  ((globalThis as any).__MP_POLL_MS as number) ?? 3000;

export const manualOwnerText = (amount: number) =>
  `Tu terminal está en modo normal, así que no recibe cobros desde la app. Cobra ${money(amount)} directamente en la terminal y, cuando diga «Aprobado», toca «Ya cobré».`;

export type Selector = {
  key: string;
  label: string;
  rows: Row[];
  optional: boolean;
  create?: string;
};
