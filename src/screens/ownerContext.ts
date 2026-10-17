import React from "react";
import { Business, type Row } from "../business";
import { Cloud } from "../cloud";
import { MercadoPago, type MpConfig } from "../mercadopago";
import { type TransferAccount } from "../transfer";
import { type Abono, type Cart, type Pay, type SaleDraft } from "./ownerShared";

export type Body =
  | { scroll: React.ReactNode }
  | {
      list: {
        data: Row[];
        header: React.ReactNode;
        item: (r: Row) => React.ReactElement;
        empty: React.ReactNode;
      };
    };
export type OwnerPageContext = {
  data: {
    products: any[];
    customers: Row[];
    accounts: Row[];
    sales: any[];
    lots: Row[];
    lines: Map<string, Row[]>;
    payByAccount: Map<string, Record<string, number>>;
    byCustomer: Map<string, { count: number; total: number }>;
    m: Row;
    lastBackup: string | null;
    mp: MpConfig | null;
    mpPending: Row | null;
    period: string;
    biometric: boolean;
    feeBps: number;
    todaySales: { revenue: number; orders: number };
  } | null;
  page: string;
  b: Business | null;
  currentPeriod: string;
  setPeriod: (p: string) => void;
  excelCard: (label?: string) => React.JSX.Element;
  /** El cuadro de Excel está abierto (se muestra completo debajo del resumen). */
  excelOpen: boolean;
  /** Abre el panel del Excel de ventas. */
  openExcel: () => void;
  byMethodCard: (ps: Row) => React.JSX.Element;
  resultCard: (ps: Row) => React.JSX.Element;
  line: (
    label: string,
    value: string,
    opts?: {
      bold?: boolean;
      color?: string;
      indent?: boolean;
      onPress?: () => void;
    },
  ) => React.JSX.Element;
  divider: () => React.JSX.Element;
  go: (p: string, filter?: string) => void;
  open: (
    name: string,
    values?: Record<string, string>,
    nestedField?: string,
  ) => void;
  cashAccount: () => any;
  setPay: React.Dispatch<React.SetStateAction<Pay | null>>;
  cloudStatus: {
    ok: boolean;
    text: string;
    conflicts?: number;
    at?: string;
  } | null;
  exportBackup: () => Promise<void>;
  gridProducts: any[];
  basket: Cart;
  productById: Map<string, Row>;
  addToBasket: (productId: string, qty?: number, quiet?: boolean) => boolean;
  removeFromBasket: (productId: string) => void;
  saleSeg: string;
  setSaleSeg: React.Dispatch<React.SetStateAction<string>>;
  emptyBasket: () => void;
  filters: Record<string, string>;
  matching: (rows: Row[]) => Row[];
  searchBox: (placeholder: string) => React.JSX.Element;
  filterChips: (key: string, list: string[]) => React.JSX.Element;
  setProductDetailId: React.Dispatch<React.SetStateAction<string>>;
  sellButton: (p: Row) => React.JSX.Element;
  editProduct: (p: Row) => void;
  query: string;
  productDetailId: string;
  act: (fn: () => void, done?: string) => boolean;
  saleDetailId: string;
  sendReceipt: (v: Row) => Promise<void>;
  openRevise: (v: Row) => void;
  mpCfg: MpConfig | null;
  errText: (e: unknown) => string;
  mpClient: () => MercadoPago;
  confirmDeleteSale: (v: Row, after?: () => void) => void;
  back: () => void;
  sendCardReceipt: (v: Row, entry: Row) => Promise<void>;
  reconcileFee: (saleId: string, entry: Row, manual?: boolean) => Promise<Row>;
  setFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  confirmDeleteAllCancelled: (list: Row[]) => void;
  setSaleDetailId: React.Dispatch<React.SetStateAction<string>>;
  openSale: (values?: Record<string, string>, items?: Cart) => void;
  corteDay: string;
  setCorteDay: React.Dispatch<React.SetStateAction<string>>;
  revision: number;
  notify: (text: string) => void;
  refresh: () => void;
  syncRef: React.RefObject<(manual?: boolean) => Promise<void>>;
  trEdit: TransferAccount | null;
  setTrEdit: React.Dispatch<React.SetStateAction<TransferAccount | null>>;
  setTrErr: React.Dispatch<React.SetStateAction<string>>;
  trErr: string;
  getCloud: () => Cloud | null;
  cloudForm: Record<string, string>;
  setCloudForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  teamData: {
    members: Row[];
    conflicts: Row[];
    invites: Row[];
    users: Row[] | null;
  } | null;
  teamMsg: { text: string; tone: "ok" | "bad" | "warn" } | null;
  teamBusy: boolean;
  connectOwner: (mode: "signup" | "signin") => Promise<void>;
  runSync: (manual?: boolean) => Promise<void>;
  ownerElsewhere: boolean;
  teamAction: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  cloudRef: React.RefObject<Cloud | null>;
  ownerBound: React.RefObject<boolean>;
  setOwnerElsewhere: React.Dispatch<React.SetStateAction<boolean>>;
  emailOf: (id: string) => any;
  setTeamMsg: React.Dispatch<
    React.SetStateAction<{ text: string; tone: "ok" | "bad" | "warn" } | null>
  >;
  sellerCuts: { userId: string; rows: Row[] } | null;
  setSellerCuts: React.Dispatch<
    React.SetStateAction<{ userId: string; rows: Row[] } | null>
  >;
  pwFor: { userId: string; value: string } | null;
  setPwFor: React.Dispatch<
    React.SetStateAction<{ userId: string; value: string } | null>
  >;
  deleteUser: (id: string, name: string, email?: string) => void;
  createInvite: () => Promise<void>;
  newInvite: { code: string; name: string; expires: string } | null;
  shareInvite: (code: string, name: string, expires: string) => undefined;
  setTeamData: React.Dispatch<
    React.SetStateAction<{
      members: Row[];
      conflicts: Row[];
      invites: Row[];
      users: Row[] | null;
    } | null>
  >;
  setCloudStatus: React.Dispatch<
    React.SetStateAction<{
      ok: boolean;
      text: string;
      conflicts?: number;
      at?: string;
    } | null>
  >;
  setMpBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setMpMsg: React.Dispatch<
    React.SetStateAction<{ text: string; tone: "ok" | "bad" | "warn" } | null>
  >;
  mpMsg: { text: string; tone: "ok" | "bad" | "warn" } | null;
  mpToken: string;
  setMpToken: React.Dispatch<React.SetStateAction<string>>;
  mpBusy: boolean;
  authAvailable: boolean | null;
  setMpTerms: React.Dispatch<React.SetStateAction<Row[] | null>>;
  mpTerms: Row[] | null;
  mpPdvSet: Record<string, boolean>;
  setMpPdvSet: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  startCharge: (
    amountCents: number,
    draft: SaleDraft | null,
    test?: boolean,
    abono?: Abono,
    attemptId?: number,
  ) => Promise<undefined>;
  importBackup: () => Promise<void>;
  previousBackup: () => Promise<void>;
  restoreFromCloud: (raw: string) => Promise<void>;
  lockApi: {
    lockNow: () => void;
    bioAvailable: boolean;
    bioEnabled: boolean;
    setBio: (on: boolean) => Promise<boolean>;
  };
};
