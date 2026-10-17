// Teléfono del vendedor: solo vende. Ve existencias y precios, da de alta
// clientes, cobra a precio de lista (sin descuentos ni crédito) y consulta sus
// ventas del día. Las ventas llegan al teléfono del dueño por la base en línea.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, FlatList, Image, Keyboard, Linking, Modal, Pressable, ScrollView, Share, StatusBar, View } from "react-native";
import { Text, TextInput } from "./text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  money,
  chargeFor,
  grossUp,
  today as storeDay,
  promoDiscounts,
  promoLive,
  promoSummary,
  promoTagFor,
  saleSegment,
  CARD_FEE_BPS,
  MAX_FEE_BPS,
  type Business,
  type Promo,
  type Row,
} from "./business";
import {
  Cloud,
  CloudError,
  normalizeShortCode,
  INVITE_MESSAGES,
  publicInvoke,
  terminalFetcher,
  type CloudConfig,
  type CloudSession,
} from "./cloud";
import { loginHere, PasswordReset } from "./login";
import { TransferInfo } from "./transfer";
import { deviceId } from "./device";
import { storeCloud } from "./storeConfig";
import {
  MercadoPago,
  MpError,
  orderOutcome,
  outcomeText,
  orderPayment,
  terminalPaymentLabel,
} from "./mercadopago";
import {
  cardFromOrder,
  cardFromPayment,
  cardReceiptText,
  mergeCard,
  saleReceiptText,
  validWhatsapp,
  whatsappNumber,
} from "./receipt";
import {
  findTerminalPayments,
  claimTerminalPayment,
  type FoundPayment,
  myTransferAccounts,
  allowedMethods,
  defaultMethod,
  closingPreview,
  closeRegister,
  myClosings,
  cachedClosings,
  type Closing,
  type ClosingSummary,
  availableFor,
  cachedData,
  cachedToday,
  checkSale,
  flushQueue,
  mySalesToday,
  newId,
  queue,
  receiptPhone,
  receiptSale,
  recordSale,
  refreshCache,
  rejectedSales,
  searchCustomers,
  sentMarks,
  statusText,
  type SellerCache,
  type SellerSale,
} from "./sellerCore";
import { folioForRemote } from "./sync";
import { LOGO_HEADER, LOGO_HEADER_RATIO } from "./brand";
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
  CodeInput,
  ProductGrid,
  AppHeader,
  TabBar,
  Icon,
  IconButton,
  BottomDock,
  MenuList,
  PayOptions,
  Stepper,
  TextButton,
} from "./ui";
import { TILE } from "./theme";
import type { IconName } from "./icons";
import { autoRegisterPush, setupNotifications, detachPush } from "./push";
import { PushCard } from "./screens/PushCard";
import { UpdateNotice } from "./screens/UpdateNotice";

/** 2.3: cuatro pestañas; Cuenta se abre con el ícono de persona de arriba. */
const TABS: { name: string; icon: IconName }[] = [
  { name: "Vender", icon: "shopping-bag" },
  { name: "Stock", icon: "package" },
  { name: "Mis ventas", icon: "clipboard-list" },
  { name: "Caja", icon: "calculator" },
];
const POLL_MS = () => ((globalThis as any).__MP_POLL_MS as number) ?? 3000;
const SYNC_MS = () => ((globalThis as any).__SELLER_SYNC_MS as number) ?? 60000;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
// manual: la terminal está en modo normal; el vendedor cobra en la terminal y la app busca el pago (2.0.3).
type Charge = {
  stage:
    | "sending"
    | "pending"
    | "manual"
    | "searching"
    | "choose"
    | "approved"
    | "failed"
    | "error";
  text: string;
  orderId?: string;
  amount: number;
  draft: SellerSale;
  sale?: SellerSale;
  tick?: number;
  fails?: number;
  atTerminal?: boolean;
  manual?: boolean;
  since?: string;
  found?: FoundPayment[];
};
const manualText = (amount: number) =>
  `La terminal está en modo normal. Cobra ${money(amount)} directamente en la terminal y, cuando diga «Aprobado», toca «Ya cobré».`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Hay un cobro con tarjeta abierto (enviado a la terminal o cobrado a mano sin ligar). */
const openCharge = (c: Charge | null) => !!(c?.orderId || c?.manual);

