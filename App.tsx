import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Share,
  Text,
  TextInput,
  Vibration,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as SQLite from "expo-sqlite";
import * as FS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Picker from "expo-document-picker";
import * as LocalAuthentication from "expo-local-authentication";
import {
  Business,
  cents,
  money,
  today,
  localDay,
  assert,
  STAGES,
  feeLabel,
  cardFee,
  grossUp,
  chargeFor,
  promoSummary,
  promoTagFor,
  saleSegment,
  type PromoHit,
  type Row,
} from "./src/business";
import {
  importPhoto,
  migratePhotos,
  removeOrphanPhotos,
  inlinePhotos,
} from "./src/photos";
import { pickPhotoIOS, type PickedPhoto } from "./src/iosPhoto";
import { pickPhotoAndroid } from "./src/androidPhoto";
import { secureStore } from "./src/secure";
import { canScan } from "./src/native";
import { CameraScanner } from "./src/scanner";
import {
  autoRegisterPush,
  setupNotifications,
  scheduleFollowUps,
  detachPush,
} from "./src/push";
import { PushCard } from "./src/screens/PushCard";
import { UpdateNotice } from "./src/screens/UpdateNotice";
import {
  Cloud,
  parseInvite,
  normalizeUrl,
  formatShortCode,
  type CloudSession,
} from "./src/cloud";
import { storeCloud } from "./src/storeConfig";
import { deviceId } from "./src/device";
import {
  syncOwner,
  NEEDS_SCHEMA_21,
  SCHEMA_21_NOTE,
  type RemoteSale,
  type SyncResult,
} from "./src/sync";
import { SellerApp } from "./src/seller";
import { LoginScreen, loginHere, type LoginResult } from "./src/login";
import {
  TransferInfo,
  TRANSFER_TEMPLATES,
  cleanTransfer,
  validateTransfer,
  type TransferAccount,
} from "./src/transfer";
import {
  saleReceiptText,
  cardReceiptText,
  cardFromOrder,
  cardFromPayment,
  mergeCard,
  cardLabel,
  terminalPayments,
  whatsappNumber,
  validWhatsapp,
} from "./src/receipt";
import { LockGate, useLock } from "./src/lock";
import { PromotionsPage } from "./src/screens/Promotions";
import { ReportsPage } from "./src/screens/Reports";
import { CustomerCatalogPage } from "./src/screens/CustomerCatalog";
import { CloudBackupCard, when } from "./src/screens/CloudBackup";
import {
  backupDue,
  downloadBackup,
  listBackups,
  uploadBackup,
  type CloudBackup,
} from "./src/cloudBackup";
import { catalogueImages } from "./src/catalogueImages";
import { LOGO_HEADER, LOGO_HEADER_RATIO } from "./src/brand";
import {
  salesWorkbook,
  EXPORT_PERIODS,
  XLSX_MIME,
  type ExportPeriod,
} from "./src/salesExcel";
import { base64 } from "./src/xlsx";
import {
  MercadoPago,
  MpError,
  orderOutcome,
  outcomeText,
  orderPayment,
  paymentFee,
  manualOrder,
  terminalPaymentLabel,
  type MpConfig,
  type Outcome,
  type TerminalPayment,
} from "./src/mercadopago";
import {
  C,
  s,
  Button,
  Card,
  Note,
  Pill,
  Chips,
  SearchBox,
  ProductPhoto,
  ProductGrid,
  CardFeePreview,
  Checkbox,
  DateField,
  QUICK_FOLLOWUP,
  QUICK_EXPIRY,
  QUICK_CAMPAIGN,
  fmtDay,
  daysBetween,
  tryCents,
  followUpsDue,
  followUpLabel,
  FOLLOW_UP_DAYS,
} from "./src/ui";

import { VERSION } from "./src/screens/ownerShared";
import {
  HOME,
  PAGES,
  TABS,
  type MenuItem,
  SETTINGS_MENU,
  ADVANCED_MENU,
  channels,
  PERIODS,
  normalize,
  amount,
  strings,
  options,
  minus,
  units,
  periodFrom,
  saleDay,
  type Cart,
  type Draft,
  type SaleDraft,
  type Abono,
  type Pay,
  POLL_MS,
  manualOwnerText,
  type Selector,
} from "./src/screens/ownerShared";
import { renderOwnerPage } from "./src/screens/OwnerPages";

/** Datos de pantalla: se leen una vez por cambio (no en cada tecla). */
function load(b: Business) {
  const products = b.stock();
  const sales = b.sales();
  const byCustomer = new Map<string, { count: number; total: number }>();
  for (const v of sales)
    if (v.customerId && v.status === "confirmed") {
      const x = byCustomer.get(v.customerId) ?? { count: 0, total: 0 };
      x.count++;
      x.total += v.total;
      byCustomer.set(v.customerId, x);
    }
  return {
    products,
    customers: b.customers(),
    campaigns: b.campaigns(),
    companies: b.companies(),
    locations: b.locations(),
    accounts: b.accounts(),
    sales,
    lots: b.lots(),
    lines: b.saleLinesBySale(),
    payByAccount: b.salePaymentsByAccount(),
    byCustomer,
    m: b.metrics(),
    lastBackup: b.setting("lastBackupAt", null) as string | null,
    mp: b.setting("mpConfig", null) as MpConfig | null,
    mpPending: b.setting("mpPending", null) as Row | null,
    period: b.setting("homePeriod", "Todo") as string,
    biometric: b.setting("biometricEnabled", true) !== false,
    feeBps: b.feeBps(),
    // Lo vendido hoy (encabezado de Ventas): se calcula al cargar, no en cada tecla de la búsqueda.
    todaySales: b.one(
      "SELECT COALESCE(SUM(total),0) revenue,COUNT(*) orders FROM sales WHERE status='confirmed' AND created>=?",
      periodFrom("Hoy")!,
    ) as { revenue: number; orders: number },
  };
}

