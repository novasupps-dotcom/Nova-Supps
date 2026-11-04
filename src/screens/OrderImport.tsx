// 2.8 · Stock → «Cargar pedido (PDF)»: el PDF del pedido del proveedor se vuelve inventario.
// Muestra qué productos ya existen (solo suman piezas) y cuáles son nuevos (SKU homologado),
// la calculadora de precio (costo real + % de ganancia + comisión de la terminal) y pide
// la cuenta con la que se pagó. Nada se guarda hasta confirmar.
import * as FS from "expo-file-system/legacy";
import * as Picker from "expo-document-picker";
import React, { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { Text, TextInput } from "../text";
import { feeLabel, money, type Business, type Row } from "../business";
import { base64ToBytes } from "../photos";
import {
  applySupplierOrder,
  planSupplierOrder,
  priceCalc,
  readSupplierOrderPdf,
  type GroupDecision,
  type OrderPlan,
  type PriceGroup,
  type SupplierOrder,
} from "../supplierOrder";
import { Button, C, Card, Chips, Note, Pill, TextButton, s, tryCents } from "../ui";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const NO_PAY = "__none__";

export function OrderImportPage({
  b,
  notify,
  onChanged,
}: {
  b: Business;
  notify: (text: string) => void;
  /** Después de cargar: refresca pantallas y publica el catálogo a los vendedores. */
  onChanged: () => void;
}) {
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState<"" | "read" | "apply">("");
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<Record<string, string | null>>({});
  const [markupText, setMarkupText] = useState(String(b.setting("orderMarkupPct", 30)));
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [account, setAccount] = useState("");
  const [again, setAgain] = useState(false);

  const plan: OrderPlan | null = useMemo(() => (order ? planSupplierOrder(b, order, choices) : null), [b, order, choices]);
  const markup = Math.max(0, Math.min(1000, Number(markupText.replace(",", ".")) || 0));
  const bps = b.feeBps();
  const inPrice = b.feeInPrice();
  const accounts: Row[] = useMemo(() => b.accounts(), [b, order]);

  async function pick() {
    setError("");
    try {
      const r = await Picker.getDocumentAsync({ type: ["application/pdf"], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.length) return;
      setBusy("read");
      await new Promise((ok) => setTimeout(ok, 30));
      const raw = await FS.readAsStringAsync(r.assets[0].uri, { encoding: FS.EncodingType.Base64 });
      const next = readSupplierOrderPdf(base64ToBytes(raw));
      setOrder(next);
      setFileName(r.assets[0].name || "pedido.pdf");
      setChoices({});
      setPrices({});
      setKeep({});
      setAccount("");
      setAgain(false);
    } catch (e) {
      setOrder(null);
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }
  const reset = () => {
    setOrder(null);
    setFileName("");
    setChoices({});
  };

  const calcOf = (g: PriceGroup) => {
    const typed = tryCents(prices[g.family] ?? "");
    return priceCalc(g.cost, markup, bps, typed !== null && typed > 0 ? typed : undefined);
  };
  const keepOf = (g: PriceGroup) => g.currentClient !== null && (keep[g.family] ?? true);

  function confirm() {
    if (!plan) return;
    if (!account) {
      setError("Elige con qué cuenta pagaste el pedido (o «No registrar pago»).");
      return;
    }
    const created = plan.items.filter((i) => !i.productId).length;
    const restock = new Set(plan.items.filter((i) => i.productId).map((i) => i.productId)).size;
    const units = plan.order.lines.reduce((n, l) => n + l.qty, 0);
    const acc = accounts.find((a) => a.id === account);
    Alert.alert(
      "Cargar pedido",
      [
        `${units} piezas · ${created} ${created === 1 ? "producto nuevo" : "productos nuevos"} · ${restock} ya ${restock === 1 ? "existía" : "existían"}.`,
        `Precios: ${plan.groups.filter((g) => !keepOf(g)).length} con precio nuevo, ${plan.groups.filter(keepOf).length} conservan el actual.`,
        acc ? `Pago: ${money(plan.order.total)} sale de ${acc.name}.` : "Sin registrar pago.",
        "Antes se guarda una copia de tus datos.",
      ].join("\n"),
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Cargar", onPress: () => void apply() },
      ],
    );
  }

  async function apply() {
    if (!plan || busy) return;
    setBusy("apply");
    setError("");
    try {
      await keepCopy(b);
      const decisions: Record<string, GroupDecision> = {};
      for (const g of plan.groups) decisions[g.family] = { client: calcOf(g).client, keepCurrent: keepOf(g) };
      b.setSetting("orderMarkupPct", markup);
      const r = applySupplierOrder(b, plan, decisions, account === NO_PAY ? null : account);
      reset();
      onChanged();
      notify(`Pedido cargado · ${r.units} piezas · ${r.created} nuevos · ${r.restocked} con más piezas${r.paid ? " · pago " + money(r.paid) : ""}`);
    } catch (e) {
      setError("No se cargó nada: " + errText(e));
    } finally {
      setBusy("");
    }
  }

  const o = plan?.order;
  const units = o ? o.lines.reduce((n, l) => n + l.qty, 0) : 0;
  return (
    <>
      <Card>
        <Text style={s.subtitle}>Pedido del proveedor (PDF)</Text>
        <Note>
          Elige el PDF del pedido (Imprimir pedido → Guardar como PDF). La app lee productos, sabores, cantidades y
          precios; lo que ya tienes solo suma piezas y lo nuevo se da de alta. Nada se guarda hasta confirmar.
        </Note>
        <View style={{ height: 8 }} />
        <Button
          title={busy === "read" ? "Leyendo PDF…" : order ? "Elegir otro PDF" : "Elegir PDF del pedido"}
          icon="file-text"
          secondary={!!order}
          disabled={!!busy}
          onPress={pick}
        />
        {!!error && <Note color={C.red}>{error}</Note>}
      </Card>

      {plan && o && (
        <>
          <Card>
            <Text style={s.subtitle}>{`Pedido ${o.number ? "#" + o.number : ""} · ${o.supplier}`}</Text>
            <Note>{[o.date, o.status, fileName].filter(Boolean).join(" · ")}</Note>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 6 }}>
              <Pill text={`${units} piezas`} tone="ok" />
              <Pill text={`${plan.items.filter((i) => !i.productId).length} nuevos`} />
              <Pill text={`${plan.items.filter((i) => i.productId).length} ya existen`} />
            </View>
            <Note>{`Sub-total ${money(o.subtotal)} · descuento −${money(o.discount)} · envío ${money(o.shipping)} · pagado ${money(o.total)}`}</Note>
            <Note>El costo de cada pieza es el real: su precio con su parte del descuento y del envío.</Note>
            {/pendiente/i.test(o.status) && (
              <Note color={C.amber}>El pedido dice «{o.status}»: carga el inventario cuando la mercancía ya esté contigo, para no vender piezas que aún no llegan.</Note>
            )}
            {o.warnings.map((w, i) => (
              <Note key={i} color={C.amber}>
                {w}
              </Note>
            ))}
            {!!plan.duplicate && (
              <>
                <Note color={C.red}>
                  {`Este pedido ya se cargó el ${new Date(String(plan.duplicate.at)).toLocaleDateString("es-MX")} (${plan.duplicate.units} piezas). Cargarlo otra vez duplicaría las existencias.`}
                </Note>
                <TextButton
                  title={again ? "✓ Cargar de nuevo de todos modos" : "Cargar de nuevo de todos modos"}
                  color={C.red}
                  onPress={() => setAgain((x) => !x)}
                />
              </>
            )}
          </Card>

          <Card>
            <Text style={s.subtitle}>Calculadora de precio</Text>
            <View style={[s.row, { alignItems: "center" }]}>
              <Text style={[s.body, { flex: 1 }]}>% de ganancia sobre el costo</Text>
              <TextInput
                style={[s.input, { width: 90, textAlign: "right", marginBottom: 0 }]}
                value={markupText}
                onChangeText={(t) => {
                  setMarkupText(t);
                  setPrices({});
                }}
                keyboardType="decimal-pad"
                accessibilityLabel="Porcentaje de ganancia"
              />
            </View>
            <Note>{`Comisión de la terminal: ${feeLabel(bps)} (la absorbe el cliente). Precio sugerido = costo + ${markup}% + comisión, redondeado hacia arriba al peso. Puedes cambiar cada precio.`}</Note>
            <Note>
              {inPrice
                ? "Tus precios incluyen la comisión: el precio que ves es el del catálogo."
                : "La comisión se suma al cobrar: aquí ves lo que paga el cliente; en el catálogo se guarda sin la comisión."}
            </Note>
          </Card>

          {plan.groups.map((g) => {
            const c = calcOf(g);
            const items = g.items.map((i) => plan.items[i]);
            const current = g.currentClient !== null ? priceCalc(g.cost, markup, bps, g.currentClient) : null;
            const keeping = keepOf(g);
            return (
              <Card key={g.family}>
                <Text style={[s.body, { fontWeight: "600" }]}>{g.name}</Text>
                {items.length > 1 && (
                  <Note>{`Sabores: ${items.map((it) => `${it.line.flavor} (${it.line.qty})`).join(", ")} · al vender se elige el sabor`}</Note>
                )}
                {items.map((it) => (
                  <View key={it.key} style={{ paddingVertical: 6, borderTopWidth: 1, borderColor: C.line }}>
                    <Text style={s.body} numberOfLines={2}>
                      {`${it.line.qty} × ${it.line.flavor || it.line.name}`}
                    </Text>
                    {it.productId ? (
                      <>
                        <Note color={C.green}>
                          {`Ya existe: ${it.candidates.find((x) => x.id === it.productId)?.name ?? ""} · existencias ${
                            it.candidates.find((x) => x.id === it.productId)?.stock ?? 0
                          } → ${(it.candidates.find((x) => x.id === it.productId)?.stock ?? 0) + it.line.qty}`}
                        </Note>
                        <TextButton title="No es este, darlo de alta" onPress={() => setChoices((ch) => ({ ...ch, [it.key]: null }))} />
                      </>
                    ) : (
                      <>
                        <Note>{`Nuevo: ${it.newSku} · ${it.category}`}</Note>
                        {it.candidates.map((cand) => (
                          <TextButton
                            key={cand.id}
                            title={`¿Es «${cand.name}»? (${cand.why}) · usar este`}
                            onPress={() => setChoices((ch) => ({ ...ch, [it.key]: cand.id }))}
                          />
                        ))}
                      </>
                    )}
                    <Note>{`Costo real ${money(it.unitCost)} por pieza (PDF ${money(it.line.price)})`}</Note>
                  </View>
                ))}
                <View style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: 6 }}>
                  <Note>{`Costo ${money(g.cost)} + ${markup}% = ${money(c.target)} + comisión ${feeLabel(bps)} → ${money(priceCalc(g.cost, markup, bps).client)} sugerido`}</Note>
                  {current && (
                    <Chips
                      row
                      options={[
                        { id: "keep", name: `Mantener ${money(current.client)}` },
                        { id: "new", name: `Precio nuevo ${money(c.client)}` },
                      ]}
                      value={keeping ? "keep" : "new"}
                      onChange={(v) => setKeep((k) => ({ ...k, [g.family]: v === "keep" }))}
                    />
                  )}
                  {current && keeping ? (
                    <Note>{`Con el precio actual: comisión ${money(current.fee)} · te queda ${money(current.net)} · ganancia ${money(current.profit)} (${current.realPct.toFixed(1)}%)`}</Note>
                  ) : (
                    <>
                      <View style={[s.row, { alignItems: "center" }]}>
                        <Text style={[s.body, { flex: 1 }]}>Precio al cliente</Text>
                        <TextInput
                          style={[s.input, { width: 120, textAlign: "right", marginBottom: 0 }]}
                          value={prices[g.family] ?? (c.client / 100).toFixed(2)}
                          onChangeText={(t) => setPrices((p) => ({ ...p, [g.family]: t }))}
                          keyboardType="decimal-pad"
                          accessibilityLabel={`Precio al cliente de ${g.name}`}
                        />
                      </View>
                      <Note color={c.profit < 0 ? C.red : undefined}>
                        {`Comisión ${feeLabel(bps)} ${money(c.fee)} · te queda ${money(c.net)} · ganancia ${money(c.profit)} por pieza (${c.realPct.toFixed(1)}%)`}
                      </Note>
                    </>
                  )}
                </View>
              </Card>
            );
          })}

          <Card>
            <Text style={s.subtitle}>¿Con qué pagaste el pedido?</Text>
            <Note>{`Se registra una salida de ${money(o.total)} de esa cuenta. Si ya lo registraste o no quieres moverlo, elige «No registrar pago».`}</Note>
            <Chips
              options={[
                ...accounts.map((a) => ({ id: a.id, name: `${a.name} (${money(a.balance)})` })),
                { id: NO_PAY, name: "No registrar pago" },
              ]}
              value={account}
              onChange={setAccount}
            />
            <View style={{ height: 8 }} />
            <Button
              title={busy === "apply" ? "Cargando…" : `Cargar ${units} piezas al inventario`}
              disabled={!!busy || (!!plan.duplicate && !again) || !account}
              onPress={confirm}
            />
            <Button title="Descartar" secondary disabled={!!busy} onPress={reset} />
          </Card>
        </>
      )}
    </>
  );
}