export function SellerApp({
  b,
  onReset,
  onOwner,
}: {
  b: Business;
  onReset: () => void;
  onOwner?: () => void;
}) {
  const [resetPw, setResetPw] = useState(false);
  const [cfg, setCfg] = useState<CloudConfig | null>(
    b.setting("cloudConfig", null),
  );
  const [phase, setPhase] = useState<"connect" | "pending" | "ready">(
    b.setting("cloudSession", null)
      ? b.setting("sellerCache", null)
        ? "ready"
        : "pending"
      : "connect",
  );
  // La huella (si está activa) la pide LockGate antes de mostrar esta pantalla.
  const locked = false;
  const [tab, setTab] = useState("Vender");
  // Pestaña desde la que se abrió Cuenta (para volver a ella).
  const fromTab = useRef("Vender");
  const [version, setVersion] = useState(0);
  const [cache, setCache] = useState<SellerCache | null>(cachedData(b));
  const [today, setToday] = useState<SellerSale[]>(cachedToday(b));
  const [online, setOnline] = useState<boolean | null>(null);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [seg, setSeg] = useState("");
  const [gridQuery, setGridQuery] = useState("");
  const [keyboard, setKeyboard] = useState(false);
  // 2.0.1 · Vender tiene dos pantallas separadas: productos y carrito (cliente, forma de pago y cobro).
  const [cartOpen, setCartOpen] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const [cart, setCart] = useState<{ productId: string; qty: number }[]>([]);
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const [customer, setCustomer] = useState<Row | null>(null);
  const [newCustomer, setNewCustomer] = useState<{
    name: string;
    phone: string;
  } | null>(null);
  const [transferId, setTransferId] = useState("");
  const [method, setMethod] = useState<
    "Efectivo" | "Transferencia" | "Tarjeta"
  >(defaultMethod(cachedData(b)) || "Tarjeta");
  const [preview, setPreview] = useState<ClosingSummary | null>(null);
  const [closings, setClosings] = useState<Closing[]>(cachedClosings(b));
  const [closingMsg, setClosingMsg] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [openClosing, setOpenClosing] = useState("");
  const attempt = useRef(0);
  const [picker, setPicker] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [pickResults, setPickResults] = useState<Row[] | null>(null);
  const [charge, setCharge] = useState<Charge | null>(null);
  const chargeRef = useRef<Charge | null>(null);
  chargeRef.current = charge;
  const [receipt, setReceipt] = useState<{
    text: string;
    phone: string;
  } | null>(null);
  const sessionName = b.setting("sellerName", "") as string;

  const device = useMemo(() => deviceId(b), []);
  const cloud = useMemo(() => {
    if (!cfg) return null;
    const c = new Cloud(
      cfg,
      b.setting("cloudSession", null),
      (ns: CloudSession | null) => b.setSetting("cloudSession", ns),
    );
    c.device = device;
    return c;
  }, [cfg]);
  const pending = useMemo(() => queue(b), [version]);
  const sent = useMemo(() => sentMarks(b), [version]);
  const rejected = useMemo(() => rejectedSales(b), [version]);
  // Búsqueda de clientes en el servidor (con pausa para no consultar en cada tecla).
  useEffect(() => {
    if (!picker || pickQuery.trim().length < 2 || !cloud?.session)
      return setPickResults(null);
    let alive = true;
    const t = setTimeout(
      async () => {
        try {
          const rows = await searchCustomers(cloud, pickQuery);
          if (alive) setPickResults(rows);
        } catch {
          if (alive) setPickResults(null);
        }
      },
      (globalThis as any).__SEARCH_MS ?? 350,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [pickQuery, picker]);
  // Cada aviso dura lo mismo aunque haya uno anterior (su temporizador ya no lo borra).
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (t: string) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  /** Revisa permiso, envía la cola y descarga catálogo y ventas del día. */
  async function syncNow(quiet = true) {
    if (!cloud?.session) return;
    try {
      const st = await cloud.rpc("request_join", {
        p_name: sessionName || "Vendedor",
      });
      if (st === "other_device" || st === "none" || st === "update_app") {
        // Por seguridad: la cuenta no funciona en este teléfono.
        cloud.signOut();
        b.setSetting("cloudSession", null);
        b.setSetting("sellerCache", null);
        setCache(null);
        setPhase("connect");
        setOnline(true);
        setError(
          st === "other_device"
            ? "Tu cuenta se abrió en otro teléfono. Si este es tu teléfono, entra de nuevo con tu correo y contraseña."
            : INVITE_MESSAGES[st],
        );
        return;
      }
      if (st !== "active" && st !== "owner") {
        setPhase("pending");
        setOnline(true);
        return;
      }
      setPhase("ready");
      const previousPush = JSON.stringify(b.setting("pushToken", null));
      void autoRegisterPush(b, cloud)
        .then((state) => {
          if (
            state === "ok" &&
            previousPush !== JSON.stringify(b.setting("pushToken", null))
          )
            setVersion((v) => v + 1);
        })
        .catch(() => {});
      await flushQueue(b, cloud);
      setVersion((v) => v + 1);
      const [c, t] = await Promise.all([
        refreshCache(b, cloud),
        mySalesToday(b, cloud),
      ]);
      setCache(c);
      setToday(t);
      setOnline(true);
      setVersion((v) => v + 1);
      if (!quiet) notify("Catálogo actualizado");
    } catch (e) {
      setOnline(false);
      if (e instanceof CloudError && e.code === "session_expired")
        setPhase("connect");
      if (!quiet) setError(errText(e));
    }
  }
  useEffect(() => {
    if (locked || !cloud?.session) return;
    void syncNow();
    const t = setInterval(() => void syncNow(), SYNC_MS());
    const sub = AppState.addEventListener(
      "change",
      (st) => st === "active" && void syncNow(),
    );
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [locked, cloud]);
  useEffect(() => {
    if (phase !== "ready") return;
    return setupNotifications(
      () => void syncNow(),
      () => void syncNow(),
      () => !b.setting("pushOff", false),
    );
  }, [cloud, phase]);

  // Cobro en terminal (a través de la función del servidor: el teléfono no tiene la clave).
  const remoteMp = () => new MercadoPago("", terminalFetcher(cloud!));
  useEffect(() => {
    const saved = b.setting("sellerCharge", null) as Charge | null;
    if (saved && !charge)
      setCharge(
        saved.manual
          ? { ...saved, stage: "manual", text: manualText(saved.amount) }
          : {
              ...saved,
              stage: "pending",
              text: "Revisando un cobro que quedó pendiente…",
              tick: 0,
            },
      );
  }, []);
  useEffect(() => {
    if (!charge || charge.stage !== "pending" || !charge.orderId || !cloud)
      return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const order = await remoteMp().getOrder(charge.orderId!);
        if (!alive) return;
        const o = orderOutcome(order);
        if (o === "approved") return void finishCard(order);
        if (
          o === "canceled" ||
          o === "failed" ||
          o === "expired" ||
          o === "refunded"
        ) {
          b.setSetting("sellerCharge", null);
          return setCharge((c) =>
            c ? { ...c, stage: "failed", text: outcomeText(order) } : c,
          );
        }
        setCharge((c) =>
          c
            ? {
                ...c,
                text: outcomeText(order),
                tick: (c.tick || 0) + 1,
                fails: 0,
                atTerminal: order?.status === "at_terminal",
              }
            : c,
        );
      } catch (e) {
        if (alive)
          setCharge((c) =>
            c
              ? {
                  ...c,
                  text: "Sin respuesta; reintentando… " + errText(e),
                  tick: (c.tick || 0) + 1,
                  fails: (c.fails || 0) + 1,
                }
              : c,
          );
      }
    }, POLL_MS());
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [charge]);
  async function finishCard(order: any) {
    const c = chargeRef.current;
    if (!c || c.stage === "approved") return;
    const pay = orderPayment(order);
    let card = cardFromOrder(order);
    try {
      if (pay?.referenceId)
        card = mergeCard(
          card,
          cardFromPayment(await remoteMp().payment(pay.referenceId)),
        );
    } catch {}
    await completeCard(c, {
      orderId: c.orderId,
      paymentId: pay?.id || "",
      referenceId: pay?.referenceId || "",
      card,
    });
  }
  /** Pago aprobado (enviado a la terminal o cobrado a mano): registra la venta con ese cobro. */
  async function completeCard(c: Charge, mp: Row) {
    const card = mp.card;
    const sale: SellerSale = { ...c.draft, mp };
    b.setSetting("sellerCharge", null);
    // Los datos de la tarjeta (últimos 4, autorización) se quedan en este teléfono para reenviar el comprobante.
    const cards = Object.entries(
      b.setting("sellerCards", {}) as Record<string, Row>,
    ).slice(-99);
    b.setSetting(
      "sellerCards",
      Object.fromEntries([...cards, [sale.id, card]]),
    );
    const r = await recordSale(b, cloud, sale);
    setVersion((v) => v + 1);
    if (sameCart(c.draft)) clearCart();
    const why =
      r === "rejected"
        ? rejectedSales(b).find((x) => x.id === sale.id)?.error
        : "";
    setCharge({
      ...c,
      stage: "approved",
      sale,
      text:
        r === "rejected"
          ? `Pago aprobado, pero la venta no se registró: ${why}. Avísale al dueño (cobro ${c.orderId}).`
          : r === "queued"
            ? "Pago aprobado ✓ La venta se enviará al tener internet."
            : "Pago aprobado ✓ Venta registrada.",
    });
    void syncNow();
  }
  async function startCard(input: SellerSale) {
    const mine = ++attempt.current;
    // Al reintentar se usa la misma referencia: si el primer envío sí llegó, Mercado Pago no crea otro cobro.
    const reference =
      input.mp_ref ||
      "NOVA-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 8);
    const draft: SellerSale = { ...input, mp_ref: reference };
    setCharge({
      stage: "sending",
      text: "Enviando el cobro a la terminal…",
      amount: draft.total,
      draft,
    });
    try {
      const order = await remoteMp().createOrder({
        terminalId: "servidor",
        amount: draft.total,
        reference,
        description: "Venta Nova Negocio",
      });
      // Se canceló mientras se enviaba: el cobro se retira de la terminal y no se muestra.
      if (attempt.current !== mine)
        return void remoteMp()
          .cancelOrder(order.id)
          .catch(() => {});
      const next: Charge = {
        stage: "pending",
        text: outcomeText(order),
        orderId: order.id,
        amount: draft.total,
        draft,
        tick: 0,
      };
      b.setSetting("sellerCharge", next);
      setCharge(next);
    } catch (e) {
      if (attempt.current !== mine) return;
      // Terminal en modo normal: no recibe cobros de la app; se cobra en la terminal y se busca el pago.
      if (e instanceof MpError && e.code === "terminal_not_pdv")
        return goManual(draft);
      setCharge({
        stage: "error",
        text: errText(e),
        amount: draft.total,
        draft,
      });
    }
  }
  function goManual(draft: SellerSale, text = manualText(draft.total)) {
    const next: Charge = {
      stage: "manual",
      manual: true,
      since: new Date().toISOString(),
      amount: draft.total,
      draft,
      text,
    };
    b.setSetting("sellerCharge", next);
    setCharge(next);
  }
  /** «Ya cobré»: busca en Mercado Pago el pago de la terminal (unos segundos, por si aún no aparece). */
  async function findManual() {
    const c = chargeRef.current;
    if (!c?.manual || !cloud) return;
    setCharge({
      ...c,
      stage: "searching",
      text: "Buscando el pago en Mercado Pago…",
    });
    try {
      let found = { payments: [] as FoundPayment[], other: 0 };
      for (let i = 0; i < 4; i++) {
        found = await findTerminalPayments(
          cloud,
          c.amount,
          c.since || new Date().toISOString(),
        );
        if (found.payments.length) break;
        if (i < 3) await wait(POLL_MS());
      }
      if (chargeRef.current?.since !== c.since) return;
      if (found.payments.length === 1)
        return void claimManual(found.payments[0]);
      if (found.payments.length > 1)
        return setCharge({
          ...c,
          stage: "choose",
          found: found.payments,
          text: "Hay varios pagos por ese monto. Elige el de esta venta (revisa la hora y los últimos 4 dígitos de la tarjeta):",
        });
      setCharge({
        ...c,
        stage: "manual",
        text:
          `Todavía no aparece un pago aprobado de ${money(c.amount)} cobrado en la terminal. Revisa que la terminal diga «Aprobado» y vuelve a tocar «Ya cobré».` +
          (found.other
            ? ` Hay ${found.other === 1 ? "un pago" : `${found.other} pagos`} por ese monto que no ${found.other === 1 ? "viene" : "vienen"} de la terminal; avísale al dueño.`
            : ""),
      });
    } catch (e) {
      setCharge({ ...c, stage: "manual", text: errText(e) });
    }
  }
  async function claimManual(p: FoundPayment) {
    const c = chargeRef.current;
    if (!c?.manual || !cloud) return;
    setCharge({
      ...c,
      stage: "searching",
      text: "Ligando el pago a la venta…",
    });
    try {
      const r = await claimTerminalPayment(cloud, p.id, c.amount);
      const pay = r.payment || p;
      const card = {
        operation: pay.id,
        authorization: pay.authorization || undefined,
        last4: pay.last4 || undefined,
        brand: pay.brand || undefined,
        type: pay.type || undefined,
        installments: pay.installments || undefined,
        approvedAt: pay.date || undefined,
        amount: pay.amount,
      };
      await completeCard(
        { ...c, orderId: r.orderId },
        {
          orderId: r.orderId,
          paymentId: r.referenceId,
          referenceId: r.referenceId,
          card,
        },
      );
    } catch (e) {
      setCharge({ ...c, stage: "manual", text: errText(e) });
    }
  }
  /** La terminal no recibe el cobro (p. ej. aún no se reinicia tras cambiar de modo): se retira y se cobra a mano. */
  async function switchToManual() {
    const c = chargeRef.current;
    if (!c?.orderId) return;
    try {
      await remoteMp().cancelOrder(c.orderId);
      // Ese cobro ya no sirve: si después se vuelve a mandar a la terminal, va con referencia nueva.
      goManual({ ...c.draft, mp_ref: undefined });
    } catch (e) {
      setCharge({
        ...c,
        text:
          errText(e) + " Si la terminal ya muestra el cobro, termínalo ahí.",
        fails: (c.fails || 0) + 1,
      });
    }
  }
  async function cancelCard() {
    const c = chargeRef.current;
    if (c?.manual) {
      b.setSetting("sellerCharge", null);
      return setCharge({
        ...c,
        stage: "failed",
        text: "Cobro cancelado. No se registró la venta. Si ya cobraste en la terminal, avísale al dueño.",
      });
    }
    if (!c?.orderId) {
      attempt.current++;
      return setCharge(null);
    }
    try {
      await remoteMp().cancelOrder(c.orderId);
      b.setSetting("sellerCharge", null);
      setCharge({
        ...c,
        stage: "failed",
        text: "Cobro cancelado. No se registró la venta.",
      });
    } catch (e) {
      setCharge({ ...c, text: errText(e), fails: (c.fails || 0) + 1 });
    }
  }
  /** Sin respuesta de Mercado Pago: se cierra la ventana y el cobro queda para revisarlo después. */
  function reviewLater() {
    if (sameCart(chargeRef.current?.draft)) clearCart();
    setCharge(null);
  }

  // Teclado abierto: se oculta la barra "Ir a cobrar" para no tapar los campos.
  useEffect(() => {
    const show = Keyboard?.addListener?.("keyboardDidShow", () =>
      setKeyboard(true),
    );
    const hide = Keyboard?.addListener?.("keyboardDidHide", () =>
      setKeyboard(false),
    );
    return () => {
      show?.remove();
      hide?.remove();
    };
  }, []);
  // Botón atrás de Android: durante un cobro no hace nada; en otra pestaña regresa a Vender.
  useEffect(() => {
    const sub = BackHandler?.addEventListener?.("hardwareBackPress", () => {
      if (chargeRef.current) return true;
      if (resetPw) {
        setResetPw(false);
        return true;
      }
      if (tab === "Vender" && cartOpen) {
        setCartOpen(false);
        return true;
      }
      if (tab !== "Vender") {
        setTab("Vender");
        setError("");
        return true;
      }
      return false;
    });
    return () => sub?.remove();
  }, [tab, resetPw, cartOpen]);
  // Carrito vacío (venta registrada, vaciado o último producto quitado): regresa a los productos.
  useEffect(() => {
    if (!cart.length) setCartOpen(false);
  }, [cart.length]);

  // ---------- Venta ----------
  const products = useMemo(
    () => (cache?.catalog || []).filter((p) => !p.archived),
    [cache],
  );
  const limit = (productId: string) =>
    availableFor(productId, cache, pending, sent);
  // 2.0: el cliente absorbe la comisión que fija el dueño (4.06%) con cualquier forma de pago.
  // El vendedor ve solo precios al cliente, subtotal y total (nunca la comisión).
  const feeBps = ((v: number) =>
    Number.isSafeInteger(v) && v >= 0 && v <= MAX_FEE_BPS ? v : CARD_FEE_BPS)(
    Number(cache?.config?.fee?.bps ?? CARD_FEE_BPS),
  );
  const clientPrice = (price: number) => grossUp(price, feeBps);
  // 2.1: promociones que publica el dueño (mismo cálculo que el servidor; la mejor por producto).
  const promos: Promo[] = useMemo(() => {
    const list = cache?.config?.promos?.list;
    return Array.isArray(list) ? list : [];
  }, [cache]);
  const segmentOf = (p: Row) => String(p.segment || saleSegment(p));
  // Cuadrícula: se arma solo cuando cambia el catálogo, la comisión o las promociones (no en cada toque).
  const gridProducts = useMemo(() => {
    const day = storeDay();
    return products.map((p) => ({
      id: p.product_id,
      name: p.name,
      price: grossUp(p.price, feeBps),
      category: p.category,
      sku: p.sku,
      brand: p.brand,
      barcode: p.barcode || "",
      barcodeAliases: p.scan_data?.barcodeAliases || [],
      presentation: p.scan_data?.presentation || "",
      flavor: p.scan_data?.flavor || "",
      presentationUnconfirmed: p.scan_data?.presentationUnconfirmed === true,
      imageUri: p.scan_data?.imageUri || "",
      lookupSource: p.scan_data?.lookupSource || "",
      lookupSourceUrl: p.scan_data?.lookupSourceUrl || "",
      imageKey: p.image_key,
      tag: promos.length
        ? promoTagFor(promos, p.product_id, segmentOf(p), day)
        : "",
    }));
  }, [products, feeBps, promos]);
  const cartLines = cart.map((i) => {
    const p = products.find((x) => x.product_id === i.productId);
    return {
      productId: i.productId,
      qty: i.qty,
      price: p?.price || 0,
      segment: p ? segmentOf(p) : "",
    };
  });
  const promo = promos.length
    ? promoDiscounts(
        cartLines,
        promos.filter((x) => promoLive(x, storeDay())),
        storeDay(),
      )
    : { hits: [], total: 0 };
  const listTotal = cartLines.reduce((n, l) => n + l.qty * l.price, 0);
  const charge0 = chargeFor(
    cartLines,
    feeBps,
    promo.total > 0 ? Math.max(0, listTotal - promo.total) : null,
  );
  const total = charge0.total;
  const allowed = allowedMethods(cache);
  // Si el dueño cambia las formas de pago (o apaga la terminal), se ajusta la elegida.
  // Sin venta en curso vuelve a la de por omisión (tarjeta en la terminal).
  useEffect(() => {
    if (!allowed.length) return;
    if (!cart.length || !allowed.includes(method)) setMethod(allowed[0]);
  }, [allowed.join(",")]);
  // Un producto que el dueño archivó (o ya no se publica) sale de la venta actual.
  useEffect(() => {
    if (!cache) return;
    const gone = cart.filter(
      (i) => !products.some((p) => p.product_id === i.productId),
    );
    if (!gone.length) return;
    setCart((old) =>
      old.filter((i) => products.some((p) => p.product_id === i.productId)),
    );
    setError(
      `${gone.length === 1 ? "Un producto ya no está disponible y se quitó" : `${gone.length} productos ya no están disponibles y se quitaron`} de la venta.`,
    );
  }, [cache]);
  const pendingCharge: Charge | null = !charge
    ? b.setting("sellerCharge", null)
    : null;
  function add(productId: string, delta = 1) {
    const current = cart.find((i) => i.productId === productId)?.qty ?? 0;
    const max = limit(productId);
    const name =
      products.find((p) => p.product_id === productId)?.name || "Este producto";
    if (delta > 0 && current + delta > max)
      return setError(
        max
          ? `Solo hay ${max} ${max === 1 ? "unidad disponible" : "unidades disponibles"} de ${name}.`
          : `${name} no tiene existencias disponibles.`,
      );
    setError("");
    const next = current + delta;
    setCart((old) =>
      next <= 0
        ? old.filter((i) => i.productId !== productId)
        : old.some((i) => i.productId === productId)
          ? old.map((i) =>
              i.productId === productId ? { ...i, qty: next } : i,
            )
          : [...old, { productId, qty: next }],
    );
  }
  function clearCart() {
    setCart([]);
    setCustomer(null);
    setNewCustomer(null);
    setTransferId("");
    setError("");
    setGridQuery("");
    setMethod(defaultMethod(cachedData(b)) || "Tarjeta");
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }
  /** El carrito actual es el mismo de ese cobro (no se borra una venta nueva que ya se está armando). */
  const sameCart = (d: SellerSale | undefined) =>
    !!d &&
    JSON.stringify(cartRef.current.map((i) => [i.productId, i.qty]).sort()) ===
      JSON.stringify(d.items.map((i) => [i.productId, i.qty]).sort());
  async function checkout() {
    if (busy || !cart.length) return;
    setError("");
    const transferList = myTransferAccounts(cache);
    const transferPick =
      method === "Transferencia"
        ? transferList.length === 1
          ? transferList[0].id
          : transferList.some((t) => t.id === transferId)
            ? transferId
            : ""
        : "";
    if (method === "Transferencia" && transferList.length > 1 && !transferPick)
      return setError("Elige a qué cuenta te transfirió el cliente.");
    if (!allowed.includes(method))
      return setError(
        allowed.length
          ? "Elige una forma de pago."
          : "No tienes formas de pago habilitadas. Pídele al dueño que las active en Equipo y vendedores.",
      );
    if (method === "Tarjeta" && openCharge(b.setting("sellerCharge", null)))
      return setError(
        "Hay un cobro con tarjeta sin confirmar. Revísalo arriba (Revisar cobro) antes de cobrar otro.",
      );
    for (const i of cart)
      if (i.qty > limit(i.productId))
        return setError("Las existencias cambiaron: revisa las cantidades.");
    let cust: Row | null = customer;
    let isNew = false;
    if (newCustomer) {
      if (!newCustomer.name.trim())
        return setError("Escribe el nombre del cliente nuevo.");
      if (newCustomer.phone && !validWhatsapp(newCustomer.phone))
        return setError("El teléfono del cliente debe tener 10 dígitos.");
      // El servidor lo da de alta junto con la venta.
      cust = {
        id: newId("c"),
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
      };
      isNew = true;
    }
    const items = cart.map((i) => {
      const p = products.find((x) => x.product_id === i.productId)!;
      return {
        productId: i.productId,
        name: p.name,
        qty: i.qty,
        price: p.price,
      };
    });
    // Con internet: el servidor confirma precios y existencias ANTES de cobrar.
    if (cloud?.session) {
      setBusy(true);
      try {
        const r = await checkSale(cloud, items);
        if (r.error) throw new CloudError(r.error, 400, "P0001");
        const serverTotal = r.total;
        // Servidor sin actualizar a 2.0 (otra regla de comisión): no se cobra, no cuadraría.
        if (r.pricing !== "grossup") {
          setBusy(false);
          return setError(
            "El servidor aún no tiene la comisión 2.0. Pídele al dueño que actualice la base en línea (schema 2.0) y vuelve a intentar.",
          );
        }
        // Servidor sin promociones (schema anterior a 2.1): no cuadraría el total con descuento.
        if (promo.total > 0 && r.promo === null) {
          setBusy(false);
          return setError(
            "El servidor aún no tiene las promociones. Pídele al dueño que actualice la base en línea (schema 2.1) y vuelve a intentar.",
          );
        }
        if (!r.ok || serverTotal !== total) {
          void syncNow();
          setBusy(false);
          if (r.short.length)
            return setError(
              `Ya no alcanza: ${r.short.map((x) => `${x.name} (quedan ${x.available})`).join(", ")}. Ajusta la venta.`,
            );
          return setError(
            `El total cambió: ahora es ${money(serverTotal)}. Revisa la venta y vuelve a intentar.`,
          );
        }
      } catch (e) {
        const offline =
          e instanceof CloudError && (e.code === "network" || e.status === 0);
        if (!offline || method === "Tarjeta") {
          setBusy(false);
          return setError(
            offline
              ? "Para cobrar con tarjeta necesitas internet."
              : errText(e),
          );
        }
      }
      setBusy(false);
    } else if (method === "Tarjeta")
      return setError("Para cobrar con tarjeta necesitas internet.");
    const draft: SellerSale = {
      id: newId("v"),
      seller_name: sessionName || "Vendedor",
      created_at: new Date().toISOString(),
      items,
      total,
      fee_bps: feeBps,
      ...(promo.total > 0
        ? {
            promo: promo.total,
            promo_names: promoSummary(promo.hits).map((x) => x.name),
          }
        : {}),
      method,
      customer_id: cust?.id || null,
      customer_name: cust?.name || "",
      customer_phone: isNew ? cust?.phone || "" : "",
      note: "",
      mp: null,
      ...(isNew ? { new_customer: true } : {}),
      ...(transferPick ? { transfer_id: transferPick } : {}),
    };
    if (isNew) {
      const hint = cust!.phone.replace(/\D/g, "").slice(-4);
      setCache((c) => {
        if (!c) return c;
        const next = {
          ...c,
          customers: [
            ...c.customers,
            {
              id: cust!.id,
              name: cust!.name,
              phone_hint: hint ? `•••${hint}` : "",
            },
          ],
        };
        b.setSetting("sellerCache", next);
        return next;
      });
    }
    if (method === "Tarjeta") return void startCard(draft);
    setBusy(true);
    try {
      const r = await recordSale(b, cloud, draft);
      setVersion((v) => v + 1);
      clearCart();
      if (r === "rejected")
        setError(
          `La venta no se registró: ${rejectedSales(b).find((x) => x.id === draft.id)?.error || "revisa con el dueño"}.`,
        );
      else
        notify(
          r === "sent"
            ? `Venta registrada · ${money(draft.total)}`
            : "Venta guardada; se enviará al tener internet",
        );
      void syncNow();
    } finally {
      setBusy(false);
    }
  }
  const sendReceiptFor = async (sale: SellerSale) => {
    const v = receiptSale(sale);
    const card =
      sale.mp?.card ||
      (b.setting("sellerCards", {}) as Record<string, Row>)[sale.id];
    const text = sale.mp?.orderId
      ? cardReceiptText(v, {
          orderId: sale.mp.orderId,
          kind: "venta",
          amount: sale.total,
          card,
          at: sale.created_at,
        })
      : saleReceiptText(v);
    let raw = sale.customer_phone || "";
    // Cliente ya existente: el teléfono completo solo lo da el servidor para ESTA venta.
    if (
      !raw &&
      sale.customer_id &&
      cloud?.session &&
      !queue(b).some((q) => q.id === sale.id)
    )
      try {
        raw = await receiptPhone(cloud, sale.id);
      } catch {}
    const phone = whatsappNumber(raw);
    if (phone)
      void Linking.openURL(
        `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
      ).catch(() => {});
    else setReceipt({ text, phone: "" });
  };

  // ---------- Cierre de caja ----------
  async function loadCaja() {
    setClosingMsg("");
    if (!cloud?.session) return;
    try {
      const [p, list] = await Promise.all([
        closingPreview(cloud),
        myClosings(b, cloud),
      ]);
      setPreview(p);
      setClosings(list);
    } catch (e) {
      setPreview(null);
      setClosingMsg(
        e instanceof CloudError && (e.code === "network" || e.status === 0)
          ? "Sin internet: el cierre de caja necesita conexión. Abajo están tus cierres anteriores."
          : errText(e),
      );
    }
  }
  useEffect(() => {
    if (tab === "Caja") void loadCaja();
    setConfirmClose(false);
  }, [tab]);
  async function doClose() {
    if (!cloud || busy) return;
    setBusy(true);
    setClosingMsg("");
    try {
      const c = await closeRegister(b, cloud);
      setClosings((old) => [c, ...old.filter((x) => x.id !== c.id)]);
      setOpenClosing(c.id);
      setConfirmClose(false);
      notify(`Caja cerrada · ${money(c.total)}`);
      await loadCaja();
      setOpenClosing(c.id);
    } catch (e) {
      setClosingMsg(errText(e));
    } finally {
      setBusy(false);
    }
  }

  // ---------- Conexión ----------
  /**
   * Alta del vendedor: SOLO con su código (GNS-XXXX-XXXX), que el servidor valida
   * y marca como usado. La cuenta queda ligada a este teléfono. "Entrar" es para
   * quien ya tiene cuenta en ESTE teléfono (o con cambio autorizado por el dueño).
   */
  /**
   * Cuenta nueva: SOLO con el código de invitación (GNS-XXXX-XXXX), que el
   * servidor valida y marca como usado. Ya tengo cuenta: correo y contraseña;
   * este teléfono queda como el de la cuenta y el anterior se desconecta.
   */
  async function connect(mode: "signup" | "signin") {
    setError("");
    const code = normalizeShortCode(form.invite || "");
    if (mode === "signup" && !code)
      return setError(
        "Escribe los 8 caracteres del código de invitación que te dio el dueño.",
      );
    if (mode === "signup" && !form.name?.trim())
      return setError("Escribe tu nombre (así aparecerán tus ventas).");
    if (!form.email?.trim() || !(form.password || "").trim())
      return setError("Escribe tu correo y tu contraseña.");
    if (mode === "signup" && (form.password || "").length < 8)
      return setError("La contraseña debe tener al menos 8 caracteres.");
    const conf: CloudConfig = b.setting("cloudConfig", null) || storeCloud();
    setBusy(true);
    try {
      if (mode === "signup") {
        const r = await publicInvoke(conf, "cobro-terminal", {
          action: "alta",
          code,
          name: form.name.trim(),
          email: form.email,
          password: form.password,
          device,
        });
        if (!r.ok)
          throw new Error(
            r.data?.message || `No se pudo crear la cuenta (${r.status}).`,
          );
      }
      const st = await loginHere(b, form.email, form.password, conf);
      if (st === "owner") {
        setForm({});
        if (onOwner) return onOwner();
        b.setSetting("cloudSession", null);
        return setError("Esa es la cuenta del dueño.");
      }
      if (mode === "signup" && form.name?.trim())
        b.setSetting("sellerName", form.name.trim());
      setForm({});
      setCfg(conf);
      setPhase(st === "pending" ? "pending" : "ready");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  function signOut() {
    const n = queue(b).length;
    const go = async () => {
      try {
        await detachPush(b, cloud);
      } catch (e) {
        setError(errText(e));
        return;
      }
      cloud?.signOut();
      b.setSetting("cloudSession", null);
      b.setSetting("sellerCache", null);
      // Lo de esta cuenta no se le queda al siguiente vendedor que entre en el teléfono.
      for (const k of [
        "sellerToday",
        "sellerClosings",
        "sellerRejected",
        "sellerSent",
        "sellerCards",
      ])
        b.setSetting(k, null);
      setCache(null);
      setToday([]);
      clearCart();
      setTab("Vender");
      setPhase("connect");
    };
    if (n)
      setError(
        `Tienes ${n} ${n === 1 ? "venta sin enviar" : "ventas sin enviar"}. Conéctate a internet y toca Actualizar antes de cerrar sesión.`,
      );
    else if (openCharge(b.setting("sellerCharge", null)))
      setError(
        "Hay un cobro con tarjeta sin confirmar. Revísalo en Vender antes de cerrar sesión.",
      );
    else void go();
  }

  // ---------- Pantallas ----------
  const logo = (
    <Image
      source={LOGO_HEADER}
      accessibilityLabel="GGG · Nova Supps"
      resizeMode="contain"
      style={{ height: 40, width: 40 * LOGO_HEADER_RATIO, maxWidth: "100%" }}
    />
  );
  const offline =
    online === false ? (
      <View
        accessible
        accessibilityLabel="Sin internet"
        style={[s.iconBtn, { backgroundColor: C.amberSoft }]}
      >
        <Icon name="wifi-off" size={18} color={C.amber} />
      </View>
    ) : null;
  const openAccount = () => {
    if (tab !== "Cuenta") fromTab.current = tab;
    setTab("Cuenta");
    setCartOpen(false);
    setError("");
  };
  // Inicio de sesión y pantallas sin pestañas: solo el logo.
  const header = <AppHeader title="" center={logo} right={offline} />;
  const mainHeader =
    tab === "Cuenta" ? (
      <AppHeader
        title="Cuenta"
        back={{ label: fromTab.current, onPress: () => setTab(fromTab.current) }}
        right={offline}
      />
    ) : (
      <AppHeader
        title={tab}
        large
        center={tab === "Vender" ? logo : undefined}
        leftAction={offline}
        right={
          <>
            {tab !== "Vender" && offline}
            <IconButton icon="circle-user" label="Cuenta" onPress={openAccount} />
          </>
        }
      />
    );
  const input = (
    key: string,
    label: string,
    opts: {
      secure?: boolean;
      placeholder?: string;
      multiline?: boolean;
      kind?: any;
    } = {},
  ) => (
    <View style={s.field} key={key}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[s.input, opts.multiline && { minHeight: 70 }]}
        value={form[key] || ""}
        onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
        secureTextEntry={opts.secure}
        placeholder={opts.placeholder}
        placeholderTextColor={C.muted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={opts.multiline}
        keyboardType={opts.kind}
      />
    </View>
  );
  const errorBox = !!error && (
    <View style={s.errorBox}>
      <Text style={[s.body, { color: C.red }]}>{error}</Text>
    </View>
  );

  if (phase === "connect" && resetPw)
    return (
      <PasswordReset
        conf={b.setting("cloudConfig", null) || storeCloud()}
        initialEmail={form.email || ""}
        onBack={() => setResetPw(false)}
        onDone={(email) => {
          setResetPw(false);
          setForm({ email });
          setError("");
          notify("Contraseña cambiada. Entra con tu contraseña nueva.");
        }}
      />
    );
  if (phase === "connect")
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        {header}
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          {!!toast && <Note color={C.green}>{`✓ ${toast}`}</Note>}
          {errorBox}
          <Text style={s.title}>Ya tengo cuenta</Text>
          <Note>Entra solo con tu correo y tu contraseña.</Note>
          <View style={{ height: 8 }} />
          {input("email", "Tu correo *", {
            placeholder: "tucorreo@gmail.com",
            kind: "email-address",
          })}
          {input("password", "Contraseña *", { secure: true })}
          <Button
            title={busy ? "Entrando…" : "Entrar"}
            disabled={busy}
            onPress={() => void connect("signin")}
          />
          <Button
            title="¿Olvidaste tu contraseña?"
            secondary
            small
            disabled={busy}
            onPress={() => (setError(""), setResetPw(true))}
          />
          <View style={{ height: 18 }} />
          <Card>
            <Text style={s.subtitle}>Soy vendedor nuevo</Text>
            <Note>Escribe a mano los 8 caracteres del código que te dio el dueño (después de GNS-), tu nombre, tu correo y una contraseña de 8 o más.</Note>
            <CodeInput
              prefix="GNS"
              label="Código de invitación (solo para cuenta nueva)"
              value={form.invite || ""}
              onChange={(v) => setForm((f) => ({ ...f, invite: v }))}
            />
            {input("name", "Tu nombre *", { placeholder: "Luis" })}
            <Button
              title={busy ? "Creando…" : "Crear mi cuenta"}
              secondary
              disabled={busy}
              onPress={() => void connect("signup")}
            />
          </Card>
          <View style={{ height: 16 }} />
          <Button title="Volver al inicio" secondary small onPress={onReset} />
        </ScrollView>
      </SafeAreaView>
    );
  if (phase === "pending")
    return (
      <SafeAreaView style={s.safe}>
        {header}
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={s.content}
        >
          <Text style={s.title}>Acceso en pausa</Text>
          <Note>
            Tu cuenta existe, pero el dueño aún no la activa o la pausó. Pídele
            que te active en Ajustes → Vendedores y toca Revisar de nuevo.
          </Note>
          <View style={{ height: 12 }} />
          {errorBox}
          <Button
            title="Revisar de nuevo"
            onPress={() => void syncNow(false)}
          />
          <Button title="Cerrar sesión" secondary small onPress={signOut} />
        </ScrollView>
      </SafeAreaView>
    );

  const visible = products.filter((p) =>
    `${p.name} ${p.sku} ${p.brand}`.toLowerCase().includes(query.toLowerCase()),
  );
  const productCard = (p: Row) => {
    const max = limit(p.product_id);
    return (
      <Card key={p.product_id}>
        <View style={s.productRow}>
          <ProductPhoto
            product={{ ...p, id: p.product_id, imageKey: p.image_key }}
            style={s.productImage}
          />
          <View style={{ flex: 1 }}>
            <Text style={s.subtitle} numberOfLines={2}>
              {p.name}
            </Text>
            <Text style={s.price}>{money(clientPrice(p.price))}</Text>
            <Pill
              text={`${max} ${max === 1 ? "disponible" : "disponibles"}`}
              tone={max < 1 ? "bad" : max <= 2 ? "warn" : "ok"}
            />
          </View>
        </View>
      </Card>
    );
  };
  const customers = cache?.customers || [];
  const chosen = customer;
  const cartBox = !!cart.length && (
    <>
      <View style={[s.between, { marginBottom: 6, paddingHorizontal: 4 }]}>
        <Text
          style={[s.subtitle, { marginBottom: 0 }]}
        >{`Carrito · ${cart.reduce((n, i) => n + i.qty, 0)} ${cart.reduce((n, i) => n + i.qty, 0) === 1 ? "pieza" : "piezas"}`}</Text>
        <TextButton title="Vaciar carrito" color={C.red} onPress={clearCart} />
      </View>
      <View style={[s.list, { paddingHorizontal: 16 }]}>
        {cart.map((i, idx) => {
          const p = products.find((x) => x.product_id === i.productId);
          const max = limit(i.productId);
          return (
            <View
              key={i.productId}
              style={[s.cartRow, idx === cart.length - 1 && { borderBottomWidth: 0 }]}
            >
              {!!p && (
                <ProductPhoto
                  product={{ ...p, id: p.product_id, imageKey: p.image_key }}
                  style={{ width: 48, height: 58 }}
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[s.body, { fontWeight: "500" }]} numberOfLines={2}>
                  {p?.name}
                </Text>
                <Note>{`${i.qty} × ${money(clientPrice(p?.price || 0))}${i.qty >= max ? ` · máximo (${max})` : ""}`}</Note>
              </View>
              <Stepper
                qty={i.qty}
                plusDisabled={i.qty >= max}
                onMinus={() => add(i.productId, -1)}
                onPlus={() => add(i.productId, 1)}
              />
            </View>
          );
        })}
      </View>
      <Text style={s.section}>Cliente</Text>
      {newCustomer ? (
        <Card>
          <TextInput
            accessibilityLabel="Nombre del cliente nuevo"
            style={[s.input, { marginBottom: 8 }]}
            value={newCustomer.name}
            onChangeText={(v) => setNewCustomer({ ...newCustomer, name: v })}
            placeholder="Nombre"
            placeholderTextColor={C.muted}
          />
          <TextInput
            accessibilityLabel="WhatsApp del cliente nuevo"
            style={[s.input, { marginBottom: 8 }]}
            value={newCustomer.phone}
            onChangeText={(v) => setNewCustomer({ ...newCustomer, phone: v })}
            placeholder="WhatsApp (10 dígitos, opcional)"
            placeholderTextColor={C.muted}
            keyboardType="phone-pad"
          />
          <TextButton title="Quitar cliente nuevo" color={C.red} onPress={() => setNewCustomer(null)} />
        </Card>
      ) : (
        <MenuList
          items={[
            {
              key: "pick",
              title: chosen ? `${chosen.name}` : "Elegir cliente (opcional)",
              icon: "user",
              tint: chosen ? TILE.red : TILE.graphite,
              onPress: () => (setPickQuery(""), setPickResults(null), setPicker(true)),
            },
            {
              key: "new",
              title: "＋ Cliente nuevo",
              icon: "user-plus",
              tint: TILE.graphite,
              onPress: () => (setCustomer(null), setNewCustomer({ name: "", phone: "" })),
            },
          ]}
        />
      )}
      <Text style={s.section}>Forma de pago</Text>
      <PayOptions
        options={allowed.map((m) => ({
          id: m,
          name: m === "Tarjeta" ? "Tarjeta (terminal)" : m,
          kind: m,
        }))}
        value={method}
        onChange={(v) => setMethod(v as any)}
      />
      {method === "Transferencia" && myTransferAccounts(cache).length > 1 && (
        <>
          <Text style={[s.label, { marginTop: 12 }]}>¿A qué cuenta te transfirió?</Text>
          <Chips
            options={myTransferAccounts(cache).map((t) => ({
              id: t.id,
              name: t.label,
            }))}
            value={transferId}
            onChange={setTransferId}
          />
        </>
      )}
      {method === "Transferencia" && (
        <TransferInfo
          list={
            ((all: Row[]) =>
              all.some((t) => t.id === transferId)
                ? all.filter((t) => t.id === transferId)
                : all)(myTransferAccounts(cache)) as any
          }
          amount={total}
          phone={newCustomer?.phone || ""}
          concept={sessionName ? `Venta ${sessionName}` : ""}
          emptyText="El dueño aún no te asignó datos para transferencia. Pídeselos antes de cobrar así."
        />
      )}
      <View style={[s.card, { marginTop: 14 }]}>
        <View style={s.between}>
          <Text style={[s.body, { color: C.muted }]}>Subtotal</Text>
          <Text style={[s.body, { fontVariant: ["tabular-nums"] }]}>{money(charge0.subtotal)}</Text>
        </View>
        {charge0.discount > 0 && (
          <View style={s.between}>
            <Text style={[s.body, { flex: 1, color: C.muted }]}>
              {promo.hits.length
                ? `Descuento · ${promoSummary(promo.hits)
                    .map((x) => x.name)
                    .join(", ")}`
                : "Descuento"}
            </Text>
            <Text style={[s.body, { color: C.red }]}>
              {"−" + money(charge0.discount)}
            </Text>
          </View>
        )}
        <View style={[s.between, { marginTop: 6 }]}>
          <Text style={[s.body, { fontWeight: "600" }]}>Total</Text>
          <Text style={{ fontSize: 30, fontWeight: "700", color: C.ink, fontVariant: ["tabular-nums"] }}>
            {money(total)}
          </Text>
        </View>
        <Note>Mismo precio con cualquier forma de pago. Descuentos o crédito: pídeselos al dueño.</Note>
      </View>
      {errorBox}
      <Button
        icon={busy ? undefined : method === "Tarjeta" ? "credit-card" : "check"}
        title={
          busy
            ? "Guardando…"
            : method === "Tarjeta"
              ? `Cobrar ${money(total)} en la terminal`
              : "Registrar venta"
        }
        disabled={busy}
        onPress={() => void checkout()}
      />
    </>
  );

  let body: React.ReactNode = null;
  let list: Row[] | null = null;
  if (tab === "Vender") {
    const pendingCard = openCharge(pendingCharge) && (
      <Card tone="warn">
        <Text
          style={s.subtitle}
        >{`Cobro con tarjeta sin confirmar · ${money(pendingCharge!.amount)}`}</Text>
        <Note>Revísalo antes de volver a cobrar la misma venta.</Note>
        <Button
          title="Revisar cobro"
          small
          onPress={() =>
            setCharge(
              pendingCharge!.manual
                ? {
                    ...pendingCharge!,
                    stage: "manual",
                    text: manualText(pendingCharge!.amount),
                  }
                : {
                    ...pendingCharge!,
                    stage: "pending",
                    fails: 0,
                    text: "Revisando el cobro…",
                  },
            )
          }
        />
      </Card>
    );
    body =
      cartOpen && cart.length ? (
        // Pantalla del carrito: solo lo elegido, cliente, forma de pago y cobro (sin la cuadrícula).
        <>
          {pendingCard}
          <Button
            icon="chevron-left"
            title="Agregar más productos"
            secondary
            small
            onPress={() => (setCartOpen(false), setError(""))}
          />
          <View style={{ height: 6 }} />
          {cartBox}
        </>
      ) : (
        // Pantalla de productos: categorías con fotos; el carrito se abre con la barra de abajo.
        <>
          {pendingCard}
          {!allowed.length && (
            <Note color={C.red}>
              No tienes formas de pago habilitadas. Pídele al dueño que las
              active.
            </Note>
          )}
          {products.length ? (
            <ProductGrid
              products={gridProducts}
              lookupStore={b}
              qtyOf={(id) => cart.find((i) => i.productId === id)?.qty ?? 0}
              limitOf={limit}
              onAdd={(id) => add(id)}
              onRemove={(id) => add(id, -1)}
              segment={seg}
              onSegment={setSeg}
              query={gridQuery}
              onQuery={setGridQuery}
            />
          ) : (
            <Note>
              {cache
                ? "El dueño aún no publica productos."
                : "Toca Cuenta → Actualizar para descargar el catálogo."}
            </Note>
          )}
          {!!products.length && !cart.length && (
            <View style={{ marginTop: 8 }}>
              <Note>Toca la foto de un producto para agregarlo al carrito.</Note>
            </View>
          )}
        </>
      );
  } else if (tab === "Stock") list = visible;
  else if (tab === "Mis ventas") {
    const day = new Date().toDateString();
    const bad = rejected.filter(
      (r) =>
        new Date(r.created_at).toDateString() === day &&
        !today.some((t) => t.id === r.id),
    );
    const all = [
      ...pending
        .filter((q) => !today.some((t) => t.id === q.id))
        .map((q) => ({ ...q, queued: true })),
      ...bad,
      ...today,
    ];
    const sum = all
      .filter((x: Row) => x.status !== "rechazada")
      .reduce((n, x) => n + x.total, 0);
    body = (
      <>
        <Card>
          <Text style={s.subtitle}>Tus ventas de hoy</Text>
          <Text style={s.price}>{money(sum)}</Text>
          <Note>{`${all.length} ${all.length === 1 ? "venta" : "ventas"}${pending.length ? ` · ${pending.length} sin enviar` : ""}`}</Note>
        </Card>
        {all.map((v: Row) => (
          <Card key={v.id}>
            <View style={s.between}>
              <Text
                style={[s.subtitle, { flex: 1 }]}
              >{`${folioForRemote(v.id)} · ${money(v.total)}`}</Text>
              <Pill
                text={statusText(v as SellerSale, !!v.queued)}
                tone={
                  v.queued
                    ? "warn"
                    : v.status === "aplicada"
                      ? "ok"
                      : v.status === "pendiente"
                        ? "neutral"
                        : "bad"
                }
              />
            </View>
            <Note>{`${new Date(v.created_at).toTimeString().slice(0, 5)} · ${v.method}${v.customer_name ? ` · ${v.customer_name}` : ""}`}</Note>
            {(v.items as Row[]).map((i, k) => (
              <Text key={k} style={s.body}>{`${i.qty} × ${i.name}`}</Text>
            ))}
            {v.status === "conflicto" && (
              <Note
                color={C.red}
              >{`El dueño la está revisando: ${v.error || ""}`}</Note>
            )}
            {v.status === "rechazada" && (
              <Note
                color={C.red}
              >{`No se registró${v.error ? `: ${v.error}` : ""}.${v.mp?.orderId ? ` Avísale al dueño (cobro ${v.mp.orderId}).` : " Avísale al dueño."}`}</Note>
            )}
            {v.status !== "rechazada" && (
              <Button
                icon="send" title="Enviar comprobante"
                secondary
                small
                onPress={() => void sendReceiptFor(v as SellerSale)}
              />
            )}
          </Card>
        ))}
        {!all.length && <Note>Aún no registras ventas hoy.</Note>}
      </>
    );
  } else if (tab === "Caja") {
    const summary = (x: ClosingSummary) => (
      <>
        <View style={s.between}>
          <Text style={s.body}>Ventas</Text>
          <Text style={[s.body, { fontWeight: "700" }]}>
            {String(x.sales_count)}
          </Text>
        </View>
        <View style={s.between}>
          <Text style={s.body}>Unidades vendidas</Text>
          <Text style={[s.body, { fontWeight: "700" }]}>{String(x.units)}</Text>
        </View>
        {Object.entries(x.by_method || {}).map(([m, v]) => (
          <View key={m} style={s.between}>
            <Text style={s.body}>
              {m === "Tarjeta" ? "Tarjeta (terminal)" : m}
            </Text>
            <Text style={s.body}>{money(Number(v) || 0)}</Text>
          </View>
        ))}
        <View style={[s.between, { marginTop: 6 }]}>
          <Text style={s.subtitle}>Total vendido</Text>
          <Text style={s.price}>{money(x.total)}</Text>
        </View>
        {x.review_count > 0 && (
          <Note
            color={C.amber}
          >{`${x.review_count} ${x.review_count === 1 ? "venta está" : "ventas están"} en revisión del dueño.`}</Note>
        )}
      </>
    );
    const itemsList = (x: ClosingSummary) =>
      (x.items || []).map((i) => (
        <View key={i.productId} style={s.cartRow}>
          <Text style={[s.body, { flex: 1 }]} numberOfLines={2}>
            {i.name || i.productId}
          </Text>
          <Text
            style={[s.body, { minWidth: 44, textAlign: "right" }]}
          >{`${i.qty} u.`}</Text>
        </View>
      ));
    body = (
      <>
        <Card>
          <Text style={s.subtitle}>Caja abierta · desde tu último cierre</Text>
          {preview ? (
            <>
              {summary(preview)}
              {!!preview.items?.length && (
                <>
                  <View style={{ height: 8 }} />
                  <Text style={s.label}>Lo que se vendió</Text>
                  {itemsList(preview)}
                </>
              )}
            </>
          ) : closingMsg ? null : (
            <Note>
              {cloud?.session ? "Cargando…" : "Conéctate para ver tu caja."}
            </Note>
          )}
          {!!pending.length && (
            <Note
              color={C.red}
            >{`Tienes ${pending.length} ${pending.length === 1 ? "venta sin enviar" : "ventas sin enviar"}: conéctate y toca Actualizar antes de cerrar.`}</Note>
          )}
          {!!closingMsg && <Note color={C.red}>{closingMsg}</Note>}
          {!confirmClose ? (
            <Button
              icon="calculator" title="Cerrar caja"
              disabled={
                busy || !preview || !preview.sales_count || !!pending.length
              }
              onPress={() => setConfirmClose(true)}
            />
          ) : (
            <>
              <Note color={C.red}>
                El cierre queda guardado tal cual y no se puede cambiar ni
                borrar. El dueño lo verá en su teléfono.
              </Note>
              <Button
                title={busy ? "Cerrando…" : "Sí, cerrar caja"}
                danger
                disabled={busy}
                onPress={() => void doClose()}
              />
              <Button
                title="Cancelar"
                secondary
                small
                onPress={() => setConfirmClose(false)}
              />
            </>
          )}
          <Button
            icon="refresh-cw" title="Actualizar"
            secondary
            small
            disabled={busy}
            onPress={() =>
              void (async () => (await syncNow(), await loadCaja()))()
            }
          />
        </Card>
        <Text style={s.section}>Cierres anteriores</Text>
        {!closings.length && <Note>Aún no has cerrado caja.</Note>}
        {closings.map((c) => (
          <Card key={c.id}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpenClosing(openClosing === c.id ? "" : c.id)}
            >
              <View style={s.between}>
                <Text
                  style={[s.subtitle, { flex: 1 }]}
                >{`Cierre del ${new Date(c.created_at).toLocaleDateString("es-MX")} · ${new Date(c.created_at).toTimeString().slice(0, 5)}`}</Text>
                <Text style={s.price}>{money(c.total)}</Text>
              </View>
              <Note>{`${c.sales_count} ${c.sales_count === 1 ? "venta" : "ventas"} · ${c.units} ${c.units === 1 ? "unidad" : "unidades"} · ${openClosing === c.id ? "ocultar detalle" : "ver detalle"}`}</Note>
            </Pressable>
            {openClosing === c.id && (
              <>
                {summary(c)}
                <View style={{ height: 8 }} />
                <Text style={s.label}>Lo que se vendió</Text>
                {itemsList(c)}
                <Note>
                  Cierre guardado en el servidor; no se puede modificar.
                </Note>
              </>
            )}
          </Card>
        ))}
      </>
    );
  } else {
    body = (
      <>
        <Card>
          <Text style={s.subtitle}>{sessionName || "Vendedor"}</Text>
          <Note>{`Correo: ${b.setting("cloudSession", null)?.user?.email || "—"}`}</Note>
          <Note>{`Catálogo actualizado: ${cache?.at ? new Date(cache.at).toLocaleString("es-MX") : "nunca"}`}</Note>
          <Note>{`Ventas sin enviar: ${pending.length}`}</Note>
          <Button
            icon="refresh-cw" title="Actualizar ahora"
            onPress={() => void syncNow(false)}
          />
        </Card>
        <PushCard
          b={b}
          cloud={cloud}
          seller
          revision={version}
          onChanged={() => setVersion((v) => v + 1)}
        />
        <Note>Vende, revisa existencias y tus ventas del día. Sin internet, tus ventas se guardan y se envían solas.</Note>
        <View style={{ height: 10 }} />
        <Button title="Cerrar sesión" secondary small onPress={signOut} />
      </>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <UpdateNotice
        b={b}
        canRestart={() =>
          !busy &&
          !chargeRef.current &&
          !openCharge(b.setting("sellerCharge", null)) &&
          !cartRef.current.length &&
          !picker &&
          !receipt
        }
      />
      {mainHeader}
      <View style={{ flex: 1 }}>
        {list ? (
          <FlatList
            automaticallyAdjustKeyboardInsets
            key={tab}
            data={list}
            keyExtractor={(r: Row) => r.product_id}
            renderItem={({ item }: { item: Row }) => productCard(item)}
            ListHeaderComponent={
              <>
                {errorBox}
                <SearchBox
                  value={query}
                  onChange={setQuery}
                  placeholder="Buscar producto"
                />
                <Note>Precios y existencias publicados por el dueño.</Note>
                <View style={{ height: 8 }} />
              </>
            }
            ListEmptyComponent={
              <Note>
                {cache
                  ? "No hay coincidencias."
                  : "Toca Cuenta → Actualizar para descargar el catálogo."}
              </Note>
            }
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          />
        ) : (
          <ScrollView
            automaticallyAdjustKeyboardInsets
            key={tab === "Vender" && cartOpen ? "Vender-carrito" : tab}
            ref={scrollRef}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            {!(tab === "Vender" && cartOpen && cart.length) && errorBox}
            {body}
          </ScrollView>
        )}
      </View>
      {!keyboard && (
        <BottomDock>
          {!!toast && (
            <View style={[s.toast, { flexDirection: "row", gap: 10, alignItems: "center" }]} pointerEvents="none">
              <Icon name="circle-check" size={20} color="#fff" />
              <Text style={[s.toastText, { flex: 1 }]}>{toast}</Text>
            </View>
          )}
          {tab === "Vender" && !cartOpen && !!cart.length && !charge && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver carrito"
              style={({ pressed }) => [s.cartBar, { flexDirection: "row", gap: 12 }, pressed && { opacity: 0.9 }]}
              onPress={() => (setCartOpen(true), setError(""))}
            >
              <Icon name="shopping-cart" size={20} color="#fff" />
              <Text style={[s.cartBarText, { flex: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {`Ver carrito · ${cart.reduce((n, i) => n + i.qty, 0)} ${cart.reduce((n, i) => n + i.qty, 0) === 1 ? "pieza" : "piezas"}`}
              </Text>
              <Text style={[s.cartBarText, { fontWeight: "700" }]} numberOfLines={1}>{money(total)}</Text>
              <Icon name="chevron-right" size={18} color="#fff" />
            </Pressable>
          )}
        <TabBar
          tabs={TABS}
          active={tab === "Cuenta" ? fromTab.current : tab}
          onPress={(name) => (setTab(name), setCartOpen(false), setError(""))}
        />
        </BottomDock>
      )}
      <Modal
        visible={picker}
        animationType="slide"
        onRequestClose={() => setPicker(false)}
      >
        <SafeAreaView style={s.safe}>
          <View style={s.modalHeader}>
            <Text style={[s.title, { fontSize: 24, flex: 1 }]}>
              Elegir cliente
            </Text>
            <Button
              title="Volver"
              secondary
              small
              onPress={() => setPicker(false)}
            />
          </View>
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <SearchBox
              value={pickQuery}
              onChange={setPickQuery}
              placeholder="Buscar cliente por nombre o últimos 4 dígitos"
            />
            <Note>
              {pickResults
                ? "Resultados de la tienda (por privacidad solo se muestran los últimos 4 dígitos)."
                : "Tus clientes. Escribe al menos 2 letras para buscar en toda la tienda."}
            </Note>
            {(
              pickResults ??
              customers.filter((c) =>
                c.name.toLowerCase().includes(pickQuery.toLowerCase()),
              )
            )
              .slice(0, 50)
              .map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  style={s.option}
                  onPress={() => (
                    setCustomer({ id: c.id, name: c.name }),
                    setPicker(false)
                  )}
                >
                  <Text style={s.body}>{c.name}</Text>
                  {!!c.phone_hint && <Note>{c.phone_hint}</Note>}
                </Pressable>
              ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!receipt}
        animationType="slide"
        onRequestClose={() => setReceipt(null)}
      >
        <SafeAreaView style={s.safe}>
          <View style={s.modalHeader}>
            <Text style={[s.title, { fontSize: 24, flex: 1 }]}>
              Enviar comprobante
            </Text>
            <Button
              title="Cerrar"
              secondary
              small
              onPress={() => setReceipt(null)}
            />
          </View>
          {!!receipt && (
            <ScrollView
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={s.content}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={s.label}>WhatsApp del cliente (10 dígitos)</Text>
              <TextInput
                accessibilityLabel="WhatsApp del cliente (10 dígitos)"
                style={s.input}
                value={receipt.phone}
                onChangeText={(v) => setReceipt({ ...receipt, phone: v })}
                keyboardType="phone-pad"
                placeholder="55 1234 5678"
                placeholderTextColor={C.muted}
              />
              <View style={{ height: 10 }} />
              <Card>
                <Text style={s.body}>{receipt.text.replace(/\*/g, "")}</Text>
              </Card>
              <Button
                icon="message-circle" title="Enviar por WhatsApp"
                disabled={!validWhatsapp(receipt.phone)}
                onPress={() => {
                  void Linking.openURL(
                    `https://wa.me/${whatsappNumber(receipt.phone)}?text=${encodeURIComponent(receipt.text)}`,
                  ).catch(() => {});
                  setReceipt(null);
                }}
              />
              <Button
                title="Compartir con otra app"
                secondary
                small
                onPress={() =>
                  void Share.share({ message: receipt.text }).catch(() => {})
                }
              />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
      {!!charge && (
        <View style={s.payOverlay}>
          <View style={s.payCard}>
            <Text style={[s.label, { color: C.muted }]}>
              Cobro con tarjeta · Terminal Mercado Pago
            </Text>
            <Text style={[s.heroAmount, { color: C.ink, marginVertical: 4 }]}>
              {money(charge.amount)}
            </Text>
            {(charge.stage === "sending" ||
              charge.stage === "pending" ||
              charge.stage === "searching") && (
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
                charge.stage === "approved" && {
                  color: C.green,
                  fontWeight: "700",
                },
                (charge.stage === "failed" || charge.stage === "error") && {
                  color: C.red,
                },
              ]}
            >
              {charge.text}
            </Text>
            {charge.stage === "manual" && (
              <Button
                icon="circle-check" title="Ya cobré en la terminal"
                onPress={() => void findManual()}
              />
            )}
            {charge.stage === "choose" &&
              (charge.found || []).map((p) => (
                <Button
                  key={p.id}
                  title={`${terminalPaymentLabel(p)} · ${money(p.amount)}`}
                  secondary
                  onPress={() => void claimManual(p)}
                />
              ))}
            {charge.stage === "choose" && (
              <Button
                title="Ninguno es de esta venta"
                secondary
                small
                onPress={() =>
                  setCharge({
                    ...charge,
                    stage: "manual",
                    found: undefined,
                    text: manualText(charge.amount),
                  })
                }
              />
            )}
            {charge.stage === "pending" &&
              !charge.atTerminal &&
              (charge.tick || 0) >= 8 && (
                <Button
                  title="¿No llega a la terminal? Cobrar ahí directo"
                  secondary
                  onPress={() => void switchToManual()}
                />
              )}
            {(charge.stage === "sending" ||
              charge.stage === "pending" ||
              charge.stage === "manual" ||
              charge.stage === "choose") && (
              <Button
                title="Cancelar cobro"
                danger
                onPress={() => void cancelCard()}
              />
            )}
            {charge.stage === "pending" && (charge.fails || 0) >= 3 && (
              <Button
                title="Cerrar y revisar después"
                secondary
                onPress={reviewLater}
              />
            )}
            {charge.stage === "approved" && !!charge.sale && (
              <Button
                icon="send" title="Enviar comprobante por WhatsApp"
                onPress={() => (
                  void sendReceiptFor(charge.sale!),
                  setCharge(null)
                )}
              />
            )}
            {(charge.stage === "failed" || charge.stage === "error") && (
              <Button
                title="Reintentar"
                secondary
                onPress={() =>
                  void startCard(
                    charge.stage === "error"
                      ? charge.draft
                      : { ...charge.draft, mp_ref: undefined },
                  )
                }
              />
            )}
            {(charge.stage === "manual" || charge.stage === "choose") && (
              <Button
                title="Cerrar y ligar después"
                secondary
                small
                onPress={reviewLater}
              />
            )}
            {!["sending", "pending", "manual", "searching", "choose"].includes(
              charge.stage,
            ) && (
              <Button
                title={charge.stage === "approved" ? "Listo" : "Cerrar"}
                secondary
                onPress={() => setCharge(null)}
              />
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
