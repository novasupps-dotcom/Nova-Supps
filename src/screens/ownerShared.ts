import { localDay, money, type Row } from "../business";
import { type Outcome, type TerminalPayment } from "../mercadopago";
import type { IconName } from "../icons";
import { TILE } from "../theme";

export const VERSION = "2.11.2";
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
  "Actualizar catálogo",
  "Cargar pedido",
  "Repetidos",
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
        desc: "",
      },
      {
        page: "Cobros",
        icon: "banknote",
        tint: TILE.green,
        title: "Tabla de cobros",
        desc: "",
      },
      {
        page: "Transferencias",
        icon: "landmark",
        tint: TILE.blue,
        title: "Formas de pago",
        desc: "",
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
        desc: "",
      },
      {
        page: "Reportes",
        icon: "chart-column",
        tint: TILE.gold,
        title: "Reportes",
        desc: "",
      },
      {
        page: "Cargar pedido",
        icon: "file-text",
        tint: TILE.gold,
        title: "Cargar pedido (PDF)",
        desc: "",
      },
      {
        page: "Actualizar catálogo",
        icon: "file-spreadsheet",
        tint: TILE.green,
        title: "Actualizar catálogo",
        desc: "",
      },
      {
        page: "Catálogo para clientes",
        icon: "book-open",
        tint: TILE.blue,
        title: "Catálogo para clientes",
        desc: "",
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
        desc: "",
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
    desc: "",
  },
  {
    page: "Cuentas",
    icon: "wallet",
    tint: TILE.green,
    title: "Cuentas y movimientos",
    desc: "",
  },
  {
    page: "Control Operativo",
    icon: "receipt-text",
    tint: TILE.red,
    title: "Gastos operativos",
    desc: "",
  },
  {
    page: "Datos importados",
    icon: "file-spreadsheet",
    tint: TILE.graphite,
    title: "Datos importados",
    desc: "",
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

/** 2.11 · Hora del corte de caja (6:30 PM): el corte de un día va de esa hora del día anterior a esa hora. */
export const CORTE_DEFAULT = "18:30";
export function corteRange(day: string, hhmm = CORTE_DEFAULT): { from: string; to: string } {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = (/^\d{1,2}:\d{2}$/.test(hhmm) ? hhmm : CORTE_DEFAULT).split(":").map(Number);
  return { from: new Date(y, m - 1, d - 1, hh, mm).toISOString(), to: new Date(y, m - 1, d, hh, mm).toISOString() };
}
export const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** Semanas (lunes a domingo) dentro del mes: «3–9 nov». */
export function monthWeeks(start: Date, end: Date): { from: Date; to: Date; label: string }[] {
  const out: { from: Date; to: Date; label: string }[] = [];
  let cur = new Date(start);
  while (cur < end) {
    const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + (7 - ((cur.getDay() + 6) % 7)));
    const stop = next < end ? next : end;
    const last = new Date(stop.getFullYear(), stop.getMonth(), stop.getDate() - 1);
    const mon = MONTHS_ES[cur.getMonth()].slice(0, 3);
    out.push({ from: cur, to: stop, label: cur.getDate() === last.getDate() ? `${cur.getDate()} ${mon}` : `${cur.getDate()}–${last.getDate()} ${mon}` });
    cur = stop;
  }
  return out;
}

/** «18:30» → «6:30 PM». */
export function hourLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

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
