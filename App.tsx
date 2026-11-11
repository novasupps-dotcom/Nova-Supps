import React, { useEffect, useMemo, useRef, useState } from "react";
import { STORE_NAME } from "./src/theme";
import { canLoadFonts, fontsReady, loadFonts } from "./src/fonts";
import { Alert, AppState, BackHandler, FlatList, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, Share, Vibration, View, useWindowDimensions } from "react-native";
import { Text, TextInput } from "./src/text";
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
  feeLabel,
  grossUp,
  chargeFor,
  promoSummary,
  promoTagFor,
  saleSegment,
  jordanianStack,
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
import { findProductByCode } from "./src/barcodes";
import {
  autoRegisterPush,
  setupNotifications,
  scheduleFollowUps,
  notifyOwnerSale,
  detachPush,
} from "./src/push";
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
  type RemoteSale,
  type SyncResult,
} from "./src/sync";
import { SellerApp } from "./src/seller";
import { LoginScreen, loginHere, type LoginResult } from "./src/login";
import { type TransferAccount } from "./src/transfer";
import {
  saleReceiptText,
  cardReceiptText,
  cardFromOrder,
  cardFromPayment,
  mergeCard,
  terminalPayments,
  whatsappNumber,
} from "./src/receipt";
import { LockGate, useLock } from "./src/lock";
import { backupDue, uploadBackup } from "./src/cloudBackup";
import { catalogueImages } from "./src/catalogueImages";
import { LOGO_FULL, LOGO_FULL_RATIO, LOGO_HEADER, LOGO_HEADER_RATIO } from "./src/brand";
import {
  salesWorkbook,
  EXPORT_PERIODS,
  XLSX_MIME,
  type ExportPeriod,
} from "./src/salesExcel";
import { base64 } from "./src/xlsx";
import { stockWorkbook } from "./src/stockExcel";
import {
  MercadoPago,
  MpError,
  orderOutcome,
  outcomeText,
  orderPayment,
  paymentFee,
  manualOrder,
  type MpConfig,
  type TerminalPayment,
} from "./src/mercadopago";
import {
  C,
  s,
  Button,
  Card,
  Note,
  Chips,
  SearchBox,
  ProductPhoto,
  ProductGrid,
  directCatalogueKey,
  DateField,
  QUICK_FOLLOWUP,
  addDays,
  daysBetween,
  fmtDay,
  tryCents,
  followUpsDue,
  followUpLabel,
  FOLLOW_UP_DAYS,
  AppHeader,
  TabBar,
  Icon,
  IconButton,
  CartButton,
  CartFlyLayer,
  noteTouch,
  TextButton,
  BottomDock,
  PayOptions,
  Stepper,
} from "./src/ui";

