import { localDay, money, type Row } from "../business";
import { type Outcome, type TerminalPayment } from "../mercadopago";
import type { IconName } from "../icons";
import { TILE } from "../theme";

export const VERSION = "2.5.2";
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
  "Lotes",
  "Cuentas",
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

/** 2.3: cuatro pestañas; Ajustes (página "Parámetros") se abre con el engrane de arriba. */
export const TABS: { name: string; icon: IconName }[] = [
  { name: "Vender", icon: "shopping-bag" },
  { name: "Ventas", icon: "receipt" },
  { name: "Clientes", icon: "users" },
  { name: "Stock", icon: "package" },
];
/** Nombre visible de cada página (la clave interna no cambia para no perder sesiones guardadas). */
export const pageTitle = (page: string) =>
  page === "Parámetros"
    ? "Ajustes"
    : page === "Control Operativo"
      ? "Gastos operativos"
      : page === "Catálogo"
        ? "Stock"
        : page === "Equipo"
          ? "Vendedores"
          : page === "Transferencias"
            ? "Formas de pago"
            : page;

export type MenuItem = {
  page: string;
  icon: IconName;
  tint: string;
  title: string;
  desc: string;
};

export const SETTINGS_MENU: { section: string; items: MenuItem[] }[] = [
  {
    section: "Cobros",
    items: [
      {
        page: "Terminal Mercado Pago",
        icon: "credit-card",
        tint: TILE.red,
        title: "Terminal Mercado Pago",
        desc: "Cobra con tu Point desde la app",
      },
      {
        page: "Cobros",
        icon: "banknote",
        tint: TILE.green,
        title: "Tabla de cobros",
        desc: "Pagos, abonos y devoluciones",
      },
      {
        page: "Transferencias",
        icon: "landmark",
        tint: TILE.blue,
        title: "Formas de pago",
        desc: "Cuentas, efectivo y tarjeta; quién usa cada una",
      },
    ],
  },
  {
    section: "Ventas",
    items: [
      {
        page: "Promociones",
        icon: "tag",
        tint: TILE.red,
        title: "Promociones",
        desc: "2x1, por volumen o % de descuento",
      },
      {
        page: "Reportes",
        icon: "chart-column",
        tint: TILE.gold,
        title: "Reportes",
        desc: "Por producto y por vendedor",
      },
      {
        page: "Catálogo para clientes",
        icon: "book-open",
        tint: TILE.blue,
        title: "Catálogo para clientes",
        desc: "PDF o WhatsApp con tus precios",
      },
    ],
  },
  {
    section: "Equipo",
    items: [
      {
        page: "Equipo",
        icon: "users",
        tint: TILE.graphite,
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
        icon: "hard-drive",
        tint: TILE.graphite,
        title: "Respaldo y Excel",
        desc: "Copia de tus datos y Excel de ventas",
      },
    ],
  },
];

export const ADVANCED_MENU: MenuItem[] = [
  {
    page: "Lotes",
    icon: "layers",
    tint: TILE.gold,
    title: "Lotes y caducidades",
    desc: "Costos y caducidad de cada lote",
  },
  {
    page: "Cuentas",
    icon: "wallet",
    tint: TILE.green,
    title: "Cuentas y movimientos",
    desc: "Saldos, aportaciones y traspasos",
  },
  {
    page: "Control Operativo",
    icon: "receipt-text",
    tint: TILE.red,
    title: "Gastos operativos",
    desc: "Terminal, publicidad y demás gastos",
  },
  {
    page: "Datos importados",
    icon: "file-spreadsheet",
    tint: TILE.graphite,
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
