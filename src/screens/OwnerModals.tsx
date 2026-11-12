import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Switch,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FS from "expo-file-system/legacy";
import * as Picker from "expo-document-picker";
import { Text, TextInput } from "../text";
import {
  Business,
  STAGES,
  cardFee,
  feeLabel,
  grossUp,
  money,
  promoSummary,
  today,
  type Row,
} from "../business";
import { canScan } from "../native";
import { CameraScanner } from "../scanner";
import { findProductByCode, normalizeProductCode } from "../barcodes";
import { InventoryCodeForm } from "./InventoryCodeForm";
import { TransferInfo, type TransferAccount } from "../transfer";
import { validWhatsapp } from "../receipt";
import { KEYBOARD_BEHAVIOR } from "../keyboard";
import { Cloud, type CloudSession } from "../cloud";
import { deviceId } from "../device";
import {
  downloadBackup,
  listBackups,
  type CloudBackup,
} from "../cloudBackup";
import { migratePhotos } from "../photos";
import { LOGO_FULL, LOGO_FULL_RATIO } from "../brand";
import { when } from "./CloudBackup";
import {
  Button,
  C,
  Card,
  CardFeePreview,
  Checkbox,
  Chips,
  Icon,
  IconButton,
  Note,
  Pill,
  ProductPhoto,
  QUICK_EXPIRY,
  QUICK_FOLLOWUP,
  SearchBox,
  SelectAccordion,
  TextButton,
  addDays,
  followUpLabel,
  followUpsDue,
  s,
  tryCents,
} from "../ui";
import { whatsappNumber } from "../receipt";
import { terminalPaymentLabel, type TerminalPayment } from "../mercadopago";
import {
  amount,
  channels,
  manualOwnerText,
  minus,
  normalize,
  options,
  strings,
  units,
  type Abono,
  type Cart,
  type Draft,
  type Pay,
  type SaleDraft,
  type Selector,
} from "./ownerShared";