import { VERSION } from "./src/screens/ownerShared";
import { KEYBOARD_BEHAVIOR, useKeyboardFollow } from "./src/keyboard";
import {
  HOME,
  PAGES,
  TABS,
  pageTitle,
  normalize,
  amount,
  strings,
  options,
  minus,
  units,
  periodFrom,
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
import { FollowUpPopupModal, OwnerFormModal, OwnerSetup, PayOverlayModal } from "./src/screens/OwnerModals";

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
  let _lots: Row[] | undefined;
  let _expiringIds: Set<string> | undefined;
  let _lines: Map<string, Row[]> | undefined;
  let _payByAccount: Map<string, Record<string, number>> | undefined;
  let _m: Row | undefined;
  return {
    products,
    customers: b.customers(),
    accounts: b.accounts(),
    sales,
    get lots() {
      return (_lots ??= b.lots());
    },
    get expiringIds() {
      if (!_expiringIds) {
        const day = today();
        _expiringIds = new Set(
          this.lots
            .filter((l) => l.qty > 0 && l.expires && daysBetween(day, String(l.expires)) <= 45)
            .map((l) => String(l.productId)),
        );
      }
      return _expiringIds;
    },
    get lines() {
      return (_lines ??= b.saleLinesBySale());
    },
    get payByAccount() {
      return (_payByAccount ??= b.salePaymentsByAccount());
    },
    byCustomer,
    get m() {
      return (_m ??= b.metrics());
    },
    lastBackup: b.setting("lastBackupAt", null) as string | null,
    mp: b.setting("mpConfig", null) as MpConfig | null,
    mpPending: b.setting("mpPending", null) as Row | null,
    period: b.setting("homePeriod", "Todo") as string,
    biometric: b.setting("biometricEnabled", true) !== false,
    // 2.7: lo que se suma al cobrar (0 si la comisión ya va en el precio).
    feeBps: b.upliftBps(),
    cardFeeBps: b.feeBps(),
    feeInPrice: b.feeInPrice(),
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
  const [followPopup, setFollowPopup] = useState(false);
  const [parkedCart, setParkedCart] = useState<{ items: Cart; f: Record<string, string>; at: string } | null>(null);
  // 2.9: en el cobro, «Recibes / ganas» se abre con un toque.
  const [privateOpen, setPrivateOpen] = useState(false);
  // 2.9: el formulario abierto (o, si no hay, la pantalla) se desplaza al campo con teclado.
  const mainList = useRef<any>(null);
  const formList = useRef<any>(null);
  const mainKeyboard = useKeyboardFollow(mainList, !form);
  const formKeyboard = useKeyboardFollow(formList, !!form && !selector);
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
  const [saleSeg, setSaleSeg] = useState("Todos");
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
  // 2.9: recuerda dónde ibas en cada pantalla.
  const scrollAt = useRef<Record<string, number>>({});
  const restore = useRef<{ page: string; y: number; until: number } | null>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 700;

  useEffect(() => {
    try {
      const db =
        business ?? new Business(SQLite.openDatabaseSync("nova-negocio.db"));
      const saved = db.setting("uiSession", null);
      if (saved && saved.version === 1) {
        const valid = new Set(PAGES);
        const savedPage = saved.page === "Catálogo" ? "Stock" : saved.page;
        setPage(valid.has(savedPage) ? savedPage : HOME);
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
    const t = setTimeout(() => setToast(null), 1800);
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
  const basketQtyMap = useMemo(
    () => new Map(basket.map((i) => [i.productId, i.qty] as [string, number])),
    [basket],
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
        b.customers().map((c) => ({
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
      b,
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
          `${list.length === 1 ? "Seguimiento próximo" : `${list.length} seguimientos próximos`}`,
          `En los próximos ${FOLLOW_UP_DAYS} días (o vencidos):\n\n${lines.join("\n")}`,
          [
            { text: "Después", style: "cancel" },
            {
              text: "Ver clientes",
              onPress: () => goRef.current("Clientes", "Próximos 5 días"),
            },
          ],
        );
        if (!(globalThis as any).IS_REACT_ACT_ENVIRONMENT)
          setFollowPopup(true);
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
    if ((page === "Equipo" || page === "Transferencias") && b && !locked)
      void loadTeam();
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
    // 2.10.1: al registrar una venta no se muestra la barra de aviso (solo vibra).
    if (!/^Venta registrada\b/.test(text)) setToast({ text, key: Date.now() });
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
      null,
      d.f.channel,
      d.allow,
      null,
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
    let noticeTotal = 0;
    b!.transaction(() => {
      const x = saleArgs(d);
      noticeTotal = x.price;
      const id = b!.sell(...x.args);
      saleId = id;
      b!.updateSaleDetails(id, { ...d.f, channel: d.f.channel });
      if (d.f.customerId) {
        const cust = data?.customers.find((c) => c.id === d.f.customerId);
        const markLoyal =
          d.f.markLoyal === "1" ||
          ((d.f.applyDiscount === "1" || !!d.f.total) && d.f.markLoyal !== "0");
        if (cust && (Number(d.f.autoFollow) > 0 || markLoyal)) {
          const prevNotes = String(cust.notes || "").trim();
          const loyalTag = "⭐ Cliente Leal";
          const nextNotes =
            markLoyal && !prevNotes.includes(loyalTag)
              ? [prevNotes, loyalTag].filter(Boolean).join(" · ")
              : prevNotes;
          b!.saveCustomer({
            ...strings(cust),
            id: cust.id,
            stage: markLoyal ? "Frecuente" : cust.stage || "Cliente",
            notes: nextNotes,
            nextDate:
              Number(d.f.autoFollow) > 0
                ? addDays(today(), Number(d.f.autoFollow))
                : cust.nextDate || "",
          });
        }
      }
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
    const account = data?.accounts.find((a) => a.id === d.f.accountId);
    void notifyOwnerSale(b!, {
      id: saleId,
      total: noticeTotal,
      method: account?.kind || d.f.channel,
    }).catch(() => {});
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
      void autoRegisterPush(b, cloud)
        .then((state) => {
          if (
            state === "ok" &&
            previousPush !== JSON.stringify(b.setting("pushToken", null))
          )
            refresh();
        })
        .catch(() => {});
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
          void notifyOwnerSale(b, {
            id: row.id,
            total: Number((row as Row).client_total ?? row.total),
            seller: row.seller_name,
            method: row.method,
            remote: true,
          }).catch(() => {});
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
    `Hola ${name}, para vender con ${STORE_NAME}:\n1. Instala la app (te paso el archivo APK).\n2. Ábrela y elige «Soy vendedor».\n3. Escribe tu código de invitación: *${formatShortCode(code)}*\n4. Pon tu nombre, tu correo y una contraseña, y toca «Crear mi cuenta».\nEl código es solo para ti, sirve una vez y vence el ${fmtDay(localDay(expires))}.`;
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
          text: `La terminal elegida ya no aparece en tu cuenta de Mercado Pago. Revisa Ajustes → Terminal Mercado Pago, o ${what} sin terminal.`,
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
    Venta: { channel: "Mostrador", qty: "1" },
    Entrada: { mode: "Inventario inicial", label: "Entrada", qty: "1" },
    Cuenta: { kind: "Efectivo" },
    Movimiento: { kind: "expense" },
    "Ajuste de inventario": { reason: "Conteo físico" },
  };
  const cashAccount = () =>
    data?.accounts.find((a) => a.kind === "Efectivo")?.id || "";
  /** 2.5.1 · Formas de cobro que el dueño quitó de su carrito (Ajustes → Formas de pago). */
  const hiddenPay = (): string[] =>
    (b?.setting("hiddenPayAccounts", []) as string[]) || [];
  /** Cuenta que se elige sola al cobrar: efectivo si está a la vista; si no, la primera visible. */
  const saleDefaultAccount = () => {
    const shown = (data?.accounts || []).filter((a) => !hiddenPay().includes(a.id));
    return (shown.find((a) => a.kind === "Efectivo") || shown[0])?.id || cashAccount();
  };
  function open(
    name: string,
    values: Record<string, string> = {},
    nestedField?: string,
  ) {
    setBarcodeScanner(false);
    if (nestedField)
      setStack((prev) => [
        ...prev,
        { form, f, cart, allow, advanced, field: nestedField },
      ]);
    else setStack([]);
    setF({
      ...defaults[name],
      ...(name === "Venta" && !values.accountId
        ? { accountId: saleDefaultAccount() }
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
  /** Ajusta las piezas a lo disponible (carrito guardado de otro día). */
  function fitItems(items: Cart) {
    const short: string[] = [];
    const fitted = items
      .map((i) => {
        const limit = cartLimit(i.productId, "Venta");
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
    if (!quiet) notify(`${productName(productId)} en el carrito`);
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
    const { fitted, short } = fitItems(basketRef.current);
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
    // Con total fijo: se cobra directo a ese precio (no pasa por el carrito).
    if (items.length && values.total) {
      checkoutFromBasket.current = false;
      open("Venta", values);
      const { fitted, short } = fitItems(items);
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
    setBarcodeScanner(false);
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
          (b?.sellable(id) ?? 0) >= 1);
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
  const go = (raw: string, filter?: string) => {
    const p = raw === "Catálogo" ? "Stock" : raw;
    if (filter !== undefined) setFilters((old) => ({ ...old, [p]: filter }));
    if (p === page) return;
    setHistory((old) => (TABS.some((t) => t.name === p) ? [] : [...old, page]));
    setPage(p);
    setQuery("");
  };
  goRef.current = go;
  const back = () => {
    if (history.length) {
      const to = history[history.length - 1];
      // 2.9: al regresar, la pantalla queda donde estabas (por ejemplo, en el producto que editaste).
      restore.current = { page: to, y: scrollAt.current[to] ?? 0, until: Date.now() + 2500 };
      setPage(to);
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
   * venta (regresarían al inventario).
   */
  // Cálculos de existencias por pantalla: una consulta por venta, no una por producto.
  const limitCache = new Map<string, Map<string, number>>();
  const cached = (key: string, make: () => Map<string, number>) => {
    let m = limitCache.get(key);
    if (!m) limitCache.set(key, (m = make()));
    return m;
  };
  function cartLimit(productId: string, mode = form): number {
    if (mode !== "Venta" && mode !== "Modificar venta")
      return Number.POSITIVE_INFINITY;
    let limit = Math.max(0, productById.get(productId)?.available ?? 0);
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
  /** 2.10 · Reporte de stock (Excel) desde la pantalla Stock. */
  const stockBusy = useRef(false);
  async function exportStock() {
    if (!b || stockBusy.current) return;
    stockBusy.current = true;
    try {
      const { bytes, count, fileName } = stockWorkbook(b);
      assert(count > 0, "Aún no hay productos en Stock.");
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
        dialogTitle: "Guardar reporte de stock",
        UTI: "org.openxmlformats.spreadsheetml.sheet",
      });
      await pruneFiles("Stock_Nova_", 3, (name) =>
        name.replace(/^.*_(\d{4}-\d{2}-\d{2}_\d{4})\.xlsx$/, "$1"),
      );
      notify(`Reporte de stock listo · ${count} ${count === 1 ? "producto" : "productos"}`);
    } catch (e) {
      Alert.alert("Reporte de stock", errText(e));
    } finally {
      stockBusy.current = false;
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
  const matching = (rows: Row[]) => {
    const q = normalize(query);
    if (!q) return rows;
    return rows.filter((r) =>
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
      ).includes(q),
    );
  };
  const editProduct = (p: Row) => {
    const { imageUri, ...rest } = p;
    // La foto guardada no se copia al borrador: así el borrador no pesa ~1 MB por tecla.
    open("Producto", {
      ...strings(rest),
      price: amount(p.price),
      // 2.10.1: existencias editables desde la ficha del producto.
      stockNow: String(p.stock ?? 0),
      stockWas: String(p.stock ?? 0),
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
  const searchBox = (placeholder: string) => (
    <SearchBox value={query} onChange={setQuery} placeholder={placeholder} />
  );
  const filterChips = (key: string, list: string[]) => (
    <View style={{ marginBottom: 10 }}>
      <Chips
        row
        options={options(list)}
        value={filters[key] || list[0]}
        onChange={(v) => setFilters((old) => ({ ...old, [key]: v }))}
      />
    </View>
  );
  const sellButton = (p: Row) => {
    const n = basketQtyMap.get(p.id) ?? 0;
    return (
      <Button
        icon="shopping-cart" title={n ? `En el carrito: ${n} · ＋1` : "Al carrito"}
        small
        disabled={p.available < 1 || n >= p.available}
        onPress={() => addToBasket(p.id, 1, true)}
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
            opts.bold && { fontWeight: "600" },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            s.body,
            { fontWeight: opts.bold ? "700" : "500" },
            opts.color ? { color: opts.color } : null,
          ]}
        >
          {value}
        </Text>
        {!!opts.onPress && <Icon name="chevron-right" size={16} color={C.faint} />}
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
  const feePct = feeLabel(data?.cardFeeBps);
  /** Ventas netas = suma de las formas de pago; solo tarjeta descuenta su comisión. */
  const excelCard = (label = "Excel") =>
    excel ? (
      <Card>
        <Text style={s.subtitle}>Excel de ventas</Text>
        <Note>Ventas, productos, cobros, comisiones y utilidad del periodo.</Note>
        <View style={{ height: 6 }} />
        <Chips
          row
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
        icon="download"
        title={label}
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
    </Card>
  );
  /** Disponible = ventas netas (la comisión ya se descontó solo de tarjeta) − gastos operativos. */
  const resultCard = (ps: Row) => (
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
    </Card>
  );
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
      excelOpen: !!excel,
    openExcel: () => setExcel({ period: "Este mes", busy: false }),
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
      exportStock,
      gridProducts,
      basket,
      basketQtyMap,
      basketCustomerId: basketF.customerId || "",
      clearBasketCustomer: () =>
        setBasketF((old) => ({ ...old, customerId: "" })),
      openFollowPopup: () => setFollowPopup(true),
      parkedCart,
      resumeParkedCart: () => {
        if (!parkedCart) return;
        setBasket(parkedCart.items);
        setBasketF(parkedCart.f);
        setParkedCart(null);
        notify("Venta en espera retomada");
      },
      discardParkedCart: () => {
        setParkedCart(null);
        notify("Venta en espera descartada");
      },
      productById,
      addToBasket,
      removeFromBasket,
      saleSeg,
      setSaleSeg,
      emptyBasket,
      openCheckout,
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
      basketF.customerId,
      parkedCart,
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
            source={LOGO_FULL}
            accessibilityLabel="GGG · Nova Supps"
            resizeMode="contain"
            style={{
              width: 240,
              height: 240 / LOGO_FULL_RATIO,
              marginBottom: 18,
            }}
          />
          <Note>Abriendo tu negocio…</Note>
        </View>
      </SafeAreaView>
    );
  if (!data) return <SafeAreaView style={s.safe} />;

  // ---------- Formularios ----------
  const { products, customers, accounts } = data;
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
        onSubmitEditing={
          ["barcode", "sku"].includes(key) && form === "Producto"
            ? () => {
                if (val(key).trim())
                  open("Inventario por código", { barcode: val(key) });
              }
            : undefined
        }
        submitBehavior={["barcode", "sku"].includes(key) ? "submit" : undefined}
        autoCorrect={!["barcode", "sku"].includes(key)}
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
        placeholderTextColor={C.muted}
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
          placeholderTextColor={C.muted}
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          s.input,
          s.between,
          { borderColor: C.paper },
          pressed && { backgroundColor: C.soft },
        ]}
        onPress={() => {
          setSearch("");
          setSelector({ key, label, rows, optional, create });
        }}
      >
        <Text style={{ color: C.ink, fontSize: 16 }}>{label.replace(/ \*$/, "")}</Text>
        <Text
          style={{
            color: val(key) ? C.ink : C.muted,
            fontSize: 16,
            flex: 1,
            textAlign: "right",
            fontWeight: val(key) ? "500" : "400",
          }}
          numberOfLines={1}
        >
          {rows.find((r) => r.id === val(key))?.name ||
            (optional ? "Sin asignar" : "Seleccionar")}
        </Text>
        <Icon name="chevron-right" size={18} color={C.faint} />
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
  const accountField = (key: string, label: string, list: Row[] = accounts) =>
    list.length <= 6 ? (
      <View key={key} style={s.field}>
        <Text style={s.label}>{label}</Text>
        <PayOptions
          options={list.map((a) => ({ id: a.id, name: a.name, kind: a.kind }))}
          value={val(key)}
          onChange={(v) => set(key, v)}
        />
      </View>
    ) : (
      choose(key, label, list, false, "Cuenta")
    );
  // 2.5.1: en el cobro solo las formas que el dueño dejó en su carrito (y la ya elegida, si la hay).
  const saleAccounts = (() => {
    const hidden = hiddenPay();
    const shown = accounts.filter((a) => !hidden.includes(a.id) || a.id === val("accountId"));
    return shown.length ? shown : accounts;
  })();
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
  const more = (label = "＋ Más detalles (opcional)") => (
    <Pressable
      accessibilityRole="button"
      onPress={() => setAdvanced(!advanced)}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={{ color: C.brand, fontSize: 15, fontWeight: "500" }}>
        {advanced ? "− Menos detalles" : label}
      </Text>
    </Pressable>
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
          // Si otra operación vinculó el código mientras se preparaba el alta, se reutiliza la ficha.
          const existing = !val("id")
            ? findProductByCode(products, val("barcode")) ||
              findProductByCode(products, val("sku"))
            : null;
          if (existing && val("scanOrigin") === "1") {
            setBusy(false);
            saveBusy.current = false;
            open("Inventario por código", {
              barcode: val("barcode") || val("sku"),
            });
            notify(
              "Este producto ya existe. Se cargó su ficha con el precio registrado.",
            );
            return;
          }
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
          const { hasPhoto, toBasket, stockNow, stockWas, ...input } = f;
          // 2.10.1: cambiar las existencias al editar (corrección sin merma ni dinero).
          const stockTarget = val("id") && (stockNow ?? "").trim() !== "" ? Number(stockNow) : null;
          const stockChanged = stockTarget !== null && String(stockTarget) !== String(stockWas ?? "");
          if (stockTarget !== null)
            assert(Number.isSafeInteger(stockTarget) && stockTarget >= 0, "Las existencias deben ser un número entero (0 o más).");
          if (stockChanged) b.dryRun(() => b.correctStock(val("id"), stockTarget!, "Editado en Stock"));
          saved = b.quickProduct({
            ...input,
            imageUri: f.imageUri ?? undefined,
            price: cents(val("price")),
            minimum: Number(val("minimum") || "1"),
            qty,
            cost: cents(val("cost") || "0"),
          });
          done = val("id") ? "Producto actualizado" : "Producto creado";
          if (stockChanged) {
            const r = b.correctStock(val("id"), stockTarget!, "Editado en Stock");
            done = `Producto actualizado · existencias ${r.before} → ${r.after}`;
          }
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
        case "Cuenta":
          saved = b.addAccount(
            val("name"),
            val("kind"),
            cents(val("opening") || "0"),
          );
          done = "Cuenta creada";
          break;
        case "Entrada": {
          assert(val("productId"), "Selecciona el producto.");
          if (val("scanProductId")) {
            assert(
              val("productId") === val("scanProductId"),
              "Esta entrada corresponde al producto escaneado. Vuelve a leer el código para elegir otro.",
            );
            assert(
              products.some(
                (product) =>
                  product.id === val("scanProductId") && !product.archived,
              ),
              "El producto ya no está disponible para recibir stock. Vuelve a abrir su ficha.",
            );
          }
          assert(
            val("cost").trim(),
            "Indica el costo unitario; escribe 0 si fue sin costo.",
          );
          const qty = Number(val("qty"));
          assert(
            Number.isSafeInteger(qty) && qty > 0,
            "La cantidad debe ser un número entero mayor que cero.",
          );
          b.transaction(() => {
            if (val("barcode"))
              b.linkProductCode(val("productId"), val("barcode"));
            b.receive(
              val("productId"),
              val("label") || "Entrada",
              val("expires"),
              qty,
              cents(val("cost")),
              val("mode") === "Compra pagada"
                ? val("accountId") || "required"
                : null,
            );
          });
          done = `Entrada registrada · ${units(qty)}`;
          break;
        }
        case "Movimiento":
          b.movement(
            val("kind"),
            val("accountId"),
            cents(val("amount")),
            val("note"),
            null,
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
        case "Ajuste de inventario": {
          const counted = Number(val("counted"));
          assert(val("productId"), "Elige el producto.");
          assert(
            val("counted").trim() !== "" &&
              Number.isSafeInteger(counted) &&
              counted >= 0,
            "Escribe cuántas unidades contaste (número entero).",
          );
          // 2.8.4: «Se duplicó» corrige sin contar como merma (quita primero lo más reciente).
          if (val("reason") === DUPLICATED || val("reason") === CORRECTION) {
            const r = b.correctStock(val("productId"), counted, val("note") || "Inventario duplicado");
            done = `Cantidad corregida: ${r.before} → ${r.after}`;
            break;
          }
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
          const repriced = b.setFeeBps(Math.round(Number(raw) * 100));
          done = `Comisión: ${feeLabel(Math.round(Number(raw) * 100))}${repriced ? ` · ${repriced} precios ajustados` : ""}`;
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
        <View style={[s.between, { marginBottom: 6, paddingHorizontal: 4 }]}>
          <Text
            style={[s.subtitle, { marginBottom: 0 }]}
          >{`Tu carrito · ${cart.reduce((n, i) => n + i.qty, 0)} ${cart.reduce((n, i) => n + i.qty, 0) === 1 ? "pieza" : "piezas"}`}</Text>
          <TextButton title="＋ Agregar más" bold onPress={keepShopping} />
        </View>
      ) : (
        <>
          <Text style={s.subtitle}>Productos</Text>
          <ProductGrid
            lookupStore={b}
            onUnknownCode={(code) => open("Producto", { barcode: code }, "cartAdd")}
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
      {!!cart.length && (
        <View style={[s.list, { paddingHorizontal: 16 }]}>
          {cart.map((i, idx) => {
            const p = products.find((x) => x.id === i.productId);
            const limit = cartLimit(i.productId);
            const atMax = i.qty >= limit;
            const unit =
              form === "Venta"
                ? grossUp(p?.price || 0, data.feeBps)
                : p?.price || 0;
            return (
              <View
                key={i.productId}
                style={[s.cartRow, idx === cart.length - 1 && { borderBottomWidth: 0 }]}
              >
                {!!p && (
                  <ProductPhoto product={p} style={{ width: 48, height: 58 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[s.body, { fontWeight: "500" }]} numberOfLines={2}>
                    {p?.name}
                  </Text>
                  <Note>{`${i.qty} × ${money(unit)} = ${money(unit * i.qty)}`}</Note>
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
                <Stepper
                  qty={i.qty}
                  plusDisabled={atMax}
                  onMinus={() =>
                    i.qty > 1
                      ? changeQty(i.productId, -1)
                      : setCart((old) =>
                          old.filter((x) => x.productId !== i.productId),
                        )
                  }
                  onPlus={() => changeQty(i.productId, 1)}
                />
              </View>
            );
          })}
        </View>
      )}
      {form === "Venta" && !!cart.length && (() => {
        const jStack = jordanianStack(b!, gridProducts as any, cart, val("customerId") || null);
        if (jStack.complete || !jStack.items.length) return null;
        return (
          <View style={{ marginBottom: 8, gap: 4 }}>
            <Text style={[s.label, { marginBottom: 0, color: C.brand }]}>{jStack.label}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {jStack.items.map((sug: any) => (
                <Pressable
                  key={sug.id}
                  accessibilityRole="button"
                  onPress={() => addOne(sug.id)}
                  style={[
                    s.chip,
                    {
                      backgroundColor: C.brandSoft,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      maxWidth: "100%",
                    },
                  ]}
                >
                  <Text
                    style={[s.chipText, { color: C.brand, fontSize: 12.5, fontWeight: "600" }]}
                    numberOfLines={1}
                  >
                    {`＋ ${sug.name} (${money(sug.price)})`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })()}
      {form === "Venta" && checkoutFromBasket.current && !!cart.length && (
        <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 18, marginTop: -4, marginBottom: 4 }}>
          <TextButton
            title="Poner en espera"
            color={C.brand}
            onPress={() => {
              setParkedCart({
                items: cart,
                f: { ...f },
                at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              });
              setBasket([]);
              setBasketF({});
              setCart([]);
              checkoutFromBasket.current = false;
              close();
              go("Vender");
              notify("Venta puesta en espera");
            }}
          />
          <TextButton title="Vaciar carrito" color={C.red} onPress={emptyBasket} />
        </View>
      )}
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
  const previewMatchedKey = directCatalogueKey(
    editingProduct
      ? {
          ...editingProduct,
          name: val("name") || editingProduct.name,
          sku: val("sku") || editingProduct.sku,
          brand: val("brand") || editingProduct.brand,
          presentation: val("presentation") || editingProduct.presentation,
          imageKey: val("imageKey") || editingProduct.imageKey,
        }
      : {
          id: val("id"),
          name: val("name"),
          sku: val("sku"),
          brand: val("brand"),
          presentation: val("presentation"),
          imageKey: val("imageKey"),
        },
  );
  const photoPreview = f.imageUri
    ? [{ uri: f.imageUri }]
    : editingProduct?.imageUri
      ? [{ uri: editingProduct.imageUri }]
      : editingProduct?.cleanImageUri
        ? [{ uri: editingProduct.cleanImageUri }]
        : catalogueImages[val("imageKey")] ||
          catalogueImages[val("sku")] ||
          catalogueImages[val("id")] ||
          (previewMatchedKey ? catalogueImages[previewMatchedKey] : null) ||
          [];

  const payOverlay = (
    <PayOverlayModal
      pay={pay}
      setPay={setPay}
      b={b}
      refresh={refresh}
      cancelCharge={cancelCharge}
      reviewLater={reviewLater}
      chargeOnTerminalInstead={chargeOnTerminalInstead}
      findManualPayment={findManualPayment}
      linkManualPayment={linkManualPayment}
      finishApproved={finishApproved}
      refundCharge={refundCharge}
      startCharge={startCharge}
      registerWithoutTerminal={registerWithoutTerminal}
      checkTerminalThenCharge={checkTerminalThenCharge}
      terminalPayments={terminalPayments}
      sendCardReceipt={sendCardReceipt}
    />
  );
  const listBody = body && "list" in body ? body.list : null;
  const contentStyle = [s.content, wide && { maxWidth: 860 }];
  // 2.9: dónde va cada pantalla (para regresar al mismo lugar) y desplazarse al campo con teclado.
  const restoreScroll = () => {
    const r = restore.current;
    const list = mainList.current;
    if (!r || r.page !== page || !list) return;
    if (Date.now() > r.until || r.y <= 0) {
      restore.current = null;
      return;
    }
    if (typeof list.scrollToOffset === "function") list.scrollToOffset({ offset: r.y, animated: false });
    else list.scrollTo?.({ y: r.y, animated: false });
  };
  const mainScrollProps = {
    scrollEventThrottle: 64,
    onScroll: (e: any) => {
      mainKeyboard.onScroll(e);
      const y = e.nativeEvent.contentOffset.y;
      scrollAt.current[page] = y;
      const r = restore.current;
      if (r && r.page === page && Math.abs(y - r.y) < 4) restore.current = null;
    },
    onScrollBeginDrag: () => {
      if (restore.current?.page === page) restore.current = null;
    },
    onContentSizeChange: restoreScroll,
    onLayout: restoreScroll,
  };
  const basketPieces = basket.reduce((n, i) => n + i.qty, 0);
  // Lo que pagará el cliente (tus precios + la comisión que absorbe).
  const basketTotal = cartCharge(
    basket,
    basketF.total ? tryCents(basketF.total) : null,
  ).total;
  const isTabRoot = TABS.some((t) => t.name === page);
  const tabOf = (p: string) =>
    TABS.some((t) => t.name === p)
      ? p
      : ["Catálogo", "Detalle producto", "Lotes", "Repetidos"].includes(p)
        ? "Stock"
        : ["Detalle venta", "Corte de caja", "Resumen de ventas", "Cobros"].includes(p)
          ? "Ventas"
          : "";
  const activeTab =
    tabOf(page) ||
    [...history].reverse().map(tabOf).find(Boolean) ||
    "";

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]} onTouchStart={noteTouch}>
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
      <AppHeader
        title={pageTitle(page)}
        large={isTabRoot}
        center={
          page === HOME ? (
            <Image
              source={LOGO_HEADER}
              accessibilityLabel="GGG · Nova Supps"
              resizeMode="contain"
              style={{
                height: 40,
                width: 40 * LOGO_HEADER_RATIO,
                maxWidth: "100%",
              }}
            />
          ) : undefined
        }
        back={
          isTabRoot
            ? undefined
            : {
                label: pageTitle(history[history.length - 1] || HOME),
                onPress: back,
              }
        }
        right={
          isTabRoot || basket.length ? (
            <>
              {/* 2.10.4: carrito unificado en el encabezado (sin barra negra inferior). */}
              <CartButton
                count={basketPieces}
                total={basketTotal}
                onPress={() => (basket.length ? openCheckout() : go("Vender"))}
              />
              {isTabRoot && (
                <IconButton
                  icon="settings"
                  label="Ajustes"
                  onPress={() => go("Parámetros")}
                />
              )}
            </>
          ) : undefined
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "android" ? KEYBOARD_BEHAVIOR : undefined}>
        {listBody ? (
          <FlatList
            ref={mainList}
            {...mainScrollProps}
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
            ref={mainList}
            {...mainScrollProps}
            automaticallyAdjustKeyboardInsets
            key={page}
            contentContainerStyle={contentStyle}
            keyboardShouldPersistTaps="handled"
          >
            {body && "scroll" in body ? body.scroll : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      <BottomDock>
        {toast && (
          <Pressable
            key={toast.key}
            onPress={() => setToast(null)}
            style={[
              s.toast,
              { flexDirection: "row", gap: 8, alignItems: "center" },
              toast.bad && { backgroundColor: C.red },
            ]}
          >
            <Icon name={toast.bad ? "triangle-alert" : "circle-check"} size={18} color="#fff" />
            <Text style={s.toastText} numberOfLines={2}>{toast.text}</Text>
          </Pressable>
        )}
        <TabBar
          tabs={TABS}
          active={activeTab}
          onPress={(name) => (
            setFilters((old) => ({
              ...old,
              [name]: "",
              ...(name === "Ventas" ? { VentasPago: "", VentasDim: "", VentasVal: "" } : {}),
            })),
            go(name)
          )}
        />
      </BottomDock>
      <CartFlyLayer />
      {!form && payOverlay}
      <FollowUpPopupModal
        visible={followPopup}
        onClose={() => setFollowPopup(false)}
        customers={customers}
        b={b}
        act={act}
        openSale={openSale}
        go={go}
      />
      <OwnerFormModal
        form={form}
        pay={pay}
        selector={selector}
        setSelector={setSelector}
        close={close}
        val={val}
        set={set}
        checkoutFromBasket={checkoutFromBasket}
        stack={stack}
        search={search}
        setSearch={setSearch}
        open={open}
        cartLimit={cartLimit}
        cart={cart}
        setCart={setCart}
        setFormError={setFormError}
        productName={productName}
        addTo={addTo}
        formList={formList}
        formKeyboard={formKeyboard}
        wide={wide}
        formError={formError}
        b={b}
        products={products}
        act={act}
        choose={choose}
        setProductDetailId={setProductDetailId}
        go={go}
        addToBasket={addToBasket}
        field={field}
        barcodeScanner={barcodeScanner}
        setBarcodeScanner={setBarcodeScanner}
        moneyField={moneyField}
        data={data}
        more={more}
        advanced={advanced}
        photoPreview={photoPreview}
        busy={busy}
        photo={photo}
        dateField={dateField}
        editingProduct={editingProduct}
        archiveFromForm={archiveFromForm}
        chips={chips}
        editingCustomer={editingCustomer}
        saleable={saleable}
        accountField={accountField}
        accounts={accounts}
        saleIsCard={saleIsCard}
        salePaid={salePaid}
        bps={bps}
        saleTotal={saleTotal}
        cartEditor={cartEditor}
        saleCharge={saleCharge}
        listTotal={listTotal}
        customers={customers}
        saleAccounts={saleAccounts}
        productById={productById}
        allow={allow}
        setAllow={setAllow}
        privateOpen={privateOpen}
        setPrivateOpen={setPrivateOpen}
        saleBase={saleBase}
        saleCommission={saleCommission}
        receiptMessage={receiptMessage}
        receiptSale={receiptSale}
        revising={revising}
        reviseSuggested={reviseSuggested}
        reviseFeeBps={reviseFeeBps}
        reviseGoods={reviseGoods}
        reviseRefund={reviseRefund}
        canMpRefund={canMpRefund}
        line={line}
        reviseTotal={reviseTotal}
        revisePaid={revisePaid}
        divider={divider}
        reviseBalance={reviseBalance}
        mpActive={mpActive}
        save={save}
        sendTypedReceipt={sendTypedReceipt}
        payOverlay={payOverlay}
      />
    </SafeAreaView>
  );
}
/**
 * Teléfono nuevo del dueño (ya entró con su correo y contraseña de dueño): no se
 * puede empezar de cero; se restaura el respaldo del negocio.
 */
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
  // 2.4: Inter se registra antes de pintar (máximo 1.5 s); si no se puede, letra del sistema.
  const [fontsOk, setFontsOk] = useState(() => fontsReady() || !canLoadFonts());
  useEffect(() => {
    if (!fontsOk) void loadFonts().then(() => setFontsOk(true));
  }, []);
  if (!fontsOk) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

/** 2.8.4 · Motivo de «Cantidad»: corregir inventario que se cargó dos veces (no es merma). */
const DUPLICATED = "Se duplicó";
/** 2.10.1 · Cambiar la cantidad desde Stock: corrección sin merma ni dinero. */
const CORRECTION = "Corrección";