function AppContent({ business }: { business?: Business }) {
  const [b, setB] = useState<Business | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(HOME),
    [revision, setRevision] = useState(0),
    [query, setQuery] = useState(""),
    [history, setHistory] = useState<string[]>([]),
    [authAvailable, setAuthAvailable] = useState<boolean | null>(null);
  // El bloqueo con huella lo hace LockGate antes de dibujar esta pantalla.
  const locked = false;
  const lockApi = useLock();
  const saveBusy = useRef(false);
  const sessionHydrated = useRef(false);
  const bRef = useRef<Business | null>(null);
  const sessionRef = useRef<Row | null>(null);
  const [productDetailId, setProductDetailId] = useState("");
  const [saleDetailId, setSaleDetailId] = useState("");
  const [form, setForm] = useState(""),
    [f, setF] = useState<Record<string, string>>({}),
    [cart, setCart] = useState<Cart>([]),
    [allow, setAllow] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [busy, setBusy] = useState(false),
    [stack, setStack] = useState<Draft[]>([]),
    [formError, setFormError] = useState("");
  const [selector, setSelector] = useState<Selector | null>(null),
    [search, setSearch] = useState("");
  const [barcodeScanner, setBarcodeScanner] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{
    text: string;
    key: number;
    bad?: boolean;
  } | null>(null);
  const [pay, setPay] = useState<Pay | null>(null);
  const payRef = useRef<Pay | null>(null);
  payRef.current = pay;
  const doneOrders = useRef(new Set<string>());
  // Cada intento de cobro tiene número: si se cancela mientras se envía, la respuesta tardía se ignora.
  const chargeAttempt = useRef(0);
  const [mpToken, setMpToken] = useState("");
  const [mpTerms, setMpTerms] = useState<Row[] | null>(null);
  const [mpMsg, setMpMsg] = useState<{
    text: string;
    tone: "ok" | "bad" | "warn";
  } | null>(null);
  const [mpBusy, setMpBusy] = useState(false);
  const [mpPdvSet, setMpPdvSet] = useState<Record<string, boolean>>({});
  const [corteDay, setCorteDay] = useState("");
  // Equipo (base en línea para vendedores)
  const [cloudForm, setCloudForm] = useState<Record<string, string>>({});
  const [teamData, setTeamData] = useState<{
    members: Row[];
    conflicts: Row[];
    invites: Row[];
    users: Row[] | null;
  } | null>(null);
  const [sellerCuts, setSellerCuts] = useState<{
    userId: string;
    rows: Row[];
  } | null>(null);
  const [newInvite, setNewInvite] = useState<{
    code: string;
    name: string;
    expires: string;
  } | null>(null);
  const [teamMsg, setTeamMsg] = useState<{
    text: string;
    tone: "ok" | "bad" | "warn";
  } | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);
  const [ownerElsewhere, setOwnerElsewhere] = useState(false);
  const [pwFor, setPwFor] = useState<{ userId: string; value: string } | null>(
    null,
  );
  const [trEdit, setTrEdit] = useState<TransferAccount | null>(null);
  const [trErr, setTrErr] = useState("");
  const [excel, setExcel] = useState<{
    period: ExportPeriod;
    busy: boolean;
  } | null>(null);
  const [saleSeg, setSaleSeg] = useState("");
  const [gridMsg, setGridMsg] = useState("");
  // 1.8 · Carrito de compras: se llena desde Vender o Stock y se cobra desde el carrito.
  const [basket, setBasketState] = useState<Cart>([]);
  const basketRef = useRef<Cart>([]);
  const setBasket = (next: Cart | ((old: Cart) => Cart)) => {
    const v = typeof next === "function" ? next(basketRef.current) : next;
    basketRef.current = v;
    setBasketState(v);
  };
  const [basketF, setBasketF] = useState<Record<string, string>>({});
  const checkoutFromBasket = useRef(false);
  const [cloudStatus, setCloudStatus] = useState<{
    ok: boolean;
    text: string;
    conflicts?: number;
    at?: string;
  } | null>(null);
  const cloudRef = useRef<Cloud | null>(null);
  const syncing = useRef(false);
  const ownerBound = useRef(false);
  const syncRef = useRef<(manual?: boolean) => Promise<void>>(async () => {});
  const backingUp = useRef(false);
  const { width } = useWindowDimensions();
  const wide = width >= 700;

  useEffect(() => {
    try {
      const db =
        business ?? new Business(SQLite.openDatabaseSync("nova-negocio.db"));
      const saved = db.setting("uiSession", null);
      if (saved && saved.version === 1) {
        const valid = new Set(PAGES);
        setPage(valid.has(saved.page) ? saved.page : HOME);
        setHistory(
          Array.isArray(saved.history)
            ? saved.history.filter((x: any) => valid.has(x))
            : [],
        );
        setQuery(typeof saved.query === "string" ? saved.query : "");
        setForm(typeof saved.form === "string" ? saved.form : "");
        setF(saved.f && typeof saved.f === "object" ? saved.f : {});
        setCart(Array.isArray(saved.cart) ? saved.cart : []);
        if (Array.isArray(saved.basket))
          setBasket(
            saved.basket.filter(
              (i: any) =>
                i &&
                typeof i.productId === "string" &&
                Number.isInteger(i.qty) &&
                i.qty > 0,
            ),
          );
        if (saved.basketF && typeof saved.basketF === "object")
          setBasketF(saved.basketF);
        checkoutFromBasket.current =
          saved.form === "Venta" && saved.fromBasket === true;
        // La autorización para vender bajo costo nunca se restaura: vale para una sola venta.
        setAllow(false);
        setAdvanced(saved.advanced === true);
        setStack(
          Array.isArray(saved.stack)
            ? saved.stack.map((d: Draft) => ({ ...d, allow: false }))
            : [],
        );
        setProductDetailId(
          typeof saved.productDetailId === "string"
            ? saved.productDetailId
            : "",
        );
        setSaleDetailId(
          typeof saved.saleDetailId === "string" ? saved.saleDetailId : "",
        );
      }
      sessionHydrated.current = true;
      bRef.current = db;
      setB(db);
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const available =
          (await LocalAuthentication.hasHardwareAsync()) &&
          (await LocalAuthentication.isEnrolledAsync());
        if (active) setAuthAvailable(available);
      } catch {
        if (active) setAuthAvailable(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Sesión de pantalla: se guarda con pausa (no en cada tecla) y al salir de la app.
  const flushSession = () => {
    if (bRef.current && sessionRef.current)
      bRef.current.setSetting("uiSession", sessionRef.current);
  };
  useEffect(() => {
    if (!b || !sessionHydrated.current) return;
    sessionRef.current = {
      version: 1,
      page,
      history,
      query,
      form,
      f,
      cart,
      allow: false,
      advanced,
      stack,
      productDetailId,
      saleDetailId,
      basket,
      basketF,
      fromBasket: checkoutFromBasket.current,
    };
    const t = setTimeout(flushSession, 700);
    return () => clearTimeout(t);
  }, [
    b,
    page,
    history,
    query,
    form,
    f,
    cart,
    advanced,
    stack,
    productDetailId,
    saleDetailId,
    basket,
    basketF,
  ]);
  // Lo que cambie en el carrito al cobrar (cantidades, quitar) se queda en el carrito.
  useEffect(() => {
    if (form === "Venta" && checkoutFromBasket.current) setBasket(cart);
  }, [cart, form]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") flushSession();
    });
    return () => {
      sub.remove();
      flushSession();
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const data = useMemo(
    () => (b && !locked ? load(b) : null),
    [b, revision, locked],
  );
  // Búsquedas por id y listas para la cuadrícula: se calculan solo cuando cambian los datos.
  const reviseMemo = useRef<{ key: string; v: Row | null }>({
    key: "",
    v: null,
  });
  const productById = useMemo(
    () =>
      new Map((data?.products ?? []).map((p) => [p.id, p] as [string, Row])),
    [data],
  );
  const gridProducts = useMemo(() => {
    if (!data || !b) return [];
    const promos = b.promos();
    const day = today();
    return data.products
      .filter((p) => !p.archived)
      .map((p) => ({
        ...p,
        price: grossUp(p.price, data.feeBps),
        tag: promos.length
          ? promoTagFor(promos, p.id, saleSegment(p), day)
          : "",
      }));
  }, [data]);
  const saleableList = useMemo(
    () =>
      data
        ? data.products
            .filter((p) => !p.archived)
            .map((p) => ({
              ...p,
              name: `${p.name} · ${money(p.price)} · ${p.inventoryKnown ? p.available : "?"} disp.`,
            }))
        : [],
    [data],
  );
  // Mantenimiento al abrir (una vez): quita la copia interna de la 0.8, pasa las
  // fotos de la base a archivos y borra fotos que ya nadie usa.
  const maintained = useRef(false);
  useEffect(() => {
    if (!b || locked || maintained.current) return;
    maintained.current = true;
    (async () => {
      let changed = false;
      try {
        // 1.9: los precios regresan a su precio original y la comisión se suma al cobrar (una sola vez).
        const n = b.restoreBasePrices();
        if (n > 0) {
          changed = true;
          notify(
            `Precios originales restaurados en ${n} ${n === 1 ? "producto" : "productos"}: el cliente absorbe la comisión al cobrar`,
          );
        }
      } catch {}
      try {
        if (b.cleanupLegacy()) {
          changed = true;
          try {
            b.db.execSync("VACUUM");
          } catch {}
        }
      } catch {}
      try {
        if ((await migratePhotos(b)) > 0) changed = true;
        await removeOrphanPhotos(b);
      } catch {}
      if (changed) setRevision((v) => v + 1);
    })();
  }, [b, locked]);
  // 1.7 · Aviso de seguimientos: al abrir y al volver a la app, una vez por día
  // (y otra vez si entra un seguimiento nuevo a la ventana de 5 días).
  const goRef = useRef<(p: string, filter?: string) => void>(() => {});
  const formRef = useRef("");
  formRef.current = form;
  useEffect(() => {
    if (!b) return;
    const schedule = () =>
      void scheduleFollowUps(
        b
          .customers()
          .map((c) => ({
            id: String(c.id),
            name: String(c.name),
            nextDate: c.nextDate,
            archived: c.archived,
          })),
        new Date(),
        !b.setting("pushOff", false),
      );
    schedule();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") schedule();
    });
    return () => sub.remove();
  }, [b, data]);
  useEffect(() => {
    if (!b) return;
    return setupNotifications(
      (data) => {
        void syncRef.current();
        if (data.kind === "followup" && !formRef.current && !payRef.current)
          goRef.current("Clientes", "Próximos 5 días");
      },
      () => void syncRef.current(),
      () => !b.setting("pushOff", false),
    );
  }, [b]);
  useEffect(() => {
    if (!b || locked || (globalThis as any).__NOVA_NO_FOLLOW_ALERT) return;
    const check = () => {
      try {
        const list = followUpsDue(b.customers());
        if (!list.length) return;
        const day = today();
        const seen = b.setting("followAlerted", {
          day: "",
          keys: [] as string[],
        });
        const before = new Set<string>(seen.day === day ? seen.keys : []);
        if (formRef.current) return; // con un formulario abierto se avisa al volver a la app
        const keys = list.map((c) => c.id);
        if (keys.every((k) => before.has(k))) return;
        b.setSetting("followAlerted", {
          day,
          keys: [...new Set([...before, ...keys])],
        });
        const lines = list
          .slice(0, 8)
          .map((c) => `• ${c.name}: ${followUpLabel(c.daysLeft, c.nextDate)}`);
        if (list.length > 8) lines.push(`…y ${list.length - 8} más`);
        Alert.alert(
          `🔔 ${list.length === 1 ? "Seguimiento próximo" : `${list.length} seguimientos próximos`}`,
          `En los próximos ${FOLLOW_UP_DAYS} días (o vencidos):\n\n${lines.join("\n")}`,
          [
            { text: "Después", style: "cancel" },
            {
              text: "Ver clientes",
              onPress: () => goRef.current("Clientes", "Próximos 5 días"),
            },
          ],
        );
      } catch {}
    };
    const first = setTimeout(check, 1200);
    const sub = AppState.addEventListener(
      "change",
      (st) => st === "active" && check(),
    );
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, [b, locked]);
  // Sincronización con los vendedores: al abrir, cada minuto y al volver a la app.
  useEffect(() => {
    if (!b || locked) return;
    const first = setTimeout(() => void syncRef.current(), 1500);
    const every = setInterval(
      () => void syncRef.current(),
      ((globalThis as any).__OWNER_SYNC_MS as number) ?? 60000,
    );
    const sub = AppState.addEventListener(
      "change",
      (st) => st === "active" && void syncRef.current(),
    );
    return () => {
      clearTimeout(first);
      clearInterval(every);
      sub.remove();
    };
  }, [b, locked]);
  useEffect(() => {
    // Los avisos de una visita anterior no se quedan pegados en la pantalla.
    setTeamMsg(null);
    setMpMsg(null);
    // Paneles abiertos y valores tecleados de otra visita (contraseñas, cuentas, Excel) no se quedan.
    setTrEdit(null);
    setTrErr("");
    setPwFor(null);
    setNewInvite(null);
    setSellerCuts(null);
    setExcel(null);
    if (page === "Equipo" && b && !locked) void loadTeam();
  }, [page, locked]);
  // Después de un cambio (venta, entrada, precio) se publican las existencias.
  useEffect(() => {
    if (!b || locked || !revision) return;
    const t = setTimeout(() => void syncRef.current(), 6000);
    return () => clearTimeout(t);
  }, [revision]);
  // Si quedó un cobro de terminal sin confirmar (la app se cerró), se revisa solo al abrir.
  const pendingChecked = useRef(false);
  useEffect(() => {
    if (!data || pendingChecked.current) return;
    pendingChecked.current = true;
    if (data.mpPending?.orderId && data.mp?.token && !payRef.current)
      setPay({
        ...(data.mpPending as any),
        outcome: "pending",
        text: "Revisando un cobro que quedó pendiente en la terminal…",
        tick: 0,
      });
  }, [data]);
  // Libera el candado anti-doble-toque cuando cambia el formulario en pantalla
  // (p. ej. al volver a la venta tras crear un cliente). Corre después de pintar,
  // así un doble toque en el mismo instante sigue bloqueado.
  useEffect(() => {
    saveBusy.current = false;
  }, [form, stack.length]);
  // Consulta el estado del cobro en la terminal mientras está pendiente.
  useEffect(() => {
    if (!pay || !pay.orderId || pay.outcome !== "pending" || !data?.mp?.token)
      return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const order = await new MercadoPago(data.mp!.token).getOrder(
          pay.orderId!,
        );
        if (!alive) return;
        const o = orderOutcome(order);
        if (o === "approved") return finishApproved(order);
        if (
          o === "canceled" ||
          o === "failed" ||
          o === "expired" ||
          o === "refunded"
        )
          b?.setSetting("mpPending", null);
        setPay((p) =>
          p && p.orderId === pay.orderId
            ? {
                ...p,
                outcome: o === "refunded" ? "canceled" : o,
                text: outcomeText(order),
                order,
                tick: (p.tick || 0) + 1,
                fails: 0,
                atTerminal: order?.status === "at_terminal",
              }
            : p,
        );
      } catch (e) {
        if (alive)
          setPay((p) =>
            p
              ? {
                  ...p,
                  text:
                    "Sin respuesta de Mercado Pago; reintentando… " +
                    (e instanceof Error ? e.message : ""),
                  tick: (p.tick || 0) + 1,
                  fails: (p.fails || 0) + 1,
                }
              : p,
          );
      }
    }, POLL_MS());
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [pay]);
  const [period, setPeriodState] = useState<string | null>(null);
  const currentPeriod = period ?? data?.period ?? "Todo";
  const refresh = () => setRevision((v) => v + 1);
  const warn = (text: string) => setToast({ text, key: Date.now(), bad: true });
  const notify = (text: string) => {
    setToast({ text, key: Date.now() });
    try {
      Vibration.vibrate(15);
    } catch {}
  };
  const mpCfg = data?.mp && data.mp.token ? data.mp : null;
  const mpActive = !!(mpCfg && mpCfg.enabled && mpCfg.terminalId);
  const mpClient = () => new MercadoPago(mpCfg!.token);
  const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
  /** 2.1 · Promociones vigentes para un carrito (la mejor por producto; no se acumulan). */
  const cartPromo = (items: Cart): { hits: PromoHit[]; total: number } => {
    try {
      return b && items.length ? b.promoFor(items) : { hits: [], total: 0 };
    } catch {
      return { hits: [], total: 0 };
    }
  };
  /**
   * Lo que se cobra por un carrito (tus precios − promociones + la comisión que absorbe el cliente).
   * Con precio especial (`base`) no se aplican promociones: manda el precio que escribiste.
   */
  const cartCharge = (items: Cart, base: number | null = null) => {
    const prices = items.map((i) => ({
      qty: i.qty,
      price: productById.get(i.productId)?.price ?? 0,
    }));
    const promo =
      base === null ? cartPromo(items) : { hits: [] as PromoHit[], total: 0 };
    const list = prices.reduce((n, i) => n + i.qty * i.price, 0);
    return {
      ...chargeFor(
        prices,
        data?.feeBps,
        base ?? (promo.total > 0 ? Math.max(0, list - promo.total) : null),
      ),
      promo,
    };
  };
  /** Convierte un borrador de venta en los argumentos de `sell` (mismo cálculo que la pantalla). */
  function saleArgs(d: SaleDraft) {
    // Tu precio (sin comisión): el de catálogo o el precio especial que escribas.
    // 2.0: el cliente siempre absorbe la comisión; tú recibes ese precio completo.
    const isCard =
      data!.accounts.find((a) => a.id === d.f.accountId)?.kind === "Tarjeta";
    const bps = data!.feeBps;
    const ch = cartCharge(d.cart, d.f.total ? cents(d.f.total) : null);
    const base = ch.base;
    const commission = ch.commission;
    const price = ch.total;
    const paid = d.f.paid ? cents(d.f.paid) : price;
    // Promociones: cada renglón guarda su descuento (para reportes y comprobantes).
    const lineInfo = ch.promo.hits.length
      ? Object.fromEntries(
          ch.promo.hits.map((h) => [h.productId, { discount: h.amount }]),
        )
      : null;
    const args: Parameters<Business["sell"]> = [
      d.cart,
      price,
      paid,
      d.f.accountId || null,
      d.f.customerId || null,
      d.f.campaignId || null,
      d.f.channel,
      d.allow,
      d.f.locationId || null,
      commission ? { amount: commission, bps } : null,
      lineInfo,
    ];
    return { base, commission, price, paid, isCard, args, promo: ch.promo };
  }
  function registerSale(
    d: SaleDraft,
    mpInfo?: { orderId: string; paymentId?: string },
  ) {
    let msg = "";
    let saleId = "";
    b!.transaction(() => {
      const x = saleArgs(d);
      const id = b!.sell(...x.args);
      saleId = id;
      b!.updateSaleDetails(id, { ...d.f, channel: d.f.channel });
      const extra: Row = {};
      if (mpInfo)
        Object.assign(extra, {
          mpOrderId: mpInfo.orderId,
          mpPaymentId: mpInfo.paymentId || "",
        });
      if (x.promo.hits.length) extra.promos = promoSummary(x.promo.hits);
      if (Object.keys(extra).length)
        b!.setSetting("sale:" + id, {
          ...b!.setting("sale:" + id, {}),
          ...extra,
        });
      msg = `Venta registrada · ${money(x.price)}`;
      // Venta armada en el carrito: se vacía al registrarla (también si se confirmó después, al revisar
      // un cobro pendiente), salvo que el carrito ya tenga otra venta distinta.
      const sameItems = (a: Cart, z: Cart) =>
        JSON.stringify(a.map((i) => [i.productId, i.qty]).sort()) ===
        JSON.stringify(z.map((i) => [i.productId, i.qty]).sort());
      if (
        (d.fromBasket ?? checkoutFromBasket.current) &&
        (!basketRef.current.length || sameItems(basketRef.current, d.cart))
      ) {
        basketRef.current = [];
        setTimeout(() => (setBasket([]), setBasketF({})), 0);
      }
    });
    return { msg, saleId };
  }
  /** Guarda en la venta el cobro hecho en la terminal y concilia su comisión real. */
  function recordMpPayment(
    saleId: string,
    order: any,
    orderId: string,
    kind: "venta" | "abono",
    amountCents: number,
  ) {
    const pay = orderPayment(order);
    const fee = b!.lastFeeEntry(saleId);
    const entry: Row = {
      orderId,
      kind,
      amount: amountCents,
      paymentId: pay?.id || "",
      referenceId: pay?.referenceId || "",
      feeId: fee?.id || "",
      at: new Date().toISOString(),
      card: cardFromOrder(order),
    };
    const meta = b!.setting("sale:" + saleId, {});
    b!.setSetting("sale:" + saleId, {
      ...meta,
      mpPayments: [...(meta.mpPayments || []), entry],
    });
    void reconcileFee(saleId, entry);
    return entry;
  }
  /** Guarda (o agrega) datos de un cobro de terminal dentro de la venta. */
  function updateMpEntry(saleId: string, orderId: string, patch: Row) {
    const meta = b!.setting("sale:" + saleId, {});
    const list: Row[] = meta.mpPayments || [];
    const found = list.some((x) => x.orderId === orderId);
    const next = found
      ? list.map((x) => (x.orderId === orderId ? { ...x, ...patch } : x))
      : [...list, { orderId, kind: "venta", ...patch }];
    b!.setSetting("sale:" + saleId, { ...meta, mpPayments: next });
    return next.find((x) => x.orderId === orderId)!;
  }
  /**
   * Consulta a Mercado Pago el detalle del pago: reemplaza la comisión estimada
   * por la real y guarda los datos de la tarjeta para el comprobante.
   */
  async function reconcileFee(
    saleId: string,
    entry: Row,
    manual = false,
  ): Promise<Row> {
    try {
      assert(mpCfg, "Configura la terminal para consultar Mercado Pago.");
      let ref = entry.referenceId;
      let orderCard = {};
      if (!ref && entry.orderId) {
        const order = await mpClient().getOrder(entry.orderId);
        ref = orderPayment(order)?.referenceId || "";
        orderCard = cardFromOrder(order);
      }
      assert(ref, "Mercado Pago no indicó el número del pago.");
      const payment = await mpClient().payment(ref);
      const card = mergeCard(
        mergeCard(entry.card, orderCard),
        cardFromPayment(payment),
      );
      const fee = entry.feeId ? paymentFee(payment) : null;
      if (fee !== null) b!.setRealFee(entry.feeId, fee);
      const updated = updateMpEntry(saleId, entry.orderId, {
        referenceId: ref,
        card,
        ...(fee !== null ? { realFee: fee } : {}),
      });
      refresh();
      if (manual) {
        assert(
          !entry.feeId || fee !== null,
          "Mercado Pago aún no reporta la comisión de este pago.",
        );
        notify(
          fee !== null
            ? "Comisión real: " + money(fee)
            : "Datos del pago actualizados",
        );
      }
      return updated;
    } catch (e) {
      if (manual)
        Alert.alert(
          "Mercado Pago",
          errText(e) +
            (entry.feeId ? " Se conserva la comisión estimada." : ""),
        );
      return entry;
    }
  }
  // ---------- Base en línea (vendedores) ----------
  function getCloud(): Cloud | null {
    const cfg = b?.setting("cloudConfig", null);
    if (!b || !cfg) return null;
    if (!cloudRef.current || cloudRef.current.cfg.url !== cfg.url) {
      cloudRef.current = new Cloud(
        cfg,
        b.setting("cloudSession", null),
        (ns: CloudSession | null) => b.setSetting("cloudSession", ns),
      );
      cloudRef.current.device = deviceId(b);
      ownerBound.current = false;
    }
    return cloudRef.current;
  }
  /** Ciclo completo: trae ventas y clientes de vendedores y publica existencias. */
  async function runSync(manual = false) {
    const cloud = getCloud();
    if (!b || !cloud?.session || syncing.current) return;
    syncing.current = true;
    if (manual) setTeamBusy(true);
    try {
      await ensureOwnerBound(cloud);
      const previousPush = JSON.stringify(b.setting("pushToken", null));
      void autoRegisterPush(b, cloud).then(state => {
        if (state === "ok" && previousPush !== JSON.stringify(b.setting("pushToken", null))) refresh();
      }).catch(() => {});
      const sellerTerminal = !!(
        b.setting("sellerTerminal", false) && mpCfg?.terminalId
      );
      const r: SyncResult = await syncOwner(b, cloud, {
        accounts: b.setting("sellerAccounts", {}),
        terminal: {
          terminalId: sellerTerminal ? mpCfg!.terminalId : "",
          enabled: sellerTerminal,
        },
        verifyCard: mpCfg
          ? async (orderId: string) => {
              // 2.0.3: cobro hecho directo en la terminal (modo normal): se revisa el pago.
              if (orderId.startsWith("PAY-")) {
                const p = await mpClient().payment(orderId.slice(4));
                return {
                  approved: p?.status === "approved",
                  amount: Math.round(Number(p?.transaction_amount || 0) * 100),
                };
              }
              const o = await mpClient().getOrder(orderId);
              return {
                approved: orderOutcome(o) === "approved",
                amount: orderPayment(o)?.amount || 0,
              };
            }
          : undefined,
        onApplied: (saleId: string, row: RemoteSale) => {
          if (row.mp?.orderId && mpCfg)
            try {
              const e = terminalPayments(b.saleDetail(saleId))[0];
              if (e) void reconcileFee(saleId, e);
            } catch {}
        },
      });
      setCloudStatus({
        ok: true,
        text: "Sincronizado",
        conflicts: r.conflicts,
        at: r.at,
      });
      // 2.1: respaldo automático en la nube, una vez al día, sin detener la app.
      if (backupDue(b) && !backingUp.current) {
        backingUp.current = true;
        void uploadBackup(b, cloud, VERSION, deviceId(b))
          .then(() => b.setSetting("cloudBackupError", null))
          .catch((e) =>
            b.setSetting("cloudBackupError", {
              at: new Date().toISOString(),
              text: errText(e),
            }),
          )
          .finally(() => (backingUp.current = false));
      }
      if (r.applied || r.customers) {
        refresh();
        if (r.applied)
          notify(
            `${r.applied} ${r.applied === 1 ? "venta de vendedor registrada" : "ventas de vendedores registradas"}`,
          );
      } else if (manual) notify("Sincronizado");
      if (manual || r.conflicts) void loadTeam();
    } catch (e) {
      setCloudStatus({ ok: false, text: errText(e) });
      if (manual) setTeamMsg({ text: errText(e), tone: "bad" });
    } finally {
      syncing.current = false;
      if (manual) setTeamBusy(false);
    }
  }
  syncRef.current = runSync;
  /** Una vez por sesión: registra este teléfono (o detecta que la cuenta está en otro). */
  async function ensureOwnerBound(cloud: Cloud) {
    if (ownerBound.current) return;
    const st = await cloud.rpc("request_join", { p_name: "" });
    if (st === "other_device") {
      setOwnerElsewhere(true);
      throw new Error(
        "Tu cuenta de dueño se abrió en otro teléfono. Si este es el del negocio, entra de nuevo en Equipo y vendedores.",
      );
    }
    if (st !== "owner")
      throw new Error("Esta cuenta no es la del dueño de la tienda.");
    setOwnerElsewhere(false);
    ownerBound.current = true;
  }
  async function loadTeam() {
    const cloud = getCloud();
    if (!cloud?.session) return;
    try {
      await ensureOwnerBound(cloud);
      const [members, conflicts, invites] = await Promise.all([
        cloud.select("members", "select=*&order=created_at.asc"),
        cloud.select(
          "sales",
          "select=*&status=eq.conflicto&order=created_at.asc",
        ),
        cloud
          .select("invites", "select=*&order=created_at.desc&limit=30")
          .catch(() => []),
      ]);
      // Correos de las cuentas (la función del servidor los lee con su clave; aquí no hay clave secreta).
      const usersRes = await cloud
        .invoke("cobro-terminal", { action: "usuarios" })
        .catch(() => null);
      setTeamData({
        members,
        conflicts,
        invites,
        users: usersRes?.ok ? usersRes.data?.users || [] : null,
      });
    } catch (e) {
      setTeamMsg({ text: errText(e), tone: "bad" });
    }
  }
  async function teamAction(fn: () => Promise<unknown>, ok?: string) {
    setTeamBusy(true);
    setTeamMsg(null);
    try {
      await fn();
      if (ok) setTeamMsg({ text: ok, tone: "ok" });
      await loadTeam();
    } catch (e) {
      setTeamMsg({ text: errText(e), tone: "bad" });
    } finally {
      setTeamBusy(false);
    }
  }
  /** Conecta este teléfono como dueño de la tienda en la base en línea. */
  async function connectOwner(mode: "signup" | "signin") {
    const conf =
      parseInvite(cloudForm.url || "") ||
      (cloudForm.url && cloudForm.key
        ? { url: normalizeUrl(cloudForm.url), anonKey: cloudForm.key.trim() }
        : !cloudForm.url && !cloudForm.key
          ? storeCloud()
          : null);
    if (!conf)
      return setTeamMsg({
        text: "Escribe la URL del proyecto y la clave pública (Supabase → Settings → API Keys).",
        tone: "bad",
      });
    if (!cloudForm.email?.trim() || !(cloudForm.password || "").trim())
      return setTeamMsg({
        text: "Escribe tu correo y una contraseña (mínimo 6 caracteres).",
        tone: "bad",
      });
    await teamAction(async () => {
      if (mode === "signup") {
        const c = new Cloud(conf, null, (ns: CloudSession | null) =>
          b!.setSetting("cloudSession", ns),
        );
        c.device = deviceId(b!);
        await c.signUp(cloudForm.email, cloudForm.password);
        await c.rpc("claim_owner", {
          p_name: cloudForm.name?.trim() || "Dueño",
        });
      } else {
        // Ya tengo cuenta: solo correo y contraseña. Este teléfono queda como el del dueño.
        const st = await loginHere(
          b!,
          cloudForm.email,
          cloudForm.password,
          conf,
        );
        if (st !== "owner") {
          b!.setSetting("cloudSession", null);
          throw new Error("Esa cuenta es de vendedor, no la del dueño.");
        }
      }
      b!.setSetting("cloudConfig", conf);
      cloudRef.current = null;
      ownerBound.current = false;
      if (!b!.setting("sellerAccounts", null)) {
        const first = (kind: string) =>
          data?.accounts.find((a) => a.kind === kind)?.id;
        b!.setSetting("sellerAccounts", {
          Efectivo: first("Efectivo"),
          Transferencia: first("Banco"),
          Tarjeta: first("Tarjeta"),
        });
      }
      setCloudForm({});
      refresh();
      await runSync();
    }, "Conectado. Tu catálogo ya está publicado para tus vendedores.");
  }
  const emailOf = (id: string) =>
    (teamData?.users || []).find((u) => u.id === id)?.email || "";
  /** Baja definitiva: borra la cuenta y su correo; sus ventas y cierres se conservan. */
  function deleteUser(id: string, name: string, email?: string) {
    Alert.alert(
      "Eliminar usuario",
      `Se borrará la cuenta de ${name}${email && email !== name ? ` (${email})` : ""} con su correo y datos de registro. Ya no podrá entrar; sus ventas y cierres de caja se conservan. No se puede deshacer.`,
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () =>
            void teamAction(async () => {
              const r = await getCloud()!.invoke("cobro-terminal", {
                action: "eliminar_usuario",
                userId: id,
              });
              if (!r.ok)
                throw new Error(
                  r.data?.message || `No se pudo eliminar (${r.status}).`,
                );
              setSellerCuts((x) => (x?.userId === id ? null : x));
            }, `${name} fue eliminado.`),
        },
      ],
    );
  }
  /** Código corto para un vendedor: personal, de un solo uso y con vencimiento. */
  async function createInvite() {
    const name = (cloudForm.inviteName || "").trim();
    if (!name)
      return setTeamMsg({
        text: "Escribe el nombre del vendedor para crear su código.",
        tone: "bad",
      });
    await teamAction(async () => {
      const code: string = await getCloud()!.rpc("create_invite", {
        p_name: name,
        p_days: 7,
      });
      const expires = new Date(Date.now() + 7 * 86400000).toISOString();
      setNewInvite({ code, name, expires });
      setCloudForm((x) => ({ ...x, inviteName: "" }));
    }, `Código creado para ${name}.`);
  }
  const inviteMessage = (code: string, name: string, expires: string) =>
    `Hola ${name}, para vender con GNS Nova Negocio:\n1. Instala la app (te paso el archivo APK).\n2. Ábrela y elige «Soy vendedor».\n3. Escribe tu código de invitación: *${formatShortCode(code)}*\n4. Pon tu nombre, tu correo y una contraseña, y toca «Crear mi cuenta».\nEl código es solo para ti, sirve una vez y vence el ${fmtDay(localDay(expires))}.`;
  const shareInvite = (code: string, name: string, expires: string) =>
    void Share.share({ message: inviteMessage(code, name, expires) }).catch(
      () => {},
    );
  /** Teléfono del cliente de la venta (si lo tiene). */
  const customerPhone = (v: Row) =>
    data?.customers.find((c) => c.id === v.customerId)?.phone || "";
  /** Abre WhatsApp con el texto; si no hay número, pide uno (o permite compartir con otra app). */
  async function deliverReceipt(v: Row, message: string, orderId = "") {
    const phone = whatsappNumber(customerPhone(v));
    if (!phone) return open("Enviar comprobante", { saleId: v.id, orderId });
    try {
      await Linking.openURL(
        `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      );
    } catch (e) {
      Alert.alert("Comprobante", errText(e));
    }
  }
  /** Comprobante del cobro con tarjeta en la terminal (con tarjeta, autorización y operación). */
  async function sendCardReceipt(v: Row, entry: Row) {
    let e = entry;
    if (mpCfg && (!e.card?.authorization || !e.card?.operation))
      e = await reconcileFee(v.id, e);
    const fresh = b!.saleDetail(v.id);
    await deliverReceipt(fresh, cardReceiptText(fresh, e), e.orderId);
  }
  async function startCharge(
    amountCents: number,
    draft: SaleDraft | null,
    test = false,
    abono?: Abono,
    attemptId?: number,
  ) {
    if (!mpCfg) return;
    const mine = attemptId ?? ++chargeAttempt.current;
    if (chargeAttempt.current !== mine) return;
    const reference =
      "NOVA-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8);
    setPay({
      amount: amountCents,
      draft,
      abono,
      test,
      outcome: "sending",
      text: "Enviando el cobro a la terminal…",
    });
    try {
      const order = await mpClient().createOrder({
        terminalId: mpCfg.terminalId,
        amount: amountCents,
        reference,
        description: test
          ? "Cobro de prueba Nova Negocio"
          : abono
            ? "Abono Nova Negocio"
            : "Venta Nova Negocio",
      });
      // Cancelado mientras se enviaba: se retira de la terminal y no se registra nada.
      if (chargeAttempt.current !== mine)
        return void mpClient()
          .cancelOrder(order.id)
          .catch(() => {});
      // Si la app se cierra durante el cobro, al volver se puede revisar y registrar.
      b!.setSetting("mpPending", {
        orderId: order.id,
        amount: amountCents,
        draft,
        abono: abono || null,
        test,
        created: new Date().toISOString(),
      });
      setPay({
        orderId: order.id,
        amount: amountCents,
        draft,
        abono,
        test,
        outcome: "pending",
        text: outcomeText(order),
        order,
        tick: 0,
      });
    } catch (e) {
      if (chargeAttempt.current === mine)
        setPay({
          amount: amountCents,
          draft,
          abono,
          test,
          outcome: "error",
          text: errText(e),
        });
    }
  }
  /** Antes de cobrar, confirma que la terminal está en modo Punto de Venta. */
  async function checkTerminalThenCharge(
    amountCents: number,
    draft: SaleDraft | null,
    abono?: Abono,
  ) {
    if (!mpCfg) return;
    const what = abono ? "registra el abono" : "registra la venta";
    const mine = ++chargeAttempt.current;
    setPay({
      amount: amountCents,
      draft,
      abono,
      outcome: "sending",
      text: "Revisando la terminal…",
    });
    try {
      const list = await mpClient().terminals();
      if (chargeAttempt.current !== mine) return;
      const t = list.find((x) => x.id === mpCfg.terminalId);
      if (!t)
        return setPay({
          amount: amountCents,
          draft,
          abono,
          outcome: "notpdv",
          since: new Date().toISOString(),
          text: `La terminal elegida ya no aparece en tu cuenta de Mercado Pago. Revisa Parámetros → Terminal Mercado Pago, o ${what} sin terminal.`,
        });
      if (t.operating_mode !== "PDV")
        return setPay({
          amount: amountCents,
          draft,
          abono,
          outcome: "notpdv",
          since: new Date().toISOString(),
          text: manualOwnerText(amountCents),
        });
    } catch (e) {
      // Si la clave falla, no tiene caso intentar; si solo falló la consulta de
      // terminales (red lenta, servicio caído), se intenta el cobro de todos modos.
      if (chargeAttempt.current !== mine) return;
      if (e instanceof MpError && (e.status === 401 || e.status === 403))
        return setPay({
          amount: amountCents,
          draft,
          abono,
          outcome: "error",
          text: errText(e),
        });
    }
    await startCharge(amountCents, draft, false, abono, mine);
  }
  /** «Ya cobré»: busca en Mercado Pago el pago hecho directo en la terminal (modo normal). */
  async function findManualPayment() {
    const p = payRef.current;
    if (!p || !mpCfg) return;
    const since = p.since || new Date(Date.now() - 15 * 60_000).toISOString();
    setPay({
      ...p,
      outcome: "searching",
      text: "Buscando el pago en Mercado Pago…",
    });
    try {
      // Mismo margen que el servidor: 5 min por el reloj y al menos los últimos 45 min.
      const from = Math.max(
        Date.now() - 24 * 3600_000,
        Math.min(Date.now() - 45 * 60_000, Date.parse(since) - 5 * 60_000),
      );
      let found = { matches: [] as TerminalPayment[], other: 0 };
      for (let i = 0; i < 4; i++) {
        found = await mpClient().findTerminalPayments(p.amount, from, (id) =>
          b!.paymentLinked(id),
        );
        if (found.matches.length) break;
        if (i < 3) await new Promise((r) => setTimeout(r, POLL_MS()));
      }
      if (payRef.current?.since !== p.since) return;
      if (found.matches.length === 1)
        return linkManualPayment(found.matches[0]);
      if (found.matches.length > 1)
        return setPay({
          ...p,
          outcome: "choose",
          found: found.matches,
          text: "Hay varios pagos por ese monto. Elige el de esta venta (revisa la hora y los últimos 4 dígitos):",
        });
      setPay({
        ...p,
        outcome: "notpdv",
        text:
          `Todavía no aparece un pago aprobado de ${money(p.amount)} cobrado en la terminal. Revisa que la terminal diga «Aprobado» y vuelve a tocar «Ya cobré».` +
          (found.other
            ? ` Hay ${found.other === 1 ? "un pago" : `${found.other} pagos`} por ese monto que no ${found.other === 1 ? "viene" : "vienen"} de la terminal.`
            : ""),
      });
    } catch (e) {
      setPay({ ...p, outcome: "notpdv", text: errText(e) });
    }
  }
  /** Liga el pago encontrado: se registra igual que un cobro enviado a la terminal (con tarjeta y comisión real). */
  function linkManualPayment(found: TerminalPayment) {
    const p = payRef.current;
    if (!p) return;
    if (b!.paymentLinked(found.id))
      return setPay({
        ...p,
        outcome: "notpdv",
        text: "Ese pago ya está registrado en otra venta.",
      });
    const order = manualOrder(found);
    payRef.current = { ...p, orderId: order.id };
    finishApproved(order);
  }
  /** La terminal no recibe el cobro (p. ej. aún no se reinicia tras cambiar de modo): se retira y se cobra ahí directo. */
  async function chargeOnTerminalInstead() {
    const p = payRef.current;
    if (!p?.orderId) return;
    try {
      await mpClient().cancelOrder(p.orderId);
      b!.setSetting("mpPending", null);
      setPay({
        ...p,
        orderId: undefined,
        order: undefined,
        outcome: "notpdv",
        since: new Date().toISOString(),
        text: manualOwnerText(p.amount),
      });
    } catch (e) {
      setPay({
        ...p,
        text:
          errText(e) + " Si la terminal ya muestra el cobro, termínalo ahí.",
        fails: (p.fails || 0) + 1,
      });
    }
  }
  /** Registra la venta sin pasar por la terminal (cuando ya se cobró aparte). */
  function registerWithoutTerminal() {
    const p = payRef.current;
    if (!p?.draft && !p?.abono) return;
    try {
      let msg = "";
      if (p.abono) {
        b!.collect(p.abono.saleId, p.abono.accountId, p.amount);
        msg = "Abono registrado";
      } else msg = registerSale(p.draft!).msg;
      setPay(null);
      refresh();
      if (form === "Venta" || form === "Abono") close();
      notify(msg);
    } catch (e) {
      setPay({ ...p, outcome: "error", text: errText(e) });
    }
  }
  /** Comprobante de venta: por WhatsApp al teléfono del cliente (o pide el número). */
  async function sendReceipt(v: Row) {
    await deliverReceipt(v, saleReceiptText(v));
  }
  function finishApproved(order: any) {
    const p = payRef.current;
    const orderId: string = order?.id || p?.orderId || "";
    if (!p || !orderId || doneOrders.current.has(orderId)) return;
    doneOrders.current.add(orderId);
    b!.setSetting("mpPending", null);
    if (p.test || (!p.draft && !p.abono)) {
      setPay({
        ...p,
        outcome: "approved",
        order,
        text: "Pago de prueba aprobado. Devuélvelo para recuperar tu dinero.",
      });
      refresh();
      return;
    }
    try {
      let msg = "";
      let saleId = "";
      if (p.abono) {
        b!.collect(p.abono.saleId, p.abono.accountId, p.amount);
        saleId = p.abono.saleId;
        msg = "Abono registrado";
      } else {
        const r = registerSale(p.draft!, {
          orderId,
          paymentId: orderPayment(order)?.id,
        });
        saleId = r.saleId;
        msg = r.msg;
      }
      try {
        recordMpPayment(
          saleId,
          order,
          orderId,
          p.abono ? "abono" : "venta",
          p.amount,
        );
      } catch {}
      // Se queda en pantalla para ofrecer el comprobante por WhatsApp.
      setPay({
        ...p,
        outcome: "done",
        order,
        orderId,
        saleId,
        text: `Pago aprobado ✓ ${msg}.`,
      });
      refresh();
      if (form === "Venta" || form === "Abono") close();
      notify("Pago aprobado · " + msg);
    } catch (e) {
      setPay({
        ...p,
        outcome: "approved",
        order,
        saleError: true,
        text: `El pago se aprobó, pero ${p.abono ? "el abono" : "la venta"} no se pudo registrar: ${errText(e)} Devuelve el cobro o regístralo manualmente.`,
      });
    }
  }
  async function cancelCharge() {
    const p = payRef.current;
    if (!p) return;
    if (!p.orderId) {
      chargeAttempt.current++;
      return setPay(null);
    }
    try {
      await mpClient().cancelOrder(p.orderId);
      b!.setSetting("mpPending", null);
      setPay({
        ...p,
        outcome: "canceled",
        text: "Cobro cancelado. No se registró la venta.",
      });
    } catch (e) {
      setPay({
        ...p,
        text: errText(e),
        tick: (p.tick || 0) + 1,
        fails: (p.fails || 0) + 1,
      });
    }
  }
  /** Sin respuesta de Mercado Pago: cierra la ventana; el cobro queda en Vender para revisarlo. */
  function reviewLater() {
    setPay(null);
    if (form === "Venta" || form === "Abono") close();
    refresh();
    notify("El cobro quedó pendiente: revísalo en Vender");
  }
  async function refundCharge(orderId: string) {
    try {
      await mpClient().refundOrder(orderId);
      setPay(null);
      refresh();
      notify("Cobro devuelto en Mercado Pago");
    } catch (e) {
      Alert.alert("Mercado Pago", errText(e));
    }
  }
  const act = (fn: () => void, done?: string) => {
    try {
      fn();
      refresh();
      if (done) notify(done);
      return true;
    } catch (e) {
      Alert.alert(
        "Revisa la operación",
        e instanceof Error ? e.message : String(e),
      );
      return false;
    }
  };
  const defaults: Record<string, Record<string, string>> = {
    Producto: { minimum: "1" },
    Cliente: { stage: "Prospecto" },
    Campaña: { channel: "Instagram", status: "Borrador" },
    Compañía: { kind: "Mi negocio" },
    Ubicación: { kind: "Tienda" },
    Venta: { channel: "Mostrador", qty: "1" },
    Entrada: { mode: "Inventario inicial", label: "Entrada", qty: "1" },
    Cuenta: { kind: "Efectivo" },
    Movimiento: { kind: "expense" },
    Paquete: { qty: "1" },
    "Ajuste de inventario": { reason: "Conteo físico" },
  };
  const cashAccount = () =>
    data?.accounts.find((a) => a.kind === "Efectivo")?.id || "";
  function open(
    name: string,
    values: Record<string, string> = {},
    nestedField?: string,
  ) {
    if (nestedField)
      setStack((prev) => [
        ...prev,
        { form, f, cart, allow, advanced, field: nestedField },
      ]);
    else setStack([]);
    setF({
      ...defaults[name],
      ...(name === "Venta" && !values.accountId
        ? { accountId: cashAccount() }
        : {}),
      ...values,
    });
    saveBusy.current = false;
    setCart([]);
    setAllow(false);
    setAdvanced(false);
    setFormError("");
    setForm(name);
    setSelector(null);
  }
  /** Ajusta las piezas a lo disponible (paquetes, carrito guardado de otro día). */
  function fitItems(items: Cart, locationId: string | null) {
    const short: string[] = [];
    const fitted = items
      .map((i) => {
        const limit = cartLimit(i.productId, "Venta", locationId);
        if (i.qty > limit)
          short.push(
            `${productName(i.productId)}: ${limit ? `solo ${units(limit)}` : "sin existencias"}`,
          );
        return { ...i, qty: Math.min(i.qty, limit) };
      })
      .filter((i) => i.qty > 0);
    return { fitted, short };
  }
  /** Una pieza más al carrito (sin pasar de lo disponible). */
  function addToBasket(productId: string, qty = 1, quiet = false) {
    const limit = Math.max(
      0,
      data?.products.find((x) => x.id === productId)?.available ?? 0,
    );
    const current =
      basketRef.current.find((i) => i.productId === productId)?.qty ?? 0;
    if (current + qty > limit) {
      warn(
        limit
          ? `Ya tienes en el carrito las ${units(limit)} disponibles de ${productName(productId)}.`
          : `${productName(productId)} no tiene existencias.`,
      );
      return false;
    }
    setBasket((old) => addTo(old, productId, qty));
    if (!quiet) notify(`🛒 ${productName(productId)} en el carrito`);
    return true;
  }
  function removeFromBasket(productId: string) {
    setBasket((old) =>
      old.flatMap((i) =>
        i.productId !== productId
          ? [i]
          : i.qty > 1
            ? [{ ...i, qty: i.qty - 1 }]
            : [],
      ),
    );
  }
  /** Abre el carrito: ahí se elige cliente, forma de cobro y se ve el desglose. */
  function openCheckout() {
    checkoutFromBasket.current = true;
    open("Venta", basketF);
    const { fitted, short } = fitItems(
      basketRef.current,
      basketF.locationId || null,
    );
    setCart(fitted);
    if (short.length)
      setFormError(
        `Ajusté las cantidades a lo disponible en inventario. ${short.join(" · ")}.`,
      );
  }
  /** Vacía el carrito (y cierra el cobro si estaba abierto desde el carrito). */
  function emptyBasket() {
    basketRef.current = [];
    setBasket([]);
    setBasketF({});
    if (form === "Venta" && checkoutFromBasket.current) {
      setCart([]);
      checkoutFromBasket.current = false;
      close();
      go("Vender");
    }
    notify("Carrito vacío");
  }
  /** Seguir eligiendo productos sin perder lo capturado (cliente, cuenta, notas). */
  function keepShopping() {
    const keep = { ...f };
    delete keep.total;
    delete keep.paid;
    setBasketF(keep);
    close();
    go("Vender");
  }
  const openSale = (values: Record<string, string> = {}, items: Cart = []) => {
    // Paquete: se cobra directo a su precio (no pasa por el carrito).
    if (items.length && values.total) {
      checkoutFromBasket.current = false;
      open("Venta", values);
      const { fitted, short } = fitItems(items, values.locationId || null);
      setCart(fitted);
      if (short.length)
        setFormError(
          `Ajusté las cantidades a lo disponible en inventario. ${short.join(" · ")}.`,
        );
      return;
    }
    if (items.length) {
      for (const i of items) addToBasket(i.productId, i.qty);
      return;
    }
    if (Object.keys(values).length)
      setBasketF((old) => ({ ...old, ...values }));
    if (basketRef.current.length) openCheckout();
    else go("Vender");
  };
  function close(id?: string) {
    setSelector(null);
    setFormError("");
    if (stack.length) {
      const last = stack[stack.length - 1];
      const restoredF = {
        ...last.f,
        ...(id && last.field !== "cartAdd" ? { [last.field]: id } : {}),
      };
      // Producto dado de alta desde la venta: se agrega solo si tiene existencias.
      // (se consulta la base: el producto recién creado aún no está en los datos de la pantalla)
      const canAdd =
        !!id &&
        last.field === "cartAdd" &&
        (!["Venta", "Modificar venta"].includes(last.form) ||
          (b?.sellable(id, last.f.locationId || null) ?? 0) >= 1);
      const restoredCart = canAdd ? addTo(last.cart, id!, 1) : last.cart;
      if (id && last.field === "cartAdd" && !canAdd)
        setTimeout(
          () =>
            setGridMsg(
              `${productName(id)} se dio de alta sin existencias: registra una entrada para venderlo.`,
            ),
          0,
        );
      setForm(last.form);
      setF(restoredF);
      setCart(restoredCart);
      setAllow(last.allow);
      setAdvanced(last.advanced);
      setStack(stack.slice(0, -1));
      sessionRef.current = {
        version: 1,
        page,
        history,
        query,
        form: last.form,
        f: restoredF,
        cart: restoredCart,
        allow: false,
        advanced: last.advanced,
        stack: stack.slice(0, -1),
        productDetailId,
        saleDetailId,
        basket: basketRef.current,
        basketF,
        fromBasket: checkoutFromBasket.current,
      };
    } else {
      setForm("");
      setF({});
      setCart([]);
      setAllow(false);
      setAdvanced(false);
      setStack([]);
      // Se guarda de inmediato: si la app se cierra justo después de cobrar, el
      // borrador ya no reaparece (evita registrar dos veces la misma venta).
      checkoutFromBasket.current = false;
      sessionRef.current = {
        version: 1,
        page,
        history,
        query,
        form: "",
        f: {},
        cart: [],
        allow: false,
        advanced: false,
        stack: [],
        productDetailId,
        saleDetailId,
        basket: basketRef.current,
        basketF,
        fromBasket: false,
      };
    }
    flushSession();
  }
  const go = (p: string, filter?: string) => {
    if (filter !== undefined) setFilters((old) => ({ ...old, [p]: filter }));
    if (p === page) return;
    setHistory((old) => (TABS.some((t) => t.name === p) ? [] : [...old, page]));
    setPage(p);
    setQuery("");
  };
  goRef.current = go;
  const back = () => {
    if (history.length) {
      setPage(history[history.length - 1]);
      setHistory(history.slice(0, -1));
      setQuery("");
    } else if (page !== HOME) {
      setPage(HOME);
      setQuery("");
    } else {
      Alert.alert("Salir de Nova Negocio", "¿Deseas salir de la app?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Salir", onPress: () => BackHandler.exitApp() },
      ]);
    }
  };
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      // Con la ventana de cobro abierta, "atrás" no mueve nada detrás de ella.
      if (payRef.current) return true;
      if (!form) back();
      return true;
    });
    return () => sub.remove();
  }, [page, history, form]);

  function addTo(list: Cart, productId: string, qty: number): Cart {
    const found = list.find((i) => i.productId === productId);
    return found
      ? list.map((i) =>
          i.productId === productId ? { ...i, qty: i.qty + qty } : i,
        )
      : [...list, { productId, qty }];
  }
  /**
   * Máximo de unidades que se pueden poner en el carrito: lo disponible en
   * inventario. Al modificar una venta se suman las unidades que ya tiene esa
   * venta (regresarían al inventario). Los paquetes no tienen límite.
   */
  // Cálculos de existencias por pantalla: una consulta por ubicación/venta, no una por producto.
  const limitCache = new Map<string, Map<string, number>>();
  const cached = (key: string, make: () => Map<string, number>) => {
    let m = limitCache.get(key);
    if (!m) limitCache.set(key, (m = make()));
    return m;
  };
  function cartLimit(
    productId: string,
    mode = form,
    location?: string | null,
  ): number {
    if (mode !== "Venta" && mode !== "Modificar venta")
      return Number.POSITIVE_INFINITY;
    const loc = location !== undefined ? location : f.locationId || null;
    // Con ubicación elegida, solo cuenta lo que hay en esa ubicación (igual que al cobrar).
    let limit = Math.max(
      0,
      loc && b
        ? (cached("loc:" + loc, () => b.sellableByProduct(loc)).get(
            productId,
          ) ?? 0)
        : (productById.get(productId)?.available ?? 0),
    );
    if (mode === "Modificar venta" && f.saleId && b)
      limit +=
        cached(
          "sale:" + f.saleId,
          () =>
            new Map(
              b
                .all(
                  "SELECT productId,SUM(qty) n FROM sale_lines WHERE saleId=? GROUP BY productId",
                  f.saleId,
                )
                .map((r) => [r.productId, r.n as number]),
            ),
        ).get(productId) ?? 0;
    return limit;
  }
  const productName = (productId: string) =>
    productById.get(productId)?.name || "Este producto";
  /** Toca la foto: una pieza más, sin pasar de lo disponible. */
  function addOne(productId: string) {
    const limit = cartLimit(productId);
    const current = cart.find((i) => i.productId === productId)?.qty ?? 0;
    if (current + 1 > limit) {
      setGridMsg(
        limit
          ? `Ya agregaste las ${units(limit)} disponibles de ${productName(productId)}.`
          : `${productName(productId)} no tiene existencias disponibles.`,
      );
      return;
    }
    setGridMsg("");
    setCart((old) => addTo(old, productId, 1));
  }
  function removeOne(productId: string) {
    setGridMsg("");
    setCart((old) =>
      old.flatMap((i) =>
        i.productId !== productId
          ? [i]
          : i.qty > 1
            ? [{ ...i, qty: i.qty - 1 }]
            : [],
      ),
    );
  }
  function changeQty(productId: string, delta: number) {
    const limit = delta > 0 ? cartLimit(productId) : Number.POSITIVE_INFINITY;
    const current = cart.find((i) => i.productId === productId)?.qty ?? 0;
    if (delta > 0 && current + delta > limit) {
      setFormError(
        `Solo hay ${units(limit)} ${limit === 1 ? "disponible" : "disponibles"} de ${productName(productId)}.`,
      );
      return;
    }
    setFormError("");
    setCart((old) =>
      old.map((i) =>
        i.productId === productId
          ? { ...i, qty: Math.max(1, i.qty + delta) }
          : i,
      ),
    );
  }

  const setPeriod = (p: string) => {
    setPeriodState(p);
    try {
      b?.setSetting("homePeriod", p);
    } catch {}
  };

  /** Excel con el detalle de ventas del periodo (ventas, productos, cobros y resumen). */
  async function exportExcel(period: ExportPeriod) {
    if (!b || excel?.busy) return;
    setExcel({ period, busy: true });
    try {
      await new Promise((r) => setTimeout(r, 30)); // deja ver "Generando…" antes del cálculo
      const { bytes, count, fileName } = salesWorkbook(b, period);
      assert(count > 0, "No hay ventas en ese periodo.");
      const uri = FS.documentDirectory + fileName;
      await FS.writeAsStringAsync(uri, base64(bytes), {
        encoding: FS.EncodingType.Base64,
      });
      assert(
        await Sharing.isAvailableAsync(),
        "No se pudo abrir el menú para compartir.",
      );
      await Sharing.shareAsync(uri, {
        mimeType: XLSX_MIME,
        dialogTitle: "Guardar Excel de ventas",
        UTI: "org.openxmlformats.spreadsheetml.sheet",
      });
      await pruneFiles("Ventas_Nova_", 3, (name) =>
        name.replace(/^.*_(\d{4}-\d{2}-\d{2}_\d{4})\.xlsx$/, "$1"),
      );
      notify(`Excel listo · ${count} ${count === 1 ? "venta" : "ventas"}`);
      setExcel(null);
    } catch (e) {
      Alert.alert("Excel de ventas", errText(e));
      setExcel({ period, busy: false });
    }
  }
  async function exportBackup() {
    if (!b) return;
    try {
      const uri = FS.documentDirectory + `Nova-respaldo-${Date.now()}.json`;
      // Las fotos viven en archivos: se incrustan para que el respaldo funcione en otro teléfono.
      await FS.writeAsStringAsync(uri, await inlinePhotos(b.backup()));
      assert(
        await Sharing.isAvailableAsync(),
        "No se pudo abrir el menú para compartir.",
      );
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        UTI: "public.json",
        dialogTitle: "Guardar respaldo de Nova",
      });
      b.setSetting("lastBackupAt", new Date().toISOString());
      await pruneFiles("Nova-respaldo-", 3);
      refresh();
    } catch (e) {
      Alert.alert("Respaldo", String(e));
    }
  }
  /** Conserva solo los últimos `keep` archivos con ese prefijo dentro de la app. */
  async function pruneFiles(
    prefix: string,
    keep: number,
    order: (name: string) => string = (n) => n,
  ) {
    try {
      const files = (await FS.readDirectoryAsync(FS.documentDirectory!))
        .filter((x: string) => x.startsWith(prefix))
        .sort((x: string, y: string) => order(x).localeCompare(order(y)));
      for (const name of files.slice(0, Math.max(0, files.length - keep)))
        await FS.deleteAsync(FS.documentDirectory + name, { idempotent: true });
    } catch {}
  }
  async function importBackup() {
    try {
      const r = await Picker.getDocumentAsync({
        type: ["application/json", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (r.canceled) return;
      const raw = await FS.readAsStringAsync(r.assets[0].uri);
      Alert.alert(
        "Restaurar respaldo",
        "Reemplazará los datos actuales. Se conservará una copia previa dentro de la app.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Restaurar",
            style: "destructive",
            onPress: async () => {
              try {
                await FS.writeAsStringAsync(
                  FS.documentDirectory +
                    `Nova-antes-de-restaurar-${Date.now()}.json`,
                  await inlinePhotos(b!.backup()),
                );
                await pruneFiles("Nova-antes-de-restaurar-", 3);
                if (act(() => b!.restore(raw), "Respaldo restaurado")) {
                  b!.restoreBasePrices();
                  await migratePhotos(b!);
                  await removeOrphanPhotos(b!);
                  refresh();
                }
              } catch (e) {
                Alert.alert("No se restauró", String(e));
              }
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert("Respaldo", String(e));
    }
  }
  /** 2.1 · Restaura un respaldo descargado de la nube (ya verificado), con copia previa local. */
  async function restoreFromCloud(raw: string) {
    await FS.writeAsStringAsync(
      FS.documentDirectory + `Nova-antes-de-restaurar-${Date.now()}.json`,
      await inlinePhotos(b!.backup()),
    );
    await pruneFiles("Nova-antes-de-restaurar-", 3);
    b!.restore(raw);
    b!.restoreBasePrices();
    await migratePhotos(b!);
    await removeOrphanPhotos(b!);
    refresh();
    notify("Respaldo de la nube restaurado");
  }
  async function previousBackup() {
    try {
      const files = (await FS.readDirectoryAsync(FS.documentDirectory!))
        .filter((x: string) => x.startsWith("Nova-antes-de-restaurar"))
        .sort();
      assert(files.length, "Aún no hay una copia previa.");
      await Sharing.shareAsync(FS.documentDirectory + files[files.length - 1], {
        mimeType: "application/json",
        UTI: "public.json",
      });
    } catch (e) {
      Alert.alert("Respaldo", String(e));
    }
  }

  // ---------- Pantallas ----------
  const matching = (rows: Row[]) =>
    rows.filter((r) =>
      normalize(
        [
          r.name,
          r.sku,
          r.brand,
          r.barcode,
          r.phone,
          r.channel,
          r.code,
          r.customer,
          r.folio,
        ].join(" "),
      ).includes(normalize(query)),
    );
  const editProduct = (p: Row) => {
    const { imageUri, ...rest } = p;
    // La foto guardada no se copia al borrador: así el borrador no pesa ~1 MB por tecla.
    open("Producto", {
      ...strings(rest),
      ...strings(b!.relation("product", p.id)),
      price: amount(p.price),
      ...(imageUri ? { hasPhoto: "1" } : {}),
    });
  };
  /** Abre la venta para devolver productos o cambiar cantidades/precio. */
  const openRevise = (v: Row) => {
    const byAccount = new Map<string, number>();
    for (const x of v.movements as Row[])
      if (x.kind === "sale" && x.amount > 0)
        byAccount.set(
          x.accountId,
          (byAccount.get(x.accountId) ?? 0) + x.amount,
        );
    const main =
      [...byAccount].sort((a, z) => z[1] - a[1])[0]?.[0] || cashAccount();
    open("Modificar venta", {
      saleId: v.id,
      refundAccountId: main,
      mpRefund: v.mpOrderId && v.mpPaymentId ? "1" : "",
    });
    setCart(
      (v.lines as Row[]).map((l) => ({ productId: l.productId, qty: l.qty })),
    );
  };
  const editCampaign = (c: Row) =>
    open("Campaña", { ...strings(c), budget: amount(c.budget || 0) });
  const searchBox = (placeholder: string) => (
    <SearchBox value={query} onChange={setQuery} placeholder={placeholder} />
  );
  const filterChips = (key: string, list: string[]) => (
    <View style={{ marginBottom: 10 }}>
      <Chips
        options={options(list)}
        value={filters[key] || list[0]}
        onChange={(v) => setFilters((old) => ({ ...old, [key]: v }))}
      />
    </View>
  );
  const sellButton = (p: Row) => {
    const n = basket.find((i) => i.productId === p.id)?.qty ?? 0;
    return (
      <Button
        title={n ? `🛒 En el carrito: ${n} · ＋1` : "🛒 Al carrito"}
        small
        disabled={p.available < 1 || n >= p.available}
        onPress={() => addToBasket(p.id)}
      />
    );
  };

  const line = (
    label: string,
    value: string,
    opts: {
      bold?: boolean;
      color?: string;
      indent?: boolean;
      onPress?: () => void;
    } = {},
  ) => {
    const content = (
      <>
        <Text
          style={[
            s.body,
            { flex: 1 },
            opts.indent && { paddingLeft: 14, color: C.muted },
            opts.bold && { fontWeight: "800" },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            s.body,
            { fontWeight: opts.bold ? "800" : "600" },
            opts.color ? { color: opts.color } : null,
          ]}
        >
          {value}
          {opts.onPress ? "  ›" : ""}
        </Text>
      </>
    );
    return opts.onPress ? (
      <Pressable
        key={label}
        accessibilityRole="button"
        onPress={opts.onPress}
        style={[s.between, { paddingVertical: 3 }]}
      >
        {content}
      </Pressable>
    ) : (
      <View key={label} style={[s.between, { paddingVertical: 3 }]}>
        {content}
      </View>
    );
  };
  const divider = () => (
    <View style={{ height: 1, backgroundColor: C.line, marginVertical: 8 }} />
  );
  const feePct = feeLabel(data?.feeBps);
  /** Ventas netas = suma de las formas de pago; solo tarjeta descuenta su comisión. */
  const excelCard = () =>
    excel ? (
      <Card tone="ok">
        <Text style={s.subtitle}>📥 Excel de ventas</Text>
        <Note>
          Cada venta con sus productos, cómo se cobró, montos, si generó
          comisión de tarjeta (y cuánto), neto, costo y utilidad; más hojas de
          productos vendidos, cobros y un resumen.
        </Note>
        <View style={{ height: 6 }} />
        <Chips
          options={options([...EXPORT_PERIODS])}
          value={excel.period}
          onChange={(v) => setExcel({ period: v as ExportPeriod, busy: false })}
        />
        <View style={{ height: 6 }} />
        <Button
          title={
            excel.busy ? "Generando…" : `Descargar Excel · ${excel.period}`
          }
          disabled={excel.busy}
          onPress={() => void exportExcel(excel.period)}
        />
        <Button title="Cerrar" secondary small onPress={() => setExcel(null)} />
      </Card>
    ) : (
      <Button
        title="📥 Descargar Excel de ventas"
        secondary
        small
        onPress={() => setExcel({ period: "Este mes", busy: false })}
      />
    );
  const byMethodCard = (ps: Row) => (
    <Card>
      <Text style={s.subtitle}>Ventas por forma de pago</Text>
      {ps.byMethod.map((x: Row) =>
        x.method === "Tarjeta" ? (
          <View key="Tarjeta">
            {line("Tarjeta", money(x.gross))}
            {line(`Comisión Mercado Pago ${feePct}`, minus(x.fee), {
              indent: true,
              color: C.red,
            })}
            {line("Tarjeta neta", money(x.net), { indent: true })}
          </View>
        ) : (
          line(x.method, money(x.gross))
        ),
      )}
      {ps.receivable > 0 &&
        line("Por cobrar (a crédito)", money(ps.receivable), {
          color: C.amber,
          onPress: () => go("Ventas", "Por cobrar"),
        })}
      {!ps.byMethod.length && !ps.receivable && (
        <Note>Sin ventas en este periodo.</Note>
      )}
      {divider()}
      {line("Ventas netas", money(ps.netSales), { bold: true })}
      {ps.commissions > 0 &&
        line(
          "Comisión absorbida por clientes (incluida)",
          money(ps.commissions),
          { indent: true },
        )}
      <Note>
        Tus clientes absorben la comisión con cualquier forma de pago. Mercado
        Pago descuenta la suya solo en cobros con tarjeta.
      </Note>
    </Card>
  );
  /** Disponible = ventas netas (la comisión ya se descontó solo de tarjeta) − gastos operativos. */
  const resultCard = (ps: Row) => {
    const card = ps.byMethod.find((x: Row) => x.method === "Tarjeta");
    return (
      <Card>
        <Text style={s.subtitle}>Resultado</Text>
        {ps.byMethod.map((x: Row) =>
          line(
            x.method === "Tarjeta" ? "Tarjeta (neta de comisión)" : x.method,
            money(x.net),
          ),
        )}
        {ps.receivable > 0 &&
          line("Por cobrar (a crédito)", money(ps.receivable), {
            color: C.amber,
          })}
        {divider()}
        {line("Ventas netas", money(ps.netSales), { bold: true })}
        {line("Gastos operativos", minus(ps.expenses), {
          color: C.red,
          onPress: () => go("Control Operativo"),
        })}
        {divider()}
        {line("Disponible", money(ps.available), {
          bold: true,
          color: C.green,
        })}
        <Note>
          {card?.fee
            ? `La comisión de tarjeta (${money(card.fee)}) solo se descontó de los ${money(card.gross)} cobrados con tarjeta; transferencia y efectivo no pagan comisión. Ventas totales − gastos operativos, sin descontar esa comisión, serían ${money(ps.afterExpenses)}.`
            : "Transferencia y efectivo no pagan comisión."}
        </Note>
      </Card>
    );
  };
  const DELETE_NOTE =
    "La venta desaparece por completo: renglones, cobro, devolución y, si fue con tarjeta, también su comisión. Las unidades ya regresaron al inventario al cancelarla. No se puede deshacer (salvo restaurando un respaldo).";
  const confirmDeleteSale = (v: Row, after?: () => void) =>
    Alert.alert(
      "Eliminar venta cancelada",
      `${v.folio || v.id.slice(-8).toUpperCase()} · ${money(v.total)}\n\n${DELETE_NOTE}`,
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => {
            if (act(() => b!.deleteCancelledSale(v.id), "Venta eliminada"))
              after?.();
          },
        },
      ],
    );
  const confirmDeleteAllCancelled = (list: Row[]) =>
    Alert.alert(
      "Eliminar ventas canceladas",
      `Se eliminarán ${list.length} ${list.length === 1 ? "venta cancelada" : "ventas canceladas"}.\n\n${DELETE_NOTE}`,
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Eliminar todas",
          style: "destructive",
          onPress: () => {
            const failed: string[] = [];
            for (const v of list)
              try {
                b!.deleteCancelledSale(v.id);
              } catch (e) {
                failed.push(
                  `${v.folio || v.id.slice(-8).toUpperCase()}: ${e instanceof Error ? e.message : String(e)}`,
                );
              }
            refresh();
            if (failed.length)
              Alert.alert("Algunas no se eliminaron", failed.join("\n"));
            else
              notify(
                `${list.length} ${list.length === 1 ? "venta eliminada" : "ventas eliminadas"}`,
              );
          },
        },
      ],
    );
  type Body =
    | { scroll: React.ReactNode }
    | {
        list: {
          data: Row[];
          header: React.ReactNode;
          item: (r: Row) => React.ReactElement;
          empty: React.ReactNode;
        };
      };
  function renderPage(): Body {
    return renderOwnerPage({
      data,
      page,
      b,
      currentPeriod,
      setPeriod,
      excelCard,
      byMethodCard,
      resultCard,
      line,
      divider,
      go,
      open,
      cashAccount,
      setPay,
      cloudStatus,
      exportBackup,
      gridProducts,
      basket,
      productById,
      addToBasket,
      removeFromBasket,
      saleSeg,
      setSaleSeg,
      emptyBasket,
      filters,
      matching,
      searchBox,
      filterChips,
      setProductDetailId,
      sellButton,
      editProduct,
      query,
      productDetailId,
      act,
      saleDetailId,
      sendReceipt,
      openRevise,
      mpCfg,
      errText,
      mpClient,
      confirmDeleteSale,
      back,
      sendCardReceipt,
      reconcileFee,
      setFilters,
      confirmDeleteAllCancelled,
      setSaleDetailId,
      openSale,
      editCampaign,
      corteDay,
      setCorteDay,
      revision,
      notify,
      refresh,
      syncRef,
      trEdit,
      setTrEdit,
      setTrErr,
      trErr,
      getCloud,
      cloudForm,
      setCloudForm,
      teamData,
      teamMsg,
      teamBusy,
      connectOwner,
      runSync,
      ownerElsewhere,
      teamAction,
      cloudRef,
      ownerBound,
      setOwnerElsewhere,
      emailOf,
      setTeamMsg,
      sellerCuts,
      setSellerCuts,
      pwFor,
      setPwFor,
      deleteUser,
      createInvite,
      newInvite,
      shareInvite,
      setTeamData,
      setCloudStatus,
      setMpBusy,
      setMpMsg,
      mpMsg,
      mpToken,
      setMpToken,
      mpBusy,
      authAvailable,
      setMpTerms,
      mpTerms,
      mpPdvSet,
      setMpPdvSet,
      startCharge,
      importBackup,
      previousBackup,
      restoreFromCloud,
      lockApi,
    });
  }

  const body = useMemo(
    () => (data && b ? renderPage() : null),
    [
      data,
      page,
      query,
      history,
      productDetailId,
      saleDetailId,
      filters,
      currentPeriod,
      wide,
      authAvailable,
      lockApi.bioEnabled,
      lockApi.bioAvailable,
      mpToken,
      mpTerms,
      mpMsg,
      mpBusy,
      mpPdvSet,
      corteDay,
      cloudForm,
      teamData,
      teamMsg,
      teamBusy,
      cloudStatus,
      ownerElsewhere,
      pwFor,
      newInvite,
      sellerCuts,
      trEdit,
      trErr,
      excel,
      basket,
      saleSeg,
    ],
  );

  if (error)
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.content}>
          <Text style={s.title}>No se pudo abrir la base</Text>
          <Text style={s.body}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  if (!b)
    return (
      <SafeAreaView style={s.safe}>
        <View
          style={[
            s.content,
            { flex: 1, justifyContent: "center", alignItems: "center" },
          ]}
        >
          <Image
            source={LOGO_HEADER}
            accessibilityLabel="GNS · Nova Negocio"
            resizeMode="contain"
            style={{
              width: 280,
              height: 280 / LOGO_HEADER_RATIO,
              marginBottom: 18,
            }}
          />
          <Note>Abriendo tu negocio…</Note>
        </View>
      </SafeAreaView>
    );
  if (!data) return <SafeAreaView style={s.safe} />;

  // ---------- Formularios ----------
  const { products, customers, campaigns, companies, locations, accounts } =
    data;
  const val = (k: string) => f[k] ?? "";
  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const field = (
    key: string,
    label: string,
    numeric = false,
    placeholder = "",
    multiline = false,
  ) => (
    <View key={key} style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[
          s.input,
          multiline && { minHeight: 80, textAlignVertical: "top" },
        ]}
        value={val(key)}
        onChangeText={(v) => set(key, v)}
        keyboardType={
          numeric
            ? "decimal-pad"
            : key === "phone"
              ? "phone-pad"
              : key === "email"
                ? "email-address"
                : "default"
        }
        placeholder={placeholder}
        placeholderTextColor="#879188"
        multiline={multiline}
        autoCapitalize={
          ["email", "sku", "code", "barcode"].includes(key)
            ? "none"
            : "sentences"
        }
      />
    </View>
  );
  const moneyField = (key: string, label: string, placeholder = "0.00") => {
    const raw = val(key);
    const parsed = tryCents(raw);
    return (
      <View key={key} style={s.field}>
        <Text style={s.label}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          style={s.input}
          value={raw}
          onChangeText={(v) => set(key, v)}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor="#879188"
        />
        {!!raw && (
          <Note color={parsed === null ? C.red : C.muted}>
            {parsed === null
              ? "Escribe un importe como 1250 o 1,250.50"
              : "= " + money(parsed)}
          </Note>
        )}
      </View>
    );
  };
  const choose = (
    key: string,
    label: string,
    rows: Row[],
    optional = false,
    create?: string,
  ) => (
    <View key={key} style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[s.input, s.between]}
        onPress={() => {
          setSearch("");
          setSelector({ key, label, rows, optional, create });
        }}
      >
        <Text
          style={{ color: val(key) ? C.ink : C.muted, fontSize: 16, flex: 1 }}
          numberOfLines={1}
        >
          {rows.find((r) => r.id === val(key))?.name ||
            (optional ? "Sin asignar" : "Seleccionar…")}
        </Text>
        <Text style={{ color: C.muted }}>▾</Text>
      </Pressable>
    </View>
  );
  const chips = (
    key: string,
    label: string,
    list: { id: string; name: string }[],
    empty?: string,
  ) => (
    <View key={key} style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Chips
        options={list}
        value={val(key)}
        onChange={(v) => set(key, v)}
        allowEmpty={empty}
      />
    </View>
  );
  const accountField = (key: string, label: string) =>
    accounts.length <= 6
      ? chips(
          key,
          label,
          accounts.map((a) => ({ id: a.id, name: a.name })),
        )
      : choose(key, label, accounts, false, "Cuenta");
  const dateField = (
    key: string,
    label: string,
    quick: typeof QUICK_FOLLOWUP,
  ) => (
    <DateField
      key={key}
      label={label}
      value={val(key)}
      onChange={(v) => set(key, v)}
      quick={quick}
    />
  );
  const relation = () => (
    <>
      {choose("companyId", "Compañía", companies, true, "Compañía")}
      {choose(
        "locationId",
        "Ubicación",
        locations.filter(
          (l) =>
            !val("companyId") ||
            !l.companyId ||
            l.companyId === val("companyId"),
        ),
        true,
        "Ubicación",
      )}
      {(form === "Venta" || form === "Modificar venta") &&
        !!val("locationId") && (
          <Note color={C.amber}>
            Con ubicación elegida solo se venden piezas de lotes asignados a esa
            ubicación; las “disponibles” de arriba ya cuentan solo esas. Déjala
            vacía para vender de todo tu inventario.
          </Note>
        )}
    </>
  );
  const more = () => (
    <Button
      title={advanced ? "− Menos detalles" : "＋ Más detalles (opcional)"}
      secondary
      small
      onPress={() => setAdvanced(!advanced)}
    />
  );
  const listTotal = cart.reduce(
    (n, i) =>
      n + (products.find((p) => p.id === i.productId)?.price ?? 0) * i.qty,
    0,
  );
  const saleIsCard =
    accounts.find((a) => a.id === val("accountId"))?.kind === "Tarjeta";
  const bps = data.feeBps;
  // 2.0: el cliente absorbe la comisión; tú recibes tu precio (saleBase) completo.
  const saleCharge = cartCharge(cart, tryCents(val("total")));
  const saleBase = saleCharge.base;
  const saleCommission = saleCharge.commission;
  const saleTotal = saleCharge.total;
  const salePaid = val("paid") ? tryCents(val("paid")) : saleTotal;
  const saleable = saleableList;

  // ----- Enviar comprobante (cuando la venta no tiene teléfono) -----
  function receiptSale(): Row | null {
    if (form !== "Enviar comprobante" || !val("saleId")) return null;
    try {
      return b!.saleDetail(val("saleId"));
    } catch {
      return null;
    }
  }
  function receiptMessage(): string {
    const v = receiptSale();
    if (!v) return "";
    if (!val("orderId")) return saleReceiptText(v);
    const entry = terminalPayments(v).find(
      (x) => x.orderId === val("orderId"),
    ) || { orderId: val("orderId") };
    return cardReceiptText(v, entry);
  }
  async function sendTypedReceipt() {
    const v = receiptSale();
    if (!v) return;
    const phone = whatsappNumber(val("phone"));
    try {
      if (val("savePhone") === "1" && v.customerId) {
        const c = customers.find((x) => x.id === v.customerId);
        if (c && !c.phone)
          b!.saveCustomer({
            ...strings(c),
            id: c.id,
            phone: val("phone").trim(),
            ...strings(b!.relation("customer", c.id)),
          });
      }
      await Linking.openURL(
        `https://wa.me/${phone}?text=${encodeURIComponent(receiptMessage())}`,
      );
      refresh();
      close();
    } catch (e) {
      setFormError(errText(e));
    }
  }
  // ----- Modificar venta / devolución -----
  let revising: Row | null = null;
  if (form === "Modificar venta" && val("saleId")) {
    // Se lee una vez por venta (y al cambiar los datos), no en cada tecla.
    const key = `${val("saleId")}:${revision}`;
    if (reviseMemo.current.key !== key) {
      let v: Row | null = null;
      try {
        v = b!.saleDetail(val("saleId"));
      } catch {}
      reviseMemo.current = { key, v };
    }
    revising = reviseMemo.current.v;
  }
  const reviseGoods = revising
    ? cart.reduce((n, i) => {
        const l = (revising!.lines as Row[]).find(
          (x) => x.productId === i.productId,
        );
        const unit =
          l && l.total !== null && l.total !== undefined && l.qty
            ? l.total / l.qty
            : (products.find((p) => p.id === i.productId)?.price ?? 0);
        return n + Math.round(unit * i.qty);
      }, 0)
    : 0;
  // Si la venta llevaba comisión al cliente, el nuevo total la conserva (tú recibes tu precio).
  const reviseFeeBps =
    revising && revising.commission > 0
      ? Number(revising.commissionBps ?? data.feeBps)
      : 0;
  const reviseSuggested = reviseFeeBps
    ? chargeFor(
        cart.map((i) => {
          const l = (revising!.lines as Row[]).find(
            (x) => x.productId === i.productId,
          );
          return {
            qty: i.qty,
            price:
              l && Number.isFinite(Number(l.unitPrice))
                ? Number(l.unitPrice)
                : (products.find((p) => p.id === i.productId)?.price ?? 0),
          };
        }),
        reviseFeeBps,
        reviseGoods,
      ).total
    : reviseGoods;
  const reviseTotal = val("total") ? tryCents(val("total")) : reviseSuggested;
  const revisePaid = (revising?.paid as number) ?? 0;
  const reviseRefund = Math.max(0, revisePaid - (reviseTotal ?? 0));
  const reviseBalance = Math.max(0, (reviseTotal ?? 0) - revisePaid);
  const refundAccount = accounts.find((a) => a.id === val("refundAccountId"));
  const mpCardPaid = revising
    ? ((revising.movements as Row[]).find(
        (x) =>
          x.kind === "sale" &&
          x.amount > 0 &&
          accounts.find((a) => a.id === x.accountId)?.kind === "Tarjeta",
      )?.amount ?? 0)
    : 0;
  const canMpRefund = !!(
    revising?.mpOrderId &&
    revising?.mpPaymentId &&
    mpCfg &&
    refundAccount?.kind === "Tarjeta" &&
    reviseRefund > 0
  );
  function reviseArgs() {
    assert(revising, "No se encontró la venta.");
    assert(
      reviseTotal !== null,
      "Escribe el nuevo total, por ejemplo 1250 o 1,250.50.",
    );
    const args: Parameters<Business["reviseSale"]> = [
      revising.id,
      cart,
      reviseTotal,
      {
        refundAccountId: val("refundAccountId") || null,
        allowBelowCost: allow,
        note: val("note"),
        base: !val("total") && reviseFeeBps ? reviseGoods : null,
      },
    ];
    const mpRefund = canMpRefund && val("mpRefund") === "1";
    if (mpRefund)
      assert(
        reviseRefund <= mpCardPaid,
        `En Mercado Pago solo puedes devolver hasta ${money(mpCardPaid)} de ese cobro. Desmarca la casilla y devuelve la diferencia por otro medio.`,
      );
    return {
      args,
      refund: reviseRefund,
      mpRefund,
      orderId: String(revising.mpOrderId || ""),
      partial:
        reviseRefund < mpCardPaid
          ? { paymentId: String(revising.mpPaymentId), amount: reviseRefund }
          : undefined,
    };
  }
  /** Primero devuelve en Mercado Pago; solo si se aprueba, modifica la venta. */
  async function reviseWithMercadoPago(x: ReturnType<typeof reviseArgs>) {
    try {
      await mpClient().refundOrder(x.orderId, x.partial);
    } catch (e) {
      setBusy(false);
      saveBusy.current = false;
      setFormError(errText(e) + " La venta no se modificó.");
      return;
    }
    try {
      b!.reviseSale(...x.args);
      setBusy(false);
      refresh();
      close();
      notify(`Venta modificada · ${money(x.refund)} devueltos en Mercado Pago`);
    } catch (e) {
      setBusy(false);
      saveBusy.current = false;
      setFormError(
        `Mercado Pago ya devolvió ${money(x.refund)}, pero la venta no se pudo modificar: ${errText(e)} Corrige y guarda de nuevo desmarcando “Devolver también en Mercado Pago”.`,
      );
      set("mpRefund", "");
    }
  }
  async function photo() {
    try {
      let file: PickedPhoto | null;
      if (Platform.OS === "ios") file = await pickPhotoIOS();
      else file = await pickPhotoAndroid();
      if (!file) return;
      setBusy(true);
      setFormError("");
      // Deja pintar el aviso "Optimizando foto…" antes del trabajo pesado.
      await new Promise((r) => setTimeout(r, 30));
      const uri = await importPhoto(file);
      set("imageUri", uri);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function save(mode?: "terminal") {
    if (!b || busy || saveBusy.current) return;
    saveBusy.current = true;
    setBusy(true);
    let saved: string | undefined;
    let done = "Guardado";
    try {
      switch (form) {
        case "Producto": {
          assert(val("name").trim(), "Escribe el nombre del producto.");
          assert(val("price").trim(), "Escribe el precio de venta.");
          assert(
            !Number(val("qty")) || val("cost") !== "",
            "Indica el costo unitario del stock inicial.",
          );
          const qty = Number(val("qty") || "0");
          assert(
            Number.isSafeInteger(qty) && qty >= 0,
            "El stock inicial debe ser un número entero.",
          );
          const { hasPhoto, toBasket, ...input } = f;
          saved = b.quickProduct({
            ...input,
            imageUri: f.imageUri ?? undefined,
            price: cents(val("price")),
            minimum: Number(val("minimum") || "1"),
            qty,
            cost: cents(val("cost") || "0"),
          });
          done = val("id") ? "Producto actualizado" : "Producto creado";
          // Dado de alta desde Vender: con existencias, entra directo al carrito.
          if (toBasket === "1" && !val("id") && qty > 0) {
            const id = String(saved);
            setBasket((old) => addTo(old, id, 1));
            done = "Producto creado y agregado al carrito";
          }
          break;
        }
        case "Cliente":
          saved = b.saveCustomer(f);
          done = val("id") ? "Cliente actualizado" : "Cliente creado";
          break;
        case "Campaña":
          saved = b.saveCampaign({ ...f, budget: cents(val("budget") || "0") });
          done = "Campaña guardada";
          break;
        case "Compañía":
          saved = b.saveCompany(f);
          break;
        case "Ubicación":
          saved = b.saveLocation(f);
          break;
        case "Cuenta":
          saved = b.addAccount(
            val("name"),
            val("kind"),
            cents(val("opening") || "0"),
          );
          done = "Cuenta creada";
          break;
        case "Entrada": {
          const qty = Number(val("qty"));
          assert(
            Number.isSafeInteger(qty) && qty > 0,
            "La cantidad debe ser un número entero mayor que cero.",
          );
          b.receiveAt(
            val("productId"),
            val("label") || "Entrada",
            val("expires"),
            qty,
            cents(val("cost")),
            val("mode") === "Compra pagada"
              ? val("accountId") || "required"
              : null,
            val("locationId") || null,
          );
          done = `Entrada registrada · ${units(qty)}`;
          break;
        }
        case "Asignar ubicación":
          b.assignLot(val("lotId"), val("locationId"));
          done = "Ubicación asignada";
          break;
        case "Movimiento":
          b.movement(
            val("kind"),
            val("accountId"),
            cents(val("amount")),
            val("note"),
            val("campaignId") || null,
            val("toId"),
          );
          done = "Movimiento registrado";
          break;
        case "Venta": {
          // Registrar y cobrar en terminal usan el mismo cálculo (saleArgs).
          const draft: SaleDraft = {
            f,
            cart,
            allow,
            fromBasket: checkoutFromBasket.current,
          };
          if (mode === "terminal") {
            const x = saleArgs(draft);
            b.validateSale(...x.args); // si falta stock o cliente, avisa antes de cobrar
            setBusy(false);
            saveBusy.current = false;
            void checkTerminalThenCharge(x.paid, draft);
            return;
          }
          done = registerSale(draft).msg;
          break;
        }
        case "Editar venta":
          b.updateSaleDetails(val("id"), f);
          done = "Seguimiento actualizado";
          break;
        case "Abono": {
          const amountCents = cents(val("amount"));
          if (mode === "terminal") {
            b.dryRun(() =>
              b.collect(val("saleId"), val("accountId"), amountCents),
            ); // avisa antes de cobrar si el monto no procede
            setBusy(false);
            saveBusy.current = false;
            void checkTerminalThenCharge(amountCents, null, {
              saleId: val("saleId"),
              accountId: val("accountId"),
            });
            return;
          }
          b.collect(val("saleId"), val("accountId"), amountCents);
          done = "Abono registrado";
          break;
        }
        case "Modificar venta": {
          const x = reviseArgs();
          if (x.mpRefund) {
            b.dryRun(() => b.reviseSale(...x.args));
            void reviseWithMercadoPago(x);
            return;
          }
          const r = b.reviseSale(...x.args);
          done = r.refund
            ? `Venta modificada · devolución ${money(r.refund)}`
            : r.balance
              ? `Venta modificada · saldo ${money(r.balance)}`
              : "Venta modificada";
          break;
        }
        case "Paquete":
          b.addBundle(val("name"), cents(val("price")), cart);
          done = "Paquete creado";
          break;
        case "Ajuste de inventario": {
          const counted = Number(val("counted"));
          assert(val("productId"), "Elige el producto.");
          assert(
            val("counted").trim() !== "" &&
              Number.isSafeInteger(counted) &&
              counted >= 0,
            "Escribe cuántas unidades contaste (número entero).",
          );
          const r = b.adjustStock(
            val("productId"),
            counted,
            val("reason") || "Conteo físico",
            val("note"),
          );
          done = `Existencias ajustadas: ${r.before} → ${r.after}`;
          break;
        }
        case "Renombrar cuenta":
          b.renameAccount(val("id"), val("name"));
          done = "Cuenta renombrada";
          break;
        case "Configuración": {
          const raw = val("rate").replace("%", "").replace(",", ".").trim();
          assert(
            /^\d{1,2}(\.\d{1,2})?$/.test(raw),
            "Escribe la comisión como porcentaje, por ejemplo 4.06",
          );
          b.setFeeBps(Math.round(Number(raw) * 100));
          done = `Comisión: ${feeLabel(Math.round(Number(raw) * 100))}`;
          // Es un parámetro: se publica de inmediato a la base en línea (vendedores y servidor).
          setTimeout(() => void syncRef.current(), 0);
          break;
        }
      }
    } catch (e) {
      setBusy(false);
      saveBusy.current = false;
      setFormError(e instanceof Error ? e.message : String(e));
      return;
    }
    setBusy(false);
    refresh();
    const nested = stack.length > 0;
    close(saved);
    if (!nested) notify(done);
  }
  function archiveFromForm(kind: "product" | "customer") {
    const id = val("id");
    if (!id || !b) return;
    const isArchived =
      kind === "product"
        ? products.find((p) => p.id === id)?.archived
        : customers.find((c) => c.id === id)?.archived;
    try {
      if (kind === "product") b.setProductArchived(id, !isArchived);
      else b.setCustomerArchived(id, !isArchived);
      refresh();
      close();
      notify(isArchived ? "Restaurado" : "Archivado");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  }

  const cartEditor = (
    <>
      {form === "Venta" && checkoutFromBasket.current ? (
        <>
          <Text
            style={s.subtitle}
          >{`🛒 Tu carrito · ${cart.reduce((n, i) => n + i.qty, 0)} ${cart.reduce((n, i) => n + i.qty, 0) === 1 ? "pieza" : "piezas"}`}</Text>
          <View style={s.wrap}>
            <Button
              title="＋ Agregar más"
              secondary
              small
              onPress={keepShopping}
            />
            <Button
              title="🗑 Vaciar carrito"
              secondary
              small
              onPress={emptyBasket}
            />
          </View>
        </>
      ) : (
        <>
          <Text style={s.subtitle}>Productos</Text>
          <ProductGrid
            products={
              (form === "Venta" &&
              !cart.some((i) => productById.get(i.productId)?.archived)
                ? gridProducts
                : products
                    .filter(
                      (p) =>
                        !p.archived || cart.some((i) => i.productId === p.id),
                    )
                    .map((p) =>
                      form === "Venta"
                        ? { ...p, price: grossUp(p.price, data.feeBps) }
                        : p,
                    )) as any
            }
            qtyOf={(id) => cart.find((i) => i.productId === id)?.qty ?? 0}
            limitOf={(id) => cartLimit(id)}
            onAdd={addOne}
            onRemove={removeOne}
            segment={saleSeg}
            onSegment={setSaleSeg}
          />
          {!!gridMsg && <Note color={C.red}>{gridMsg}</Note>}
          <Button
            title="＋ ¿No está? Dar de alta un producto"
            secondary
            small
            onPress={() => open("Producto", {}, "cartAdd")}
          />
          {!!cart.length && (
            <Text style={[s.label, { marginTop: 14, marginBottom: 0 }]}>
              En esta venta
            </Text>
          )}
        </>
      )}
      {cart.map((i) => {
        const p = products.find((x) => x.id === i.productId);
        const limit = cartLimit(i.productId);
        const atMax = i.qty >= limit;
        return (
          <View key={i.productId} style={s.cartRow}>
            {!!p && (
              <ProductPhoto product={p} style={{ width: 44, height: 56 }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.body} numberOfLines={2}>
                {p?.name}
              </Text>
              <Note>
                {((unit) =>
                  `${i.qty} × ${money(unit)} = ${money(unit * i.qty)}`)(
                  form === "Venta"
                    ? grossUp(p?.price || 0, data.feeBps)
                    : p?.price || 0,
                )}
              </Note>
              {Number.isFinite(limit) && (
                <Note color={i.qty > limit ? C.red : atMax ? C.amber : C.muted}>
                  {i.qty > limit
                    ? limit
                      ? `Solo hay ${units(limit)}: quita ${i.qty - limit}`
                      : "Sin existencias: quítalo de la venta"
                    : atMax
                      ? `Máximo disponible (${limit})`
                      : `${limit} ${limit === 1 ? "disponible" : "disponibles"}`}
                </Note>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quitar una"
              style={s.stepper}
              onPress={() =>
                i.qty > 1
                  ? changeQty(i.productId, -1)
                  : setCart((old) =>
                      old.filter((x) => x.productId !== i.productId),
                    )
              }
            >
              <Text style={s.subtitle}>{i.qty > 1 ? "−" : "✕"}</Text>
            </Pressable>
            <Text style={[s.subtitle, { minWidth: 26, textAlign: "center" }]}>
              {i.qty}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agregar una"
              accessibilityState={{ disabled: atMax }}
              style={[s.stepper, atMax && { opacity: 0.35 }]}
              onPress={() => changeQty(i.productId, 1)}
            >
              <Text style={s.subtitle}>＋</Text>
            </Pressable>
          </View>
        );
      })}
      {!cart.length && (
        <Note>
          {form === "Modificar venta"
            ? "Deja al menos un producto. Para devolver todo usa Cancelar venta."
            : checkoutFromBasket.current
              ? "Tu carrito está vacío: toca ＋ Agregar más."
              : "Agrega al menos un producto."}
        </Note>
      )}
      {form !== "Modificar venta" && form !== "Venta" && (
        <View style={[s.between, { marginTop: 10 }]}>
          <Text style={s.body}>Precio de lista</Text>
          <Text style={[s.body, { fontWeight: "800" }]}>
            {money(listTotal)}
          </Text>
        </View>
      )}
    </>
  );

  const editingProduct =
    form === "Producto" && val("id")
      ? products.find((p) => p.id === val("id"))
      : null;
  const editingCustomer =
    form === "Cliente" && val("id")
      ? customers.find((c) => c.id === val("id"))
      : null;
  const photoPreview = f.imageUri
    ? [{ uri: f.imageUri }]
    : editingProduct?.imageUri
      ? [{ uri: editingProduct.imageUri }]
      : catalogueImages[val("imageKey")] ||
        catalogueImages[val("sku")] ||
        catalogueImages[val("id")] ||
        [];

  const payOverlay = pay && (
    <View style={s.payOverlay}>
      <View style={s.payCard}>
        <Text style={[s.label, { color: C.muted }]}>
          {pay.test
            ? "Cobro de prueba"
            : pay.abono
              ? "Abono con tarjeta"
              : "Cobro con tarjeta"}{" "}
          · Terminal Mercado Pago
        </Text>
        <Text style={[s.heroAmount, { color: C.ink, marginVertical: 4 }]}>
          {money(pay.amount)}
        </Text>
        {(pay.outcome === "sending" ||
          pay.outcome === "pending" ||
          pay.outcome === "searching") && (
          <ActivityIndicator
            size="large"
            color={C.ink}
            style={{ marginVertical: 10 }}
          />
        )}
        <Text
          style={[
            s.body,
            { textAlign: "center", marginBottom: 12 },
            ["failed", "canceled", "expired", "error"].includes(
              pay.outcome,
            ) && { color: C.red },
            (pay.outcome === "approved" || pay.outcome === "done") && {
              color: C.green,
              fontWeight: "700",
            },
          ]}
        >
          {pay.text}
        </Text>
        {(pay.outcome === "sending" || pay.outcome === "pending") && (
          <Button
            title="Cancelar cobro"
            danger
            onPress={() => void cancelCharge()}
          />
        )}
        {pay.outcome === "pending" && (pay.fails || 0) >= 3 && (
          <Button
            title="Cerrar y revisar después"
            secondary
            onPress={reviewLater}
          />
        )}
        {pay.outcome === "pending" &&
          !pay.atTerminal &&
          (pay.tick || 0) >= 8 &&
          !pay.test && (
            <Button
              title="¿No llega a la terminal? Cobrar ahí directo"
              secondary
              onPress={() => void chargeOnTerminalInstead()}
            />
          )}
        {pay.outcome === "notpdv" && (pay.draft || pay.abono) && (
          <Button
            title="✅ Ya cobré en la terminal · buscar el pago"
            onPress={() => void findManualPayment()}
          />
        )}
        {pay.outcome === "choose" &&
          (pay.found || []).map((x) => (
            <Button
              key={x.id}
              title={`${terminalPaymentLabel(x)} · ${money(x.amount)}`}
              secondary
              onPress={() => linkManualPayment(x)}
            />
          ))}
        {pay.outcome === "choose" && (
          <Button
            title="Ninguno es de esta venta"
            secondary
            small
            onPress={() =>
              setPay({
                ...pay,
                outcome: "notpdv",
                found: undefined,
                text: manualOwnerText(pay.amount),
              })
            }
          />
        )}
        {pay.outcome === "check" && (
          <>
            <Button
              title="Sí, la terminal dice aprobado"
              onPress={() => finishApproved(pay.order)}
            />
            <Button
              title="No se aprobó"
              secondary
              onPress={() => (
                b!.setSetting("mpPending", null),
                setPay(null),
                refresh()
              )}
            />
          </>
        )}
        {pay.outcome === "approved" && !!pay.orderId && (
          <Button
            title={`Devolver ${money(pay.amount)}`}
            danger
            onPress={() => void refundCharge(pay.orderId!)}
          />
        )}
        {pay.outcome === "notpdv" && (pay.draft || pay.abono) && (
          <Button
            title="Enviar a la terminal de todos modos"
            secondary
            onPress={() =>
              void startCharge(pay.amount, pay.draft, false, pay.abono)
            }
          />
        )}
        {(pay.outcome === "notpdv" ||
          (pay.outcome === "error" && !pay.orderId)) &&
          (pay.draft || pay.abono) && (
            <Button
              title="Registrar sin datos del pago"
              secondary
              small
              onPress={registerWithoutTerminal}
            />
          )}
        {["failed", "canceled", "expired", "error"].includes(pay.outcome) &&
          (pay.draft || pay.abono || pay.test) && (
            <Button
              title="Reintentar"
              secondary={pay.outcome === "error" && !pay.orderId}
              onPress={() =>
                void (pay.test
                  ? startCharge(pay.amount, null, true)
                  : checkTerminalThenCharge(pay.amount, pay.draft, pay.abono))
              }
            />
          )}
        {pay.outcome === "done" && !!pay.saleId && (
          <Button
            title="📲 Enviar comprobante por WhatsApp"
            onPress={() => {
              const v = b!.saleDetail(pay.saleId!);
              const entry = terminalPayments(v).find(
                (x) => x.orderId === pay.orderId,
              ) || { orderId: pay.orderId, amount: pay.amount };
              setPay(null);
              void sendCardReceipt(v, entry);
            }}
          />
        )}
        {pay.outcome === "done" && (
          <Button
            title="Listo"
            secondary
            onPress={() => (refresh(), setPay(null))}
          />
        )}
        {!["sending", "pending", "check", "done", "searching"].includes(
          pay.outcome,
        ) && (
          <Button
            title="Cerrar"
            secondary
            onPress={() => (refresh(), setPay(null))}
          />
        )}
      </View>
    </View>
  );
  const listBody = body && "list" in body ? body.list : null;
  const contentStyle = [s.content, wide && { maxWidth: 860 }];
  const basketPieces = basket.reduce((n, i) => n + i.qty, 0);
  // Lo que pagará el cliente (tus precios + la comisión que absorbe).
  const basketTotal = cartCharge(
    basket,
    basketF.total ? tryCents(basketF.total) : null,
  ).total;
  const showBasket = !form && basket.length > 0;
  const showFab =
    !form &&
    !showBasket &&
    ["Ventas", "Stock", "Catálogo", "Clientes"].includes(page);
  const isTabRoot = TABS.some((t) => t.name === page);

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <UpdateNotice
        b={b}
        canRestart={() =>
          !busy &&
          !saveBusy.current &&
          !formRef.current &&
          !payRef.current &&
          !b.setting("mpPending", null)
        }
        beforeRestart={flushSession}
      />
      <View style={s.header}>
        {page === HOME ? (
          <>
            <View style={{ flex: 1 }}>
              <Image
                source={LOGO_HEADER}
                accessibilityLabel="GNS · Nova Negocio"
                resizeMode="contain"
                style={{
                  height: 40,
                  width: 40 * LOGO_HEADER_RATIO,
                  maxWidth: "100%",
                }}
              />
            </View>
            <View style={s.badge}>
              <Text style={s.badgeText}>● Local</Text>
            </View>
          </>
        ) : (
          <>
            {!isTabRoot && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver"
                onPress={back}
                style={s.backBtn}
                hitSlop={8}
              >
                <Text style={{ fontSize: 26, color: C.ink, lineHeight: 28 }}>
                  ‹
                </Text>
                <Text style={{ color: C.ink, fontWeight: "700", fontSize: 15 }}>
                  {" "}
                  Volver
                </Text>
              </Pressable>
            )}
            <Text style={s.headerTitle} numberOfLines={1}>
              {page === "Control Operativo"
                ? "Gastos operativos"
                : page === "Catálogo"
                  ? "Stock"
                  : page}
            </Text>
          </>
        )}
      </View>
      <View style={{ flex: 1 }}>
        {listBody ? (
          <FlatList
            automaticallyAdjustKeyboardInsets
            key={page}
            data={listBody.data}
            keyExtractor={(r: Row) => r.id}
            renderItem={({ item }: { item: Row }) => listBody.item(item)}
            ListHeaderComponent={<>{listBody.header}</>}
            ListEmptyComponent={<>{listBody.empty}</>}
            contentContainerStyle={contentStyle}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={8}
            windowSize={7}
          />
        ) : (
          <ScrollView
            automaticallyAdjustKeyboardInsets
            key={page}
            contentContainerStyle={contentStyle}
            keyboardShouldPersistTaps="handled"
          >
            {body && "scroll" in body ? body.scroll : null}
          </ScrollView>
        )}
        {showFab && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nueva venta"
            onPress={() => openSale()}
            style={[s.fab, { bottom: 16 }]}
          >
            <Text style={s.fabText}>＋ Venta</Text>
          </Pressable>
        )}
        {showBasket && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir carrito"
            onPress={openCheckout}
            style={s.cartBar}
          >
            <Text
              style={s.cartBarText}
            >{`🛒 Carrito · ${basketPieces} ${basketPieces === 1 ? "pieza" : "piezas"} · ${money(basketTotal)} · Cobrar ›`}</Text>
          </Pressable>
        )}
        {toast && (
          <View
            key={toast.key}
            style={[
              s.toast,
              { bottom: showFab || showBasket ? 84 : 16 },
              toast.bad && { backgroundColor: C.red },
            ]}
            pointerEvents="none"
          >
            <Text style={s.toastText}>
              {toast.bad ? "⚠ " : "✓ "}
              {toast.text}
            </Text>
          </View>
        )}
      </View>
      <SafeAreaView edges={["bottom"]} style={s.nav}>
        <View style={s.navRow}>
          {TABS.map((t) => {
            const on =
              page === t.name ||
              (t.name === "Stock" &&
                ["Catálogo", "Detalle producto", "Lotes"].includes(page)) ||
              (t.name === "Ventas" &&
                [
                  "Detalle venta",
                  "Corte de caja",
                  "Resumen de ventas",
                  "Cobros",
                ].includes(page)) ||
              (t.name === "Parámetros" &&
                ![
                  ...TABS.map((x) => x.name),
                  "Catálogo",
                  "Detalle producto",
                  "Lotes",
                  "Detalle venta",
                  "Corte de caja",
                  "Resumen de ventas",
                  "Cobros",
                ].includes(page));
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                key={t.name}
                style={[s.navItem, on && s.navOn]}
                onPress={() => (
                  setFilters((old) => ({
                    ...old,
                    [t.name]: "",
                    ...(t.name === "Ventas" ? { VentasPago: "" } : {}),
                  })),
                  go(t.name)
                )}
              >
                <Text style={s.navIcon}>{t.icon}</Text>
                <Text
                  style={[s.navText, on && { color: C.ink, fontWeight: "800" }]}
                >
                  {t.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
      {!form && payOverlay}
      <Modal
        visible={!!form}
        animationType="slide"
        onRequestClose={() =>
          pay ? undefined : selector ? setSelector(null) : close()
        }
      >
        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[s.title, { fontSize: 24 }]}>
                  {selector
                    ? selector.label
                    : val("id") &&
                        !form.startsWith("Editar") &&
                        !form.startsWith("Renombrar") &&
                        form !== "Abono"
                      ? "Editar " + form.toLowerCase()
                      : form === "Venta"
                        ? checkoutFromBasket.current
                          ? "🛒 Carrito"
                          : "Nueva venta"
                        : form}
                </Text>
                {!selector && (
                  <Note>
                    {stack.length
                      ? "Guarda y volverás a la captura anterior."
                      : "Los campos con * son obligatorios."}
                  </Note>
                )}
              </View>
              <Button
                title={selector ? "Volver" : "Cerrar"}
                secondary
                small
                onPress={() => (selector ? setSelector(null) : close())}
              />
            </View>
            {selector ? (
              <ScrollView
                contentContainerStyle={s.content}
                keyboardShouldPersistTaps="handled"
              >
                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder="Escribe para buscar…"
                />
                {selector.create && (
                  <Button
                    title={
                      "＋ Crear " +
                      selector.create.toLowerCase() +
                      (search ? ` "${search}"` : "")
                    }
                    secondary
                    onPress={() =>
                      open(
                        selector.create!,
                        {
                          ...(selector.create === "Ubicación"
                            ? { companyId: val("companyId") }
                            : {}),
                          name: search,
                        },
                        selector.key,
                      )
                    }
                  />
                )}
                <View style={{ height: 10 }} />
                {selector.optional && (
                  <Pressable
                    style={s.option}
                    onPress={() => {
                      set(selector.key, "");
                      setSelector(null);
                    }}
                  >
                    <Text style={[s.body, { color: C.muted }]}>
                      Sin asignar
                    </Text>
                  </Pressable>
                )}
                {selector.rows
                  .filter((r) =>
                    normalize(
                      r.name + " " + (r.sku || "") + " " + (r.brand || ""),
                    ).includes(normalize(search)),
                  )
                  .slice(0, 150)
                  .map((r) => (
                    <Pressable
                      key={r.id}
                      style={({ pressed }) => [
                        s.option,
                        pressed && { backgroundColor: C.soft },
                        selector.key === "cartAdd" &&
                          cartLimit(r.id) < 1 && { opacity: 0.45 },
                      ]}
                      onPress={() => {
                        if (selector.key === "cartAdd") {
                          const limit = cartLimit(r.id);
                          const current =
                            cart.find((i) => i.productId === r.id)?.qty ?? 0;
                          if (current + 1 > limit) {
                            setFormError(
                              limit
                                ? `Ya agregaste las ${units(limit)} disponibles de ${productName(r.id)}.`
                                : `${productName(r.id)} no tiene existencias disponibles.`,
                            );
                            setSelector(null);
                            return;
                          }
                          setFormError("");
                          setCart((old) => addTo(old, r.id, 1));
                        } else set(selector.key, r.id);
                        setSelector(null);
                      }}
                    >
                      <Text style={s.body}>{r.name}</Text>
                    </Pressable>
                  ))}
                {(() => {
                  const n = selector.rows.filter((r) =>
                    normalize(
                      r.name + " " + (r.sku || "") + " " + (r.brand || ""),
                    ).includes(normalize(search)),
                  ).length;
                  return n > 150 ? (
                    <Note>
                      Mostrando 150 de {n}. Escribe para encontrar el resto.
                    </Note>
                  ) : null;
                })()}
                {!selector.rows.length && (
                  <Note>No hay registros todavía.</Note>
                )}
              </ScrollView>
            ) : (
              <ScrollView
                contentContainerStyle={[s.content, wide && { maxWidth: 720 }]}
                keyboardShouldPersistTaps="handled"
              >
                {!!formError && (
                  <View style={s.errorBox}>
                    <Text style={[s.body, { color: C.red, fontWeight: "700" }]}>
                      Revisa la operación
                    </Text>
                    <Text style={[s.body, { color: C.red }]}>{formError}</Text>
                  </View>
                )}
                {form === "Producto" && (
                  <>
                    {field("name", "Nombre *")}
                    {moneyField("price", "Precio de venta MXN *")}
                    {(() => {
                      const base = tryCents(val("price"));
                      return (
                        <Note>{`Tu precio: lo que recibes completo.${base ? ` El cliente paga ${money(grossUp(base, data.feeBps))} (absorbe la comisión ${feeLabel(data.feeBps)}).` : ""}`}</Note>
                      );
                    })()}
                    {!val("id") && (
                      <>
                        {field("qty", "Stock inicial (opcional)", true, "0")}
                        {Number(val("qty")) > 0 && (
                          <>
                            {moneyField("cost", "Costo por unidad MXN *")}
                            {choose(
                              "locationId",
                              "Ubicación inicial",
                              locations,
                              true,
                              "Ubicación",
                            )}
                          </>
                        )}
                      </>
                    )}
                    {more()}
                    {advanced && (
                      <>
                        {photoPreview.slice(0, 1).map((img: any, i: number) => (
                          <Image
                            key={i}
                            source={img}
                            style={s.photo}
                            resizeMode="contain"
                          />
                        ))}
                        <Button
                          title={
                            busy
                              ? "Optimizando foto…"
                              : photoPreview.length
                                ? "Cambiar foto"
                                : "Elegir foto"
                          }
                          secondary
                          small
                          disabled={busy}
                          onPress={photo}
                        />
                        <Note>
                          Fotos JPG de cualquier tamaño: la app las reduce y las
                          endereza sola. PNG o WebP de máximo 1 MB.
                        </Note>
                        <View style={{ height: 12 }} />
                        {field("sku", "SKU — automático si lo dejas vacío")}
                        {field("barcode", "Código de barras (para el lector)")}
                        {canScan() && (
                          <Button
                            title="📷 Leer código de barras"
                            secondary
                            small
                            onPress={() => setBarcodeScanner(true)}
                          />
                        )}
                        <CameraScanner
                          visible={barcodeScanner}
                          continuous={false}
                          onClose={() => setBarcodeScanner(false)}
                          onScan={(code) => {
                            set("barcode", code);
                            return { text: "Código guardado en el producto." };
                          }}
                        />
                        {field("category", "Categoría")}
                        {field("brand", "Marca")}
                        {field("flavor", "Sabor")}
                        {field("presentation", "Presentación")}
                        {field(
                          "description",
                          "Descripción del catálogo",
                          false,
                          "",
                          true,
                        )}
                        {field("minimum", "Alerta de stock mínimo", true)}
                        {choose(
                          "companyId",
                          "Proveedor / compañía",
                          companies,
                          true,
                          "Compañía",
                        )}
                        {!val("id") &&
                          dateField(
                            "expires",
                            "Caducidad inicial",
                            QUICK_EXPIRY,
                          )}
                        {field("notes", "Notas", false, "", true)}
                        <Note>
                          {val("id")
                            ? "Los cambios de precio no alteran ventas anteriores. Usa Entrada para agregar unidades."
                            : "El stock inicial no registra una salida de dinero. Para una compra pagada usa Entrada."}
                        </Note>
                      </>
                    )}
                    {editingProduct && (
                      <Button
                        title={
                          editingProduct.archived
                            ? "Restaurar producto"
                            : "Archivar producto"
                        }
                        secondary
                        small
                        onPress={() => archiveFromForm("product")}
                      />
                    )}
                  </>
                )}
                {form === "Cliente" && (
                  <>
                    {field("name", "Nombre *")}
                    {field("phone", "Teléfono (opcional)")}
                    {chips("stage", "Etapa", options(STAGES))}
                    {dateField("nextDate", "Próximo contacto", QUICK_FOLLOWUP)}
                    {more()}
                    {advanced && (
                      <>
                        {relation()}
                        {field(
                          "notes",
                          "Notas / preferencias",
                          false,
                          "",
                          true,
                        )}
                      </>
                    )}
                    {editingCustomer && (
                      <Button
                        title={
                          editingCustomer.archived
                            ? "Restaurar cliente"
                            : "Archivar cliente"
                        }
                        secondary
                        small
                        onPress={() => archiveFromForm("customer")}
                      />
                    )}
                  </>
                )}
                {form === "Campaña" && (
                  <>
                    {field("name", "Nombre *")}
                    {chips("channel", "Canal *", options(channels))}
                    {chips(
                      "status",
                      "Estado *",
                      options(["Borrador", "Activa", "Pausada", "Finalizada"]),
                    )}
                    {more()}
                    {advanced && (
                      <>
                        {moneyField("budget", "Presupuesto MXN")}
                        {dateField("start", "Inicio", QUICK_CAMPAIGN)}
                        {dateField("end", "Fin", QUICK_CAMPAIGN)}
                        {field("code", "Código — automático si lo dejas vacío")}
                        {relation()}
                        {field("notes", "Objetivo / notas", false, "", true)}
                        <Note>
                          El presupuesto es una meta. El gasto real se registra
                          en Cuentas o con Registrar gasto.
                        </Note>
                      </>
                    )}
                  </>
                )}
                {form === "Compañía" && (
                  <>
                    {field("name", "Nombre *")}
                    {chips(
                      "kind",
                      "Tipo *",
                      options([
                        "Mi negocio",
                        "Proveedor",
                        "Cliente empresa",
                        "Socio",
                        "Otro",
                      ]),
                    )}
                    {more()}
                    {advanced && (
                      <>
                        {field("phone", "Teléfono")}
                        {field("email", "Correo")}
                        {field("notes", "Notas", false, "", true)}
                      </>
                    )}
                  </>
                )}
                {form === "Ubicación" && (
                  <>
                    {field("name", "Nombre *")}
                    {choose(
                      "companyId",
                      "Compañía",
                      companies,
                      true,
                      "Compañía",
                    )}
                    {chips(
                      "kind",
                      "Tipo *",
                      options(["Tienda", "Almacén", "Entrega", "Otra"]),
                    )}
                    {more()}
                    {advanced && (
                      <>
                        {field("address", "Dirección")}
                        {field("notes", "Notas", false, "", true)}
                      </>
                    )}
                  </>
                )}
                {form === "Cuenta" && (
                  <>
                    {field("name", "Nombre *")}
                    {chips(
                      "kind",
                      "Tipo *",
                      options(["Efectivo", "Banco", "Tarjeta", "Billetera"]),
                    )}
                    {moneyField("opening", "Saldo inicial MXN")}
                    <Note>
                      Las cuentas de tipo Tarjeta descuentan la comisión
                      configurada al cobrar.
                    </Note>
                  </>
                )}
                {form === "Entrada" && (
                  <>
                    {choose(
                      "productId",
                      "Producto *",
                      saleable,
                      false,
                      "Producto",
                    )}
                    {field("qty", "Cantidad *", true)}
                    {moneyField("cost", "Costo unitario MXN *")}
                    {chips(
                      "mode",
                      "Tipo de entrada *",
                      options(["Inventario inicial", "Compra pagada"]),
                    )}
                    {val("mode") === "Compra pagada" &&
                      accountField("accountId", "Cuenta que paga *")}
                    {choose(
                      "locationId",
                      "Ubicación",
                      locations,
                      true,
                      "Ubicación",
                    )}
                    {dateField("expires", "Caducidad", QUICK_EXPIRY)}
                    {more()}
                    {advanced && field("label", "Nombre de lote")}
                    <Note>
                      Inventario inicial no mueve dinero. Compra pagada
                      descuenta de la cuenta seleccionada.
                    </Note>
                  </>
                )}
                {form === "Asignar ubicación" && (
                  <>
                    {choose(
                      "locationId",
                      "Ubicación del lote *",
                      locations,
                      false,
                      "Ubicación",
                    )}
                    <Note>
                      Se asignan todas las unidades restantes de este lote. La
                      cantidad total no cambia.
                    </Note>
                  </>
                )}
                {form === "Movimiento" && (
                  <>
                    {chips("kind", "Tipo *", [
                      { id: "expense", name: "Gasto" },
                      { id: "income", name: "Otro ingreso" },
                      { id: "capital", name: "Aportación" },
                      { id: "withdrawal", name: "Retiro" },
                      { id: "transfer", name: "Traspaso" },
                    ])}
                    {accountField(
                      "accountId",
                      val("kind") === "transfer"
                        ? "Cuenta origen *"
                        : "Cuenta *",
                    )}
                    {val("kind") === "transfer" &&
                      choose(
                        "toId",
                        "Cuenta destino *",
                        accounts.filter((a) => a.id !== val("accountId")),
                        false,
                        "Cuenta",
                      )}
                    {moneyField("amount", "Importe MXN *")}
                    {field("note", "Concepto *")}
                    {val("kind") === "expense" &&
                      choose(
                        "campaignId",
                        "Campaña",
                        campaigns,
                        true,
                        "Campaña",
                      )}
                  </>
                )}
                {form === "Venta" && (
                  <>
                    {cartEditor}
                    <View style={{ height: 14 }} />
                    {choose(
                      "customerId",
                      "Cliente",
                      customers.filter(
                        (c) => !c.archived || c.id === val("customerId"),
                      ),
                      true,
                      "Cliente",
                    )}
                    {accountField("accountId", "Forma de cobro *")}
                    {["Banco", "Billetera"].includes(
                      accounts.find((a) => a.id === val("accountId"))?.kind ||
                        "",
                    ) && (
                      <TransferInfo
                        list={((all: TransferAccount[]) =>
                          all.some((t) => t.accountId === val("accountId"))
                            ? all.filter(
                                (t) => t.accountId === val("accountId"),
                              )
                            : all)(b!.setting("transferAccounts", []))}
                        amount={saleTotal}
                        phone={
                          customers.find((c) => c.id === val("customerId"))
                            ?.phone || ""
                        }
                        emptyText="Captura tus datos de transferencia en Parámetros → Datos para transferencia para mandárselos al cliente."
                      />
                    )}
                    {more()}
                    {advanced && (
                      <>
                        {moneyField(
                          "total",
                          "Precio especial MXN (lo que quieres recibir)",
                          amount(listTotal),
                        )}
                        {moneyField(
                          "paid",
                          "Cobro de hoy MXN",
                          "Vacío = pago completo",
                        )}
                        {chips("channel", "Canal *", options(channels))}
                        {choose(
                          "campaignId",
                          "Campaña",
                          campaigns,
                          true,
                          "Campaña",
                        )}
                        {relation()}
                        {field("notes", "Notas", false, "", true)}
                        <View style={[s.between, { marginBottom: 6 }]}>
                          <Text style={[s.body, { flex: 1 }]}>
                            Autorizar venta debajo del costo (solo esta venta)
                          </Text>
                          <Switch value={allow} onValueChange={setAllow} />
                        </View>
                        <Note>
                          La ubicación limita la salida a sus lotes. Sin asignar
                          permite tomar de cualquier ubicación.
                        </Note>
                      </>
                    )}
                    <Card tone="ok">
                      {(() => {
                        const cost = cart.reduce((n, i) => {
                          const p = products.find((x) => x.id === i.productId);
                          return (
                            n +
                            (p && p.stock > 0
                              ? Math.round((p.value / p.stock) * i.qty)
                              : 0)
                          );
                        }, 0);
                        const fee =
                          saleIsCard && salePaid ? cardFee(salePaid, bps) : 0;
                        const received = (salePaid ?? saleTotal) - fee;
                        const row = (
                          label: string,
                          value: string,
                          opts: { bold?: boolean; color?: string } = {},
                        ) => (
                          <View key={label} style={[s.between, { gap: 8 }]}>
                            <Text
                              style={[
                                s.body,
                                { flex: 1 },
                                opts.bold && { fontWeight: "800" },
                              ]}
                            >
                              {label}
                            </Text>
                            <Text
                              style={[
                                s.body,
                                { fontWeight: opts.bold ? "800" : "600" },
                                opts.color ? { color: opts.color } : null,
                              ]}
                            >
                              {value}
                            </Text>
                          </View>
                        );
                        return (
                          <>
                            {row("Subtotal", money(saleCharge.subtotal))}
                            {saleCharge.discount > 0 &&
                              row(
                                saleCharge.promo.hits.length
                                  ? `Descuento · ${promoSummary(
                                      saleCharge.promo.hits,
                                    )
                                      .map((x) => x.name)
                                      .join(", ")}`
                                  : "Descuento",
                                minus(saleCharge.discount),
                                { color: C.red },
                              )}
                            {row("Total a cobrar", money(saleTotal), {
                              bold: true,
                            })}
                            {salePaid !== null &&
                              salePaid !== saleTotal &&
                              row("Cobro de hoy", money(salePaid))}
                            {salePaid !== null &&
                              salePaid !== saleTotal &&
                              row(
                                "Queda a crédito",
                                money(Math.max(0, saleTotal - salePaid)),
                                { color: C.amber },
                              )}
                            {divider()}
                            <Text style={s.label}>Solo lo ves tú</Text>
                            {row("Tu precio", money(saleBase))}
                            {row(
                              "Comisión que absorbe el cliente",
                              "+" + money(saleCommission),
                            )}
                            {saleIsCard &&
                              row(
                                `Mercado Pago descuenta ${feeLabel(bps)}`,
                                minus(fee),
                                { color: C.red },
                              )}
                            {row("Recibes", money(received), {
                              bold: true,
                              color: C.green,
                            })}
                            {cost > 0 &&
                              row("Ganancia estimada", money(received - cost), {
                                color: received - cost >= 0 ? C.green : C.red,
                              })}
                            {cost > 0 &&
                              saleBase < cost &&
                              saleCharge.promo.total > 0 &&
                              saleBase + saleCharge.promo.total >= cost && (
                                <Note color={C.amber}>
                                  Con la promoción esta venta queda debajo del
                                  costo. Se permite porque tú la configuraste.
                                </Note>
                              )}
                          </>
                        );
                      })()}
                    </Card>
                  </>
                )}
                {form === "Editar venta" && (
                  <>
                    {choose(
                      "customerId",
                      "Cliente",
                      customers,
                      true,
                      "Cliente",
                    )}
                    {chips("channel", "Canal *", options(channels))}
                    {choose(
                      "campaignId",
                      "Campaña",
                      campaigns,
                      true,
                      "Campaña",
                    )}
                    {relation()}
                    {field("notes", "Notas", false, "", true)}
                    <Note>
                      Solo cambia el seguimiento comercial. Importes, fecha,
                      cobros y lotes entregados se conservan.
                    </Note>
                  </>
                )}
                {form === "Abono" && (
                  <>
                    {accountField("accountId", "Cuenta *")}
                    {moneyField("amount", "Abono MXN *")}
                    {accounts.find((a) => a.id === val("accountId"))?.kind ===
                      "Tarjeta" && (
                      <CardFeePreview
                        value={tryCents(val("amount"))}
                        bps={bps}
                      />
                    )}
                  </>
                )}
                {form === "Enviar comprobante" &&
                  (() => {
                    const msg = receiptMessage();
                    const v = receiptSale();
                    const cust = v
                      ? customers.find((c) => c.id === v.customerId)
                      : null;
                    return (
                      <>
                        {field(
                          "phone",
                          "WhatsApp del cliente (10 dígitos)",
                          false,
                          "55 1234 5678",
                        )}
                        {!!val("phone") && !validWhatsapp(val("phone")) && (
                          <Note color={C.red}>
                            Escribe el número a 10 dígitos, por ejemplo 55 1234
                            5678.
                          </Note>
                        )}
                        {!!cust && !cust.phone && (
                          <Checkbox
                            label={`Guardar este número en ${cust.name}`}
                            value={val("savePhone") === "1"}
                            onChange={(x) => set("savePhone", x ? "1" : "")}
                          />
                        )}
                        <Text style={[s.label, { marginTop: 6 }]}>
                          Vista previa
                        </Text>
                        <Card>
                          <Text style={s.body}>{msg.replace(/\*/g, "")}</Text>
                        </Card>
                      </>
                    );
                  })()}
                {form === "Modificar venta" && !revising && (
                  <Note>Esta venta ya no está disponible.</Note>
                )}
                {form === "Modificar venta" && !!revising && (
                  <>
                    <Card>
                      <Text style={s.subtitle}>
                        {revising.folio ||
                          String(revising.id).slice(-8).toUpperCase()}{" "}
                        · {revising.customer || "Público general"}
                      </Text>
                      <Note>
                        Total actual {money(revising.total)} · cobrado{" "}
                        {money(revising.paid)}
                      </Note>
                    </Card>
                    {cartEditor}
                    <Note>
                      Quita o reduce productos para registrar una devolución:
                      las unidades regresan a su lote. También puedes agregar
                      productos.
                    </Note>
                    <View style={{ height: 10 }} />
                    {moneyField(
                      "total",
                      "Nuevo total MXN",
                      amount(reviseSuggested),
                    )}
                    {!val("total") && (
                      <Note>{`Vacío = ${money(reviseSuggested)}: cada producto al precio con el que se vendió; los nuevos a precio de lista${reviseFeeBps ? `, más la comisión que absorbe el cliente (${money(reviseSuggested - reviseGoods)})` : ""}.`}</Note>
                    )}
                    {reviseRefund > 0 && (
                      <>
                        {accountField(
                          "refundAccountId",
                          "Cuenta de donde sale la devolución *",
                        )}
                        {canMpRefund && (
                          <Checkbox
                            label={`Devolver ${money(reviseRefund)} también en Mercado Pago`}
                            hint="Se regresa a la tarjeta del cliente desde tu cuenta de Mercado Pago. Si lo desmarcas, solo se registra en la app."
                            value={val("mpRefund") === "1"}
                            onChange={(v) => set("mpRefund", v ? "1" : "")}
                          />
                        )}
                      </>
                    )}
                    {field("note", "Motivo / nota (opcional)")}
                    {more()}
                    {advanced && (
                      <View style={[s.between, { marginBottom: 6 }]}>
                        <Text style={[s.body, { flex: 1 }]}>
                          Autorizar total debajo del costo
                        </Text>
                        <Switch value={allow} onValueChange={setAllow} />
                      </View>
                    )}
                    <Card tone={reviseRefund > 0 ? "warn" : "ok"}>
                      {line("Total anterior", money(revising.total))}
                      {line(
                        "Nuevo total",
                        reviseTotal === null ? "—" : money(reviseTotal),
                        { bold: true },
                      )}
                      {line("Ya cobrado", money(revisePaid))}
                      {divider()}
                      {reviseRefund > 0
                        ? line("Devolver al cliente", money(reviseRefund), {
                            bold: true,
                            color: C.red,
                          })
                        : reviseBalance > 0
                          ? line("Queda por cobrar", money(reviseBalance), {
                              bold: true,
                              color: C.amber,
                            })
                          : line("Sin movimiento de dinero", "✓")}
                      <Note>
                        Folio, fecha y cliente se conservan. La comisión del
                        cobro original con tarjeta no cambia.
                      </Note>
                    </Card>
                  </>
                )}
                {form === "Paquete" && (
                  <>
                    {field("name", "Nombre *")}
                    {moneyField("price", "Precio del paquete MXN *")}
                    {(() => {
                      const base = tryCents(val("price"));
                      return (
                        <Note>{`Tu precio: lo que recibes completo.${base ? ` El cliente paga ${money(grossUp(base, data.feeBps))} (absorbe la comisión ${feeLabel(data.feeBps)}).` : ""}`}</Note>
                      );
                    })()}
                    {cartEditor}
                  </>
                )}
                {form === "Ajuste de inventario" &&
                  (() => {
                    const p = products.find((x) => x.id === val("productId"));
                    const counted =
                      val("counted").trim() === ""
                        ? null
                        : Number(val("counted"));
                    const diff =
                      p && counted !== null && Number.isFinite(counted)
                        ? counted - p.stock
                        : null;
                    return (
                      <>
                        {choose("productId", "Producto *", saleable, false)}
                        {!!p && (
                          <Card>
                            {line(
                              "Unidades físicas en la app",
                              String(p.stock),
                            )}
                            {line(
                              "Disponibles para vender",
                              String(p.available),
                            )}
                          </Card>
                        )}
                        {field(
                          "counted",
                          "Unidades que contaste *",
                          true,
                          p ? String(p.stock) : "0",
                        )}
                        {diff !== null && diff !== 0 && (
                          <Note color={diff < 0 ? C.red : C.green}>
                            {diff < 0
                              ? `Se descontarán ${-diff} ${-diff === 1 ? "unidad" : "unidades"} (primero de los lotes que caducan antes).`
                              : `Se agregarán ${diff} ${diff === 1 ? "unidad" : "unidades"} con el último costo registrado.`}
                          </Note>
                        )}
                        {chips(
                          "reason",
                          "Motivo *",
                          options([
                            "Conteo físico",
                            "Merma o caducado",
                            "Regalo o muestra",
                            "Dañado",
                            "Otro",
                          ]),
                        )}
                        {field("note", "Nota (opcional)")}
                        <Note>
                          El ajuste no mueve dinero. Las bajas cuentan como
                          merma (a su costo) en tu utilidad; las altas la
                          compensan.
                        </Note>
                      </>
                    );
                  })()}
                {form === "Renombrar cuenta" && (
                  <>
                    {field("name", "Nombre *")}
                    <Note>
                      Solo cambia el nombre que ves. El tipo ({val("kind")}) y
                      todo su historial se conservan; la comisión de tarjeta (
                      {feePct}) sigue aplicando únicamente a cuentas de tipo
                      Tarjeta.
                    </Note>
                  </>
                )}
                {form === "Configuración" && (
                  <>
                    {field("rate", "Comisión (%) *", true, "4.06")}
                    <Note>
                      Por defecto 4.06% (3.5% + IVA de Mercado Pago). El cliente
                      la absorbe con cualquier forma de pago y tú recibes tu
                      precio completo. Al guardar se envía a tus vendedores; las
                      ventas anteriores no cambian.
                    </Note>
                  </>
                )}
                <View style={{ height: 16 }} />
                {!!formError && <Note color={C.red}>{formError}</Note>}
                {form === "Venta" &&
                mpActive &&
                saleIsCard &&
                (salePaid ?? 0) > 0 ? (
                  <>
                    <Button
                      title={
                        busy
                          ? "Enviando…"
                          : `💳 Cobrar ${money(salePaid ?? 0)} en la terminal`
                      }
                      disabled={busy || !cart.length}
                      onPress={() => save("terminal")}
                    />
                    <Button
                      title="Ya lo cobré · registrar sin enviar a la terminal"
                      secondary
                      small
                      disabled={busy || !cart.length}
                      onPress={() => save()}
                    />
                    <Note>
                      La venta se registra solo cuando Mercado Pago aprueba el
                      pago.
                    </Note>
                  </>
                ) : form === "Enviar comprobante" ? (
                  <>
                    <Button
                      title="💬 Enviar por WhatsApp"
                      disabled={!validWhatsapp(val("phone"))}
                      onPress={() => void sendTypedReceipt()}
                    />
                    <Button
                      title="Compartir con otra app"
                      secondary
                      small
                      onPress={() =>
                        void Share.share({ message: receiptMessage() }).catch(
                          () => {},
                        )
                      }
                    />
                  </>
                ) : form === "Abono" &&
                  mpActive &&
                  accounts.find((a) => a.id === val("accountId"))?.kind ===
                    "Tarjeta" &&
                  (tryCents(val("amount")) ?? 0) > 0 ? (
                  <>
                    <Button
                      title={
                        busy
                          ? "Enviando…"
                          : `💳 Cobrar abono de ${money(tryCents(val("amount")) ?? 0)} en la terminal`
                      }
                      disabled={busy}
                      onPress={() => save("terminal")}
                    />
                    <Button
                      title="Ya lo cobré · registrar sin enviar a la terminal"
                      secondary
                      small
                      disabled={busy}
                      onPress={() => save()}
                    />
                    <Note>
                      El abono se registra solo cuando Mercado Pago aprueba el
                      pago.
                    </Note>
                  </>
                ) : (
                  <Button
                    title={
                      busy
                        ? "Guardando…"
                        : form === "Venta"
                          ? "Cobrar y confirmar venta"
                          : form === "Modificar venta"
                            ? val("mpRefund") === "1" && canMpRefund
                              ? "Devolver y guardar cambios"
                              : "Guardar cambios"
                            : "Guardar"
                    }
                    disabled={
                      busy ||
                      ((form === "Venta" || form === "Modificar venta") &&
                        !cart.length)
                    }
                    onPress={() => save()}
                  />
                )}
                <View style={{ height: 30 }} />
              </ScrollView>
            )}
          </KeyboardAvoidingView>
          {!!form && payOverlay}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
/**
 * Teléfono nuevo del dueño (ya entró con su correo y contraseña de dueño): no se
 * puede empezar de cero; se restaura el respaldo del negocio.
 */
function OwnerSetup({
  b,
  onDone,
  onBack,
}: {
  b: Business;
  onDone: () => void;
  onBack: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // 2.1: si tienes respaldo en la nube, se restaura sin buscar el archivo.
  const [cloudList, setCloudList] = useState<CloudBackup[] | null>(null);
  const ownerCloud = () => {
    const cfg = b.setting("cloudConfig", null);
    const session = b.setting("cloudSession", null);
    if (!cfg || !session) return null;
    const c = new Cloud(cfg, session, (ns: CloudSession | null) =>
      b.setSetting("cloudSession", ns),
    );
    c.device = deviceId(b);
    return c;
  };
  useEffect(() => {
    const c = ownerCloud();
    if (c) listBackups(c).then(setCloudList, () => setCloudList([]));
  }, []);
  async function restoreCloud(x: CloudBackup) {
    const c = ownerCloud();
    if (!c) return;
    setMsg("");
    setBusy(true);
    try {
      b.restore(await downloadBackup(c, x));
      try {
        await migratePhotos(b);
      } catch {}
      b.setSetting("ownerVerified", null);
      onDone();
    } catch (e) {
      setMsg(
        `No se pudo restaurar: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function restoreBackup() {
    setMsg("");
    try {
      const r = await Picker.getDocumentAsync({
        type: ["application/json", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (r.canceled) return;
      setBusy(true);
      const raw = await FS.readAsStringAsync(r.assets[0].uri);
      b.restore(raw);
      try {
        await migratePhotos(b);
      } catch {}
      b.setSetting("ownerVerified", null);
      onDone();
    } catch (e) {
      setMsg(
        `No se pudo restaurar: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[s.content, { paddingTop: 30 }]}
      >
        <Image
          source={LOGO_HEADER}
          accessibilityLabel="GNS · Nova Negocio"
          resizeMode="contain"
          style={{
            width: 260,
            height: 260 / LOGO_HEADER_RATIO,
            marginBottom: 18,
          }}
        />
        {!!msg && (
          <View style={s.errorBox}>
            <Text style={[s.body, { color: C.red }]}>{msg}</Text>
          </View>
        )}
        <Text style={s.title}>Restaura tu negocio</Text>
        <Note>
          Entraste como dueño ✓. Elige tu archivo de respaldo
          (Nova-respaldo-….json) para traer inventario, ventas, clientes y
          cuentas a este teléfono.
        </Note>
        <View style={{ height: 10 }} />
        {!!cloudList?.length && (
          <Button
            title={
              busy
                ? "Restaurando…"
                : `☁️ Restaurar de la nube (${when(cloudList[0].created_at)})`
            }
            disabled={busy}
            onPress={() => void restoreCloud(cloudList[0])}
          />
        )}
        <Button
          title={busy ? "Restaurando…" : "📂 Elegir mi respaldo"}
          secondary={!!cloudList?.length}
          disabled={busy}
          onPress={() => void restoreBackup()}
        />
        <View style={{ height: 14 }} />
        <Button
          title="Salir (cerrar sesión)"
          secondary
          small
          onPress={onBack}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
/** Decide si este teléfono es el del dueño (todos los datos) o el de un vendedor. */
function Root() {
  const [b, setB] = useState<Business | null>(null);
  const [role, setRole] = useState<string>("");
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      Business.secretStore = secureStore();
      const db = new Business(SQLite.openDatabaseSync("nova-negocio.db"));
      db.migrateSecrets();
      let r = db.setting("appRole", null) as string | null;
      // Entró como dueño pero aún no restaura su respaldo (cerró la app a medias).
      if (
        !r &&
        db.setting("ownerVerified", false) &&
        db.setting("cloudSession", null)
      )
        r = "owner-setup";
      if (!r) {
        // Un teléfono con datos (instalaciones anteriores) es el del dueño.
        const hasData =
          (db.one("SELECT COUNT(*) n FROM products").n as number) > 0 ||
          (db.one("SELECT COUNT(*) n FROM accounts").n as number) > 0 ||
          !!db.setting("lastBackupAt", null);
        if (hasData) {
          r = "owner";
          db.setSetting("appRole", r);
        }
      }
      setB(db);
      setRole(r || "choose");
    } catch (e) {
      setError(String(e));
    }
  }, []);
  /** Después de entrar con correo y contraseña. */
  const logged = (r: LoginResult) => {
    if (r === "owner") {
      const hasData =
        (b!.one("SELECT COUNT(*) n FROM products").n as number) > 0 ||
        (b!.one("SELECT COUNT(*) n FROM accounts").n as number) > 0;
      if (hasData) {
        b!.setSetting("appRole", "owner");
        return setRole("owner");
      }
      b!.setSetting("ownerVerified", true);
      return setRole("owner-setup");
    }
    b!.setSetting("appRole", "seller");
    setRole("seller");
  };
  const logout = async () => {
    const cfg = b!.setting("cloudConfig", null);
    const cloud = cfg ? new Cloud(cfg, b!.setting("cloudSession", null)) : null;
    if (cloud) cloud.device = deviceId(b!);
    try {
      await detachPush(b!, cloud);
    } catch (e) {
      Alert.alert("Cerrar sesión", e instanceof Error ? e.message : String(e));
      return;
    }
    b!.setSetting("cloudSession", null);
    b!.setSetting("ownerVerified", null);
    b!.setSetting("appRole", null);
    setRole("choose");
  };
  if (error)
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.content}>
          <Text style={s.title}>No se pudo abrir la base</Text>
          <Text style={s.body}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  if (!b || !role) return <SafeAreaView style={s.safe} />;
  if (role === "choose")
    return (
      <LoginScreen
        b={b}
        onLogged={logged}
        onNewSeller={() => (
          b.setSetting("appRole", "seller"),
          setRole("seller")
        )}
      />
    );
  if (role === "owner-setup")
    return (
      <OwnerSetup
        b={b}
        onBack={logout}
        onDone={() => (b.setSetting("appRole", "owner"), setRole("owner"))}
      />
    );
  if (role === "seller")
    return (
      <LockGate b={b}>
        <SellerApp
          b={b}
          onReset={() => (b.setSetting("appRole", null), setRole("choose"))}
          onOwner={() => logged("owner")}
        />
      </LockGate>
    );
  return (
    <LockGate b={b}>
      <AppContent business={b} />
    </LockGate>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}