/** Copia de los datos antes de cargar (se conservan las últimas 3). */
async function keepCopy(b: Business) {
  const dir = FS.documentDirectory;
  if (!dir) return;
  await FS.writeAsStringAsync(dir + `Nova-antes-de-pedido-${Date.now()}.json`, b.backup());
  try {
    const old = (await FS.readDirectoryAsync(dir)).filter((n: string) => n.startsWith("Nova-antes-de-pedido-")).sort();
    for (const name of old.slice(0, Math.max(0, old.length - 3))) await FS.deleteAsync(dir + name, { idempotent: true });
  } catch {}
}

/**
 * 2.8 · Resumen de ventas (solo dueño): margen por producto con el precio actual y proyección
 * si se vende todo lo que hay en existencia. Los vendedores nunca ven costos.
 */
export function MarginProjectionCard({ b }: { b: Business }) {
  const [all, setAll] = useState(false);
  const { rows, totals } = useMemo(() => b.marginProjection(), [b]);
  if (!rows.length) return null;
  const list = [...rows].sort((x, y) => y.units * y.profit - x.units * x.profit);
  const shownRows = all ? list : list.slice(0, 12);
  return (
    <Card>
      <Text style={s.subtitle}>Margen por producto y proyección</Text>
      <Note>{`Solo tú lo ves. Con tus precios actuales y lo que hay en existencia (${totals.units} piezas). La comisión se cuenta como si todo se cobrara con tarjeta.`}</Note>
      <View style={{ marginVertical: 6 }}>
        {[
          ["Si vendes todo", money(totals.revenue)],
          ["Comisión de la terminal", "−" + money(totals.fees)],
          ["Costo de la mercancía", "−" + money(totals.cost)],
          ["Ganancia proyectada", money(totals.profit)],
        ].map(([k, v], i) => (
          <View key={k} style={s.between}>
            <Text style={[s.body, i === 3 && { fontWeight: "700" }]}>{k}</Text>
            <Text style={[s.body, { fontWeight: i === 3 ? "700" : "500", color: i === 3 ? (totals.profit >= 0 ? C.green : C.red) : C.ink }]}>{v}</Text>
          </View>
        ))}
      </View>
      {shownRows.map((r) => (
        <View key={r.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderColor: C.line }}>
          <Text style={[s.body, { fontWeight: "600" }]} numberOfLines={1}>
            {r.name}
          </Text>
          <Note color={r.profit < 0 ? C.red : undefined}>
            {`Costo ${money(r.cost)} · cliente paga ${money(r.client)} · comisión ${money(r.fee)} · ganas ${money(r.profit)} (${r.pct.toFixed(1)}%)`}
          </Note>
          <Note>{`${r.units} en existencia → ganancia proyectada ${money(r.units * r.profit)}`}</Note>
        </View>
      ))}
      {list.length > 12 && <TextButton title={all ? "Ver menos" : `Ver los ${list.length} productos`} onPress={() => setAll((x) => !x)} />}
    </Card>
  );
}