export function PayOverlayModal({
  pay,
  setPay,
  b,
  refresh,
  cancelCharge,
  reviewLater,
  chargeOnTerminalInstead,
  findManualPayment,
  linkManualPayment,
  finishApproved,
  refundCharge,
  startCharge,
  registerWithoutTerminal,
  checkTerminalThenCharge,
  terminalPayments,
  sendCardReceipt,
}: {
  pay: Pay | null;
  setPay: (p: Pay | null) => void;
  b: Business;
  refresh: () => void;
  cancelCharge: () => Promise<void>;
  reviewLater: () => void;
  chargeOnTerminalInstead: () => Promise<void>;
  findManualPayment: () => Promise<void>;
  linkManualPayment: (x: TerminalPayment) => void;
  finishApproved: (order: any) => void;
  refundCharge: (orderId: string) => Promise<void>;
  startCharge: (
    amount: number,
    draft: SaleDraft | null,
    test?: boolean,
    abono?: Abono,
  ) => Promise<any>;
  registerWithoutTerminal: () => void;
  checkTerminalThenCharge: (
    amount: number,
    draft: SaleDraft | null,
    abono?: Abono,
  ) => Promise<any>;
  terminalPayments: (v: Row) => Row[];
  sendCardReceipt: (v: Row, entry: Row) => Promise<void>;
}) {
  if (!pay) return null;
  return (
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
            icon="circle-check"
            title="Ya cobré en la terminal · buscar el pago"
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
                b.setSetting("mpPending", null),
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
              void startCharge(pay.amount, pay.draft ?? null, false, pay.abono)
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
                  : checkTerminalThenCharge(pay.amount, pay.draft ?? null, pay.abono))
              }
            />
          )}
        {pay.outcome === "done" && !!pay.saleId && (
          <Button
            icon="send"
            title="Enviar comprobante por WhatsApp"
            onPress={() => {
              const v = b.saleDetail(pay.saleId!);
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
}

export function FollowUpPopupModal({
  visible,
  onClose,
  customers,
  b,
  act,
  openSale,
  go,
}: {
  visible: boolean;
  onClose: () => void;
  customers: Row[];
  b: Business;
  act: (fn: () => void, done?: string) => boolean;
  openSale: (values?: Record<string, string>, items?: Cart) => void;
  go: (page: string, filter?: string) => void;
}) {
  if (!visible) return null;
  const due = followUpsDue(customers);
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.payOverlay}>
        <View style={[s.payCard, { maxWidth: 480, maxHeight: "86%" }]}>
          <View style={[s.between, { marginBottom: 8 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Icon name="bell" size={20} color={C.amber} />
              <Text style={[s.subtitle, { marginBottom: 0 }]}>
                Seguimientos pendientes
              </Text>
            </View>
            <IconButton
              icon="x"
              label="Cerrar seguimientos"
              bg={C.soft}
              onPress={onClose}
            />
          </View>
          <ScrollView style={{ maxHeight: 380 }}>
            {!due.length ? (
              <Note>No tienes seguimientos pendientes.</Note>
            ) : (
              due.map((c) => {
                const wa = whatsappNumber(c.phone);
                return (
                  <View
                    key={c.id}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderColor: C.line,
                    }}
                  >
                    <View style={s.between}>
                      <Text
                        style={[s.body, { fontWeight: "600", flex: 1 }]}
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                      <Text
                        style={[
                          s.muted,
                          {
                            fontSize: 13,
                            color: c.daysLeft < 0 ? C.red : C.amber,
                            fontWeight: "600",
                          },
                        ]}
                      >
                        {followUpLabel(c.daysLeft, c.nextDate)}
                      </Text>
                    </View>
                    {!!c.notes && (
                      <Text style={[s.muted, { fontSize: 12.5 }]} numberOfLines={1}>
                        {c.notes}
                      </Text>
                    )}
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 8,
                      }}
                    >
                      {!!wa && (
                        <Button
                          icon="message-circle"
                          title="WhatsApp"
                          secondary
                          small
                          onPress={() =>
                            void Linking.openURL("https://wa.me/" + wa).catch(
                              () => {},
                            )
                          }
                        />
                      )}
                      <Button
                        title="Vender"
                        small
                        onPress={() => {
                          onClose();
                          openSale({ customerId: c.id });
                        }}
                      />
                      <Button
                        title="+7 días"
                        secondary
                        small
                        onPress={() =>
                          act(
                            () =>
                              b.saveCustomer({
                                ...strings(c),
                                id: c.id,
                                nextDate: addDays(today(), 7),
                              }),
                            "Seguimiento pospuesto 7 días",
                          )
                        }
                      />
                      <IconButton
                        icon="trash-2"
                        label={`Eliminar notificación de ${c.name}`}
                        bg={C.redSoft}
                        color={C.red}
                        onPress={() => {
                          const left = due.length - 1;
                          act(
                            () =>
                              b.saveCustomer({
                                ...strings(c),
                                id: c.id,
                                nextDate: "",
                              }),
                            "Notificación de seguimiento eliminada",
                          );
                          if (left <= 0) onClose();
                        }}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
          <View style={{ height: 10 }} />
          <View style={[s.wrap, { justifyContent: "space-between" }]}>
            <Button
              title="Eliminar todas"
              danger
              small
              onPress={() => {
                act(() => {
                  for (const c of due)
                    b.saveCustomer({
                      ...strings(c),
                      id: c.id,
                      nextDate: "",
                    });
                }, "Notificaciones eliminadas");
                onClose();
              }}
            />
            <Button
              title="Ver en Clientes"
              secondary
              small
              onPress={() => {
                onClose();
                go("Clientes", "Próximos 5 días");
              }}
            />
            <Button
              title="Cerrar"
              secondary
              small
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function OwnerSetup({
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
          source={LOGO_FULL}
          accessibilityLabel="GGG · Nova Supps"
          resizeMode="contain"
          style={{
            width: 220,
            height: 220 / LOGO_FULL_RATIO,
            marginBottom: 22,
            alignSelf: "center",
          }}
        />
        {!!msg && (
          <View style={s.errorBox}>
            <Text style={[s.body, { color: C.red }]}>{msg}</Text>
          </View>
        )}
        <Text style={s.title}>Restaura tu negocio</Text>
        <Note>Entraste como dueño ✓. Elige tu archivo de respaldo (Nova-respaldo-….json) para traer tu negocio a este teléfono.</Note>
        <View style={{ height: 10 }} />
        {!!cloudList?.length && (
          <Button
            icon="cloud-upload"
            title={
              busy
                ? "Restaurando…"
                : `Restaurar de la nube (${when(cloudList[0].created_at)})`
            }
            disabled={busy}
            onPress={() => void restoreCloud(cloudList[0])}
          />
        )}
        <Button
          icon="file-text"
          title={busy ? "Restaurando…" : "Elegir mi respaldo"}
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


const DUPLICATED = "Se duplicó";
const CORRECTION = "Corrección";

export function OwnerFormModal(props: {
  form: string;
  pay: Pay | null;
  selector: Selector | null;
  setSelector: (s: Selector | null) => void;
  close: (id?: string) => void;
  val: (k: string) => string;
  set: (k: string, v: string) => void;
  checkoutFromBasket: { current: boolean };
  stack: Draft[];
  search: string;
  setSearch: (s: string) => void;
  open: (name: string, values?: Record<string, string>, nestedField?: string) => void;
  cartLimit: (productId: string, mode?: string) => number;
  cart: Cart;
  setCart: React.Dispatch<React.SetStateAction<Cart>>;
  setFormError: (s: string) => void;
  productName: (id: string) => string;
  addTo: (list: Cart, productId: string, qty: number) => Cart;
  formList: any;
  formKeyboard: { onScroll: (e: any) => void };
  wide: boolean;
  formError: string;
  b: Business;
  products: Row[];
  act: (fn: () => void, done?: string) => boolean;
  choose: (key: string, label: string, rows: Row[], optional?: boolean, create?: string) => React.ReactNode;
  setProductDetailId: (id: string) => void;
  go: (raw: string, filter?: string) => void;
  addToBasket: (productId: string, qty?: number, quiet?: boolean) => boolean;
  field: (key: string, label: string, numeric?: boolean, placeholder?: string, multiline?: boolean) => React.ReactNode;
  barcodeScanner: boolean;
  setBarcodeScanner: (v: boolean) => void;
  moneyField: (key: string, label: string, placeholder?: string) => React.ReactNode;
  data: any;
  more: (label?: string) => React.ReactNode;
  advanced: boolean;
  photoPreview: any[];
  busy: boolean;
  photo: () => Promise<void>;
  dateField: (key: string, label: string, quick: any) => React.ReactNode;
  editingProduct: Row | null | undefined;
  archiveFromForm: (kind: "product" | "customer") => void;
  chips: (key: string, label: string, list: { id: string; name: string }[], empty?: string) => React.ReactNode;
  editingCustomer: Row | null | undefined;
  saleable: Row[];
  accountField: (key: string, label: string, list?: Row[]) => React.ReactNode;
  accounts: Row[];
  saleIsCard: boolean;
  salePaid: number | null;
  bps: number;
  saleTotal: number;
  cartEditor: React.ReactNode;
  saleCharge: any;
  listTotal: number;
  customers: Row[];
  saleAccounts: Row[];
  productById: Map<string, Row>;
  allow: boolean;
  setAllow: (v: boolean) => void;
  privateOpen: boolean;
  setPrivateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  saleBase: number;
  saleCommission: number;
  receiptMessage: () => string;
  receiptSale: () => Row | null;
  revising: Row | null;
  reviseSuggested: number;
  reviseFeeBps: number;
  reviseGoods: number;
  reviseRefund: number;
  canMpRefund: boolean;
  line: (label: string, value: string, opts?: any) => React.ReactNode;
  reviseTotal: number | null;
  revisePaid: number;
  divider: () => React.ReactNode;
  reviseBalance: number;
  mpActive: boolean;
  save: (mode?: "terminal") => void;
  sendTypedReceipt: () => Promise<void>;
  payOverlay: React.ReactNode;
}) {
  const {
    form,
    pay,
    selector,
    setSelector,
    close,
    val,
    set,
    checkoutFromBasket,
    stack,
    search,
    setSearch,
    open,
    cartLimit,
    cart,
    setCart,
    setFormError,
    productName,
    addTo,
    formList,
    formKeyboard,
    wide,
    formError,
    b,
    products,
    act,
    choose,
    setProductDetailId,
    go,
    addToBasket,
    field,
    barcodeScanner,
    setBarcodeScanner,
    moneyField,
    data,
    more,
    advanced,
    photoPreview,
    busy,
    photo,
    dateField,
    editingProduct,
    archiveFromForm,
    chips,
    editingCustomer,
    saleable,
    accountField,
    accounts,
    saleIsCard,
    salePaid,
    bps,
    saleTotal,
    cartEditor,
    saleCharge,
    listTotal,
    customers,
    saleAccounts,
    productById,
    allow,
    setAllow,
    privateOpen,
    setPrivateOpen,
    saleBase,
    saleCommission,
    receiptMessage,
    receiptSale,
    revising,
    reviseSuggested,
    reviseFeeBps,
    reviseGoods,
    reviseRefund,
    canMpRefund,
    line,
    reviseTotal,
    revisePaid,
    divider,
    reviseBalance,
    mpActive,
    save,
    sendTypedReceipt,
    payOverlay,
  } = props;
  return (
      <Modal
        visible={!!form}
        animationType="slide"
        onRequestClose={() =>
          pay ? undefined : selector ? setSelector(null) : close()
        }
      >
        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={KEYBOARD_BEHAVIOR}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[s.title, { fontSize: 24, marginBottom: 2 }]}>
                  {selector
                    ? selector.label
                    : val("id") &&
                        !form.startsWith("Editar") &&
                        !form.startsWith("Renombrar") &&
                        form !== "Abono"
                      ? "Editar " + form.toLowerCase()
                      : form === "Venta"
                        ? checkoutFromBasket.current
                          ? "Carrito"
                          : "Nueva venta"
                        : form}
                </Text>
                {!selector && form !== "Venta" && stack.length > 0 && (
                  <Note>Guarda y volverás a la captura anterior.</Note>
                )}
              </View>
              <TextButton
                title={selector ? "Volver" : "Cerrar"}
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
                        { name: search },
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
                ref={formList}
                scrollEventThrottle={64}
                onScroll={formKeyboard.onScroll}
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
                {form === "Inventario por código" && (
                  <InventoryCodeForm
                    b={b}
                    code={val("barcode")}
                    products={products}
                    selectedId={val("productId")}
                    startScanning={val("startScanning") === "1"}
                    autoSell={val("autoSell") === "1"}
                    onEnrich={(product, online) =>
                      act(() =>
                        b.saveProductLookupPhoto(String(product.id), online),
                      )
                    }
                    picker={choose(
                      "productId",
                      "Elegir producto existente",
                      products.filter((p) => !p.archived),
                    )}
                    onCode={(code) => {
                      set("barcode", code);
                      set("productId", "");
                    }}
                    onCreate={(barcode, online) => {
                      if (findProductByCode(b.stock(), barcode)) {
                        open("Inventario por código", { barcode });
                        return;
                      }
                      open("Producto", {
                        barcode,
                        scanOrigin: "1",
                        ...(online
                          ? {
                              name: online.name,
                              brand: online.brand,
                              presentation: online.presentation,
                              flavor: online.flavor || "",
                              description: online.description,
                              imageUri: online.imageUri,
                              lookupSource: online.source,
                              lookupSourceUrl: online.sourceUrl,
                            }
                          : {}),
                      });
                    }}
                    onReceive={(product, barcode) =>
                      open("Entrada", {
                        productId: String(product.id),
                        scanProductId: String(product.id),
                        barcode,
                        qty: "1",
                      })
                    }
                    onLink={(product, barcode, source) =>
                      act(() =>
                        b.linkProductCode(String(product.id), barcode, source),
                      )
                    }
                    onRestore={(product) =>
                      act(
                        () => b.setProductArchived(String(product.id), false),
                        "Producto restaurado",
                      )
                    }
                    onDetail={(product) => {
                      close();
                      setProductDetailId(String(product.id));
                      go("Detalle producto");
                    }}
                    onSell={(product) => {
                      if (addToBasket(String(product.id))) {
                        close();
                        go("Vender");
                      }
                    }}
                  />
                )}
                {form === "Producto" && (
                  <>
                    {field("name", "Nombre *")}
                    {!!val("lookupSource") && (
                      <Note>
                        Datos obtenidos de {val("lookupSource")}. Confirma la
                        presentación, el sabor y el precio de venta.
                      </Note>
                    )}
                    {field("barcode", "Código de barras del empaque")}
                    {canScan() && (
                      <Button
                        icon="scan-barcode" title="Leer código de barras"
                        secondary
                        small
                        onPress={() => {
                                                setBarcodeScanner(true);
                        }}
                      />
                    )}
                    <CameraScanner
                      visible={barcodeScanner}
                      continuous={false}
                      instruction="Lee el código de barras del empaque para guardarlo en este producto."
                      onClose={() => setBarcodeScanner(false)}
                      onScan={(raw, tools) => {
                        const code = normalizeProductCode(raw);
                        if (!code || code.length > 40)
                          return { text: "Código no válido. Vuelve a leerlo.", bad: true };
                        const owner = findProductByCode(
                          b.stock().filter((p) => p.id !== val("id")),
                          code,
                        );
                        if (owner)
                          return {
                            text: `Ese código ya es de ${owner.name}`,
                            bad: true,
                            detail: `Código ${code}. Cada código identifica a un solo producto.`,
                            actions: [{ label: "Leer otro", onPress: () => tools.update({ text: "Listo para leer otro código." }) }],
                          };
                        set("barcode", code);
                        return { text: "Código guardado en el producto", detail: code, done: true };
                      }}
                    />

                    {moneyField("price", "Precio de venta MXN *")}
                    {(() => {
                      const base = tryCents(val("price"));
                      return (
                        <Note>{data.feeInPrice ? `Precio con comisión ${feeLabel(data.cardFeeBps)} incluida.` : `Recibes este monto completo.${base ? ` Cliente paga ${money(grossUp(base, data.feeBps))} (${feeLabel(data.feeBps)}).` : ""}`}</Note>
                      );
                    })()}
                    {!!val("id") && (
                      <>
                        {field("stockNow", "Existencias (piezas)", true, val("stockWas") || "0")}
                        {val("stockNow").trim() !== "" && val("stockNow") !== val("stockWas") && (
                          <Note color={C.amber}>
                            {`Existencias ${val("stockWas") || "0"} → ${val("stockNow")} (corrección sin merma).`}
                          </Note>
                        )}
                      </>
                    )}
                    {!val("id") && (
                      <>
                        {field("qty", "Stock inicial (opcional)", true, "0")}
                        {Number(val("qty")) > 0 && (
                          <>
                            {moneyField("cost", "Costo por unidad MXN *")}
                          </>
                        )}
                      </>
                    )}
                    {more()}
                    {advanced && (
                      <>
                        {photoPreview.slice(0, 1).map((_: any, i: number) => (
                          <ProductPhoto
                            key={i}
                            product={{
                              ...(editingProduct || {}),
                              id: val("id") || editingProduct?.id,
                              name: val("name") || editingProduct?.name,
                              sku: val("sku") || editingProduct?.sku,
                              brand: val("brand") || editingProduct?.brand,
                              presentation:
                                val("presentation") ||
                                editingProduct?.presentation,
                              imageKey:
                                val("imageKey") || editingProduct?.imageKey,
                              imageUri:
                                val("imageUri") || editingProduct?.imageUri,
                            }}
                            highRes
                            style={s.photo}
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
                        <View style={{ height: 12 }} />
                        {field("sku", "SKU — automático si lo dejas vacío")}
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
                        {!val("id") &&
                          dateField(
                            "expires",
                            "Caducidad inicial",
                            QUICK_EXPIRY,
                          )}
                        {field("notes", "Notas", false, "", true)}
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
                {form === "Cuenta" && (
                  <>
                    {field("name", "Nombre *")}
                    {chips(
                      "kind",
                      "Tipo *",
                      options(["Efectivo", "Banco", "Tarjeta", "Billetera"]),
                    )}
                    {moneyField("opening", "Saldo inicial MXN")}
                  </>
                )}
                {form === "Entrada" && (
                  <>
                    {val("scanProductId")
                      ? (() => {
                          const product = products.find(
                            (p) => p.id === val("scanProductId"),
                          );
                          return product ? (
                            <Card>
                              <Pill
                                text="Ficha precargada de tu catálogo"
                                tone="ok"
                              />
                              <View style={s.productRow}>
                                <ProductPhoto
                                  product={product}
                                  style={s.productImage}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text style={s.subtitle}>{product.name}</Text>
                                  <Note>
                                    {[
                                      product.brand,
                                      product.presentation,
                                      product.flavor,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </Note>
                                  <Note>SKU: {product.sku}</Note>
                                  <Text style={s.price}>
                                    Precio de venta: {money(product.price)}
                                  </Text>
                                </View>
                              </View>
                              <Note>
                                Precio registrado · no se puede cambiar desde
                                esta entrada.
                              </Note>
                              <Note>
                                {product.inventoryKnown
                                  ? `${product.stock} piezas físicas · ${product.available} disponibles`
                                  : "Inventario por confirmar"}
                              </Note>
                            </Card>
                          ) : (
                            <Note color={C.red}>
                              El producto ya no está disponible. Vuelve a leer
                              el código.
                            </Note>
                          );
                        })()
                      : choose(
                          "productId",
                          "Producto *",
                          val("scanProductId")
                            ? saleable.filter(
                                (product) =>
                                  product.id === val("scanProductId"),
                              )
                            : saleable,
                          false,
                          val("scanProductId") ? undefined : "Producto",
                        )}
                    {!!val("barcode") && (
                      <Note>
                        Código leído: {val("barcode")}. Se conserva vinculado a
                        esta ficha junto con sus otros códigos.
                      </Note>
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
                    {dateField("expires", "Caducidad", QUICK_EXPIRY)}
                    {more()}
                    {advanced && field("label", "Nombre de lote")}
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
                    {val("kind") === "expense" ? (
                      // 2.11 · Gasto: solo Efectivo, Transferencia MP o Tarjeta.
                      (() => {
                        const pick = (label: string) =>
                          label === "Efectivo"
                            ? accounts.find((a) => a.kind === "Efectivo")
                            : label === "Transferencia MP"
                              ? accounts.find((a) => a.kind === "Billetera" && /mercado/i.test(a.name)) ||
                                accounts.find((a) => a.kind === "Billetera") ||
                                accounts.find((a) => a.kind === "Banco")
                              : accounts.find((a) => a.kind === "Tarjeta");
                        const kindNow = accounts.find((a) => a.id === val("accountId"))?.kind || "";
                        const current =
                          val("payWith") ||
                          (kindNow === "Efectivo" ? "Efectivo" : kindNow === "Tarjeta" ? "Tarjeta" : kindNow ? "Transferencia MP" : "");
                        const opts = ["Efectivo", "Transferencia MP", "Tarjeta"].filter((x) => pick(x));
                        return (
                          <View style={s.field}>
                            <Text style={s.label}>Pagado con *</Text>
                            <Chips
                              options={opts.map((x) => ({ id: x, name: x }))}
                              value={current}
                              onChange={(v) => {
                                set("payWith", v);
                                set("accountId", pick(v)?.id || "");
                              }}
                            />
                          </View>
                        );
                      })()
                    ) : (
                      accountField(
                        "accountId",
                        val("kind") === "transfer"
                          ? "Cuenta origen *"
                          : "Cuenta *",
                      )
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
                  </>
                )}
                {form === "Venta" &&
                  (() => {
                    // 2.9 · Cobro directo: total y forma de pago arriba; productos en compacto;
                    // cliente y lo demás en «Más opciones»; lo privado detrás de un toque.
                    const cost = cart.reduce((n, i) => {
                      const p = products.find((x) => x.id === i.productId);
                      return n + (p && p.stock > 0 ? Math.round((p.value / p.stock) * i.qty) : 0);
                    }, 0);
                    const fee = saleIsCard && salePaid ? cardFee(salePaid, bps) : 0;
                    const received = (salePaid ?? saleTotal) - fee;
                    const row = (label: string, value: string, opts: { bold?: boolean; color?: string } = {}) => (
                      <View key={label} style={[s.between, { gap: 8, paddingVertical: 2 }]}>
                        <Text style={[s.body, { flex: 1, color: opts.bold ? C.ink : C.muted }, opts.bold && { fontWeight: "600" }]}>{label}</Text>
                        <Text style={[s.body, { fontWeight: opts.bold ? "700" : "500", fontVariant: ["tabular-nums"] }, opts.color ? { color: opts.color } : null]}>
                          {value}
                        </Text>
                      </View>
                    );
                    const fromBasket = checkoutFromBasket.current;
                    return (
                      <>
                        {!fromBasket && cartEditor}
                        <Card>
                          <View style={s.between}>
                            <Text style={[s.body, { fontWeight: "600" }]}>1. Total a cobrar</Text>
                            <Text style={{ fontSize: 30, fontWeight: "700", color: C.ink, fontVariant: ["tabular-nums"] }}>{money(saleTotal)}</Text>
                          </View>
                          {saleCharge.discount > 0 &&
                            row(
                              saleCharge.promo.hits.length
                                ? `Descuento · ${promoSummary(saleCharge.promo.hits)
                                    .map((x) => x.name)
                                    .join(", ")}`
                                : "Descuento aplicado",
                              minus(saleCharge.discount),
                              { color: C.red },
                            )}
                          {/* 2.11 · Descuento: un botón; al abrirlo, % rápidos o un importe. */}
                          {listTotal > 0 && (() => {
                            const open = val("discOpen") === "1" || !!val("total");
                            const applyCents = (off: number, tag: string) => {
                              const off2 = Math.max(0, Math.min(listTotal, off));
                              set("discTag", tag);
                              set("total", off2 ? amount(listTotal - off2) : "");
                            };
                            return (
                              <View style={{ marginTop: 8, gap: 8 }}>
                                {!open ? (
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Aplicar descuento"
                                    onPress={() => set("discOpen", "1")}
                                    style={({ pressed }) => [s.chip, { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, flexDirection: "row", gap: 6, alignItems: "center" }, pressed && { opacity: 0.7 }]}
                                  >
                                    <Icon name="tag" size={14} color={C.ink} />
                                    <Text style={[s.chipText, { fontSize: 13 }]}>Descuento</Text>
                                  </Pressable>
                                ) : (
                                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                                    {[5, 10, 15, 20].map((pct) => {
                                      const on = val("discTag") === pct + "%" && !!val("total");
                                      return (
                                        <Pressable
                                          key={pct}
                                          accessibilityRole="button"
                                          accessibilityLabel={`Descuento ${pct}%`}
                                          onPress={() => (on ? applyCents(0, "") : applyCents(Math.round((listTotal * pct) / 100), pct + "%"))}
                                          style={[s.chip, on && s.chipOn, { paddingVertical: 6, paddingHorizontal: 12 }]}
                                        >
                                          <Text style={[s.chipText, on && s.chipTextOn, { fontSize: 13 }]}>{pct}%</Text>
                                        </Pressable>
                                      );
                                    })}
                                    <View style={{ width: 92 }}>
                                      <TextInput
                                        accessibilityLabel="Descuento en pesos"
                                        style={[s.input, { paddingVertical: 6, minHeight: 34 }]}
                                        value={val("discTag").startsWith("$") ? val("discTag").slice(1) : ""}
                                        onChangeText={(v) => {
                                          const c = tryCents(v);
                                          if (!v.trim() || c === null) return (set("discTag", v.trim() ? "$" + v : ""), set("total", ""));
                                          applyCents(c, "$" + v);
                                        }}
                                        keyboardType="decimal-pad"
                                        placeholder="$"
                                        placeholderTextColor={C.muted}
                                      />
                                    </View>
                                    <TextButton
                                      title="Quitar"
                                      color={C.muted}
                                      onPress={() => (set("total", ""), set("discTag", ""), set("discOpen", ""))}
                                    />
                                  </View>
                                )}
                              </View>
                            );
                          })()}
                        </Card>
                        {accountField("accountId", "Forma de pago *", saleAccounts)}
                        {(() => {
                          // 2.11 · Datos del cobro para el comprobante en PDF (sin calculadora).
                          const kind = accounts.find((a) => a.id === val("accountId"))?.kind || "";
                          const due = salePaid ?? saleTotal;
                          if (kind === "Efectivo") {
                            const given = tryCents(val("cashGiven"));
                            return (
                              <View style={{ marginTop: -4, marginBottom: 8 }}>
                                {moneyField("cashGiven", "¿Con cuánto pagó? MXN", `Exacto · ${amount(due)}`)}
                                {given !== null && given > 0 && (
                                  <Note color={given >= due ? C.green : C.amber}>
                                    {given > due ? `Cambio: ${money(given - due)}` : given === due ? "Pago exacto" : `Faltan ${money(due - given)}`}
                                  </Note>
                                )}
                              </View>
                            );
                          }
                          if (kind === "Banco" || kind === "Billetera")
                            return (
                              <>
                                <TransferInfo
                                  list={((all: TransferAccount[]) =>
                                    all.some((t) => t.accountId === val("accountId"))
                                      ? all.filter((t) => t.accountId === val("accountId"))
                                      : all.filter((t) => !t.ownerHidden))(b!.setting("transferAccounts", []))}
                                  amount={saleTotal}
                                  phone={customers.find((c) => c.id === val("customerId"))?.phone || ""}
                                  emptyText="Captura tus datos de transferencia en Ajustes → Formas de pago para mandárselos al cliente."
                                />
                                {field("transferFrom", "¿Quién transfiere? (emisor)", false, "Nombre o banco de quien paga")}
                              </>
                            );
                          if (kind === "Tarjeta" && !mpActive)
                            return (
                              <>
                                {field("cardLast4", "Últimos 4 dígitos", true, "1234")}
                                {chips("cardType", "Tipo de tarjeta", options(["Débito", "Crédito"]))}
                                {field("cardOp", "No. de operación de la terminal", false, "Opcional")}
                              </>
                            );
                          return null;
                        })()}
                        {fromBasket && cartEditor}
                        {/* 2.11 · Cliente: solo un check; sin él es Venta al público en general. */}
                        <Checkbox
                          label="¿Ya es cliente?"
                          hint={val("customerId") ? undefined : "Si no, se registra como Venta al público en general."}
                          value={val("isCustomer") === "1" || !!val("customerId")}
                          onChange={(on) => {
                            if (!on) return (set("isCustomer", ""), set("customerId", ""), set("autoFollow", ""));
                            set("isCustomer", "1");
                            setSearch("");
                            setSelector({ key: "customerId", label: "Cliente", rows: customers.filter((c) => !c.archived), optional: true, create: "Cliente" });
                          }}
                        />
                        {(val("isCustomer") === "1" || !!val("customerId")) &&
                          choose(
                            "customerId",
                            "Cliente",
                            customers.filter((c) => !c.archived || c.id === val("customerId")),
                            true,
                            "Cliente",
                          )}
                        {!!val("customerId") && (() => {
                          const sugDays = cart.some((i) =>
                            /60\s*serv|2\s*kg|5\s*lb/i.test(
                              (productById.get(i.productId)?.presentation || "") + " " + (productById.get(i.productId)?.name || ""),
                            ),
                          )
                            ? 45
                            : 25;
                          const curFollow = val("autoFollow");
                          return (
                            <View style={{ marginBottom: 8 }}>
                              <Text style={s.label}>Recordatorio de recompra</Text>
                              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                                {[
                                  { id: String(sugDays), label: `${sugDays} días` },
                                  { id: "", label: "Sin agendar" },
                                ].map((opt) => {
                                  const on = curFollow === opt.id;
                                  return (
                                    <Pressable
                                      key={opt.id || "none"}
                                      accessibilityRole="button"
                                      onPress={() => set("autoFollow", opt.id)}
                                      style={[s.chip, on && s.chipOn, { paddingVertical: 5, paddingHorizontal: 10 }]}
                                    >
                                      <Text style={[s.chipText, on && s.chipTextOn, { fontSize: 12 }]}>{opt.label}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          );
                        })()}
                        <View style={{ height: 4 }} />
                        <SelectAccordion
                          label="Canal"
                          value={val("channel") || "Mostrador"}
                          options={channels}
                          onChange={(v) => set("channel", v)}
                        />
                        <SoldByPicker b={b!} value={val("soldBy") || OWNER_SELLER} onChange={(v) => set("soldBy", v)} />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Ver lo que recibes"
                          onPress={() => setPrivateOpen((x) => !x)}
                          style={({ pressed }) => [
                            { backgroundColor: C.soft, borderRadius: 18, padding: 14, gap: 1 },
                            pressed && { opacity: 0.8 },
                          ]}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Icon name="lock" size={14} color={C.muted} />
                            <Text style={[s.body, { flex: 1, fontWeight: "600" }]}>
                              {`Recibes ${money(received)}${cost > 0 ? ` · ganas ${money(received - cost)}` : ""}`}
                            </Text>
                            <Icon name={privateOpen ? "chevron-down" : "chevron-right"} size={16} color={C.muted} />
                          </View>
                          {privateOpen && (
                            <>
                              <Text style={[s.label, { marginTop: 6, marginBottom: 2 }]}>Solo lo ves tú</Text>
                              {row("Subtotal", money(saleCharge.subtotal))}
                              {row("Tu precio", money(saleBase))}
                              {row("Comisión que absorbe el cliente", "+" + money(saleCommission))}
                              {saleIsCard && row(`Mercado Pago descuenta ${feeLabel(bps)}`, minus(fee), { color: C.red })}
                              {row("Recibes", money(received), { bold: true, color: C.green })}
                              {cost > 0 &&
                                row("Ganancia estimada", money(received - cost), {
                                  color: received - cost >= 0 ? C.green : C.red,
                                })}
                            </>
                          )}
                          {cost > 0 && saleBase < cost && saleCharge.promo.total > 0 && saleBase + saleCharge.promo.total >= cost && (
                            <Note color={C.amber}>
                              Con la promoción esta venta queda debajo del costo. Se permite porque tú la configuraste.
                            </Note>
                          )}
                        </Pressable>
                        <View style={{ height: 12 }} />
                      </>
                    );
                  })()}
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
                    {field("notes", "Notas", false, "", true)}
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
                    <Note>Quita productos para devolverlos (regresan a su lote) o agrega más.</Note>
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
                            {val("reason") === DUPLICATED || val("reason") === CORRECTION
                              ? diff < 0
                                ? `Se quitan ${-diff} ${-diff === 1 ? "pieza" : "piezas"} (primero las cargadas más recientemente). No cuenta como merma.`
                                : `Se agregan ${diff} ${diff === 1 ? "pieza" : "piezas"} con el último costo. No cuenta como merma.`
                              : diff < 0
                                ? `Se descontarán ${-diff} ${-diff === 1 ? "unidad" : "unidades"} (primero de los lotes que caducan antes).`
                                : `Se agregarán ${diff} ${diff === 1 ? "unidad" : "unidades"} con el último costo registrado.`}
                          </Note>
                        )}
                        {chips(
                          "reason",
                          "Motivo *",
                          options([
                            CORRECTION,
                            DUPLICATED,
                            "Conteo físico",
                            "Merma o caducado",
                            "Regalo o muestra",
                            "Dañado",
                            "Otro",
                          ]),
                        )}
                        {field("note", "Nota (opcional)")}
                        <Note>
                          {val("reason") === DUPLICATED || val("reason") === CORRECTION
                            ? "Corrige la cantidad sin mover dinero ni contar como merma."
                            : "El ajuste no mueve dinero. Las bajas cuentan como merma (a su costo) en tu utilidad; las altas la compensan."}
                        </Note>
                      </>
                    );
                  })()}
                {form === "Renombrar cuenta" && (
                  <>
                    {field("name", "Nombre *")}
                  </>
                )}
                {form === "Configuración" && (
                  <>
                    {field("rate", "Comisión (%) *", true, "4.06")}
                    <Note>{`Normalmente 4.06% (3.5% + IVA de Mercado Pago).${data?.feeInPrice ? " Tus precios se ajustan solos al nuevo %." : ""} Las ventas anteriores no cambian.`}</Note>
                  </>
                )}
                <View style={{ height: 16 }} />
                {!!formError && <Note color={C.red}>{formError}</Note>}
                {form === "Inventario por código" ? null : form === "Venta" &&
                  mpActive &&
                  saleIsCard &&
                  (salePaid ?? 0) > 0 ? (
                  <>
                    <Button
                      icon="credit-card" title={
                        busy
                          ? "Enviando…"
                          : `Cobrar ${money(salePaid ?? 0)} en la terminal`
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
                      icon="message-circle" title="Enviar por WhatsApp"
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
                      icon="credit-card" title={
                        busy
                          ? "Enviando…"
                          : `Cobrar abono de ${money(tryCents(val("amount")) ?? 0)} en la terminal`
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
                          ? `Cobrar ${money(salePaid ?? saleTotal)}`
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
  );
}

/** 2.11 · Quién vendió (vendedores sin la app): «Dueño» y los nombres que agregues. */
export const OWNER_SELLER = "Dueño";
export function SoldByPicker({ b, value, onChange }: { b: Business; value: string; onChange: (v: string) => void }) {
  const [names, setNames] = useState<string[]>(() => {
    const v = b.setting("soldByNames", []);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];
  });
  const [draft, setDraft] = useState("");
  const add = () => {
    const name = draft.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name || name.toLowerCase() === OWNER_SELLER.toLowerCase()) return;
    const next = names.some((n) => n.toLowerCase() === name.toLowerCase()) ? names : [...names, name];
    setNames(next);
    try {
      b.setSetting("soldByNames", next);
    } catch {}
    setDraft("");
    onChange(name);
  };
  return (
    <SelectAccordion
      label="Vendió"
      value={value}
      options={[OWNER_SELLER, ...names]}
      onChange={onChange}
      extra={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderColor: C.line }}>
          <TextInput
            accessibilityLabel="Nombre del vendedor"
            style={[s.input, { flex: 1, paddingVertical: 6, minHeight: 34 }]}
            value={draft}
            onChangeText={setDraft}
            placeholder="＋ Agregar vendedor"
            placeholderTextColor={C.muted}
            onSubmitEditing={add}
          />
          {!!draft.trim() && <TextButton title="Agregar" bold onPress={add} />}
        </View>
      }
    />
  );
}
