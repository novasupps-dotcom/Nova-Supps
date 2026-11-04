// 2.8 · Stock → «Cargar pedido»: el PDF del pedido del proveedor se vuelve inventario.
// 2.8.1 · Tres pasos, sin texto de más (estilo iPhone):
//   1. Elegir el PDF.
//   2. Revisar: un renglón por producto con su precio (la calculadora queda detrás de un toque).
//   3. Cargar: con qué se pagó y listo.
import * as FS from "expo-file-system/legacy";
import * as Picker from "expo-document-picker";
import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text, TextInput } from "../text";
import { feeLabel, money, type Business, type Row } from "../business";
import { base64ToBytes } from "../photos";
import {
  applySupplierOrder,
  orderCheckpoint,
  planSupplierOrder,
  priceCalc,
  withQuantities,
  readSupplierOrderPdf,
  type GroupDecision,
  type OrderPlan,
  type PriceGroup,
  type SupplierOrder,
} from "../supplierOrder";
import { Button, C, Card, Chips, Note, Steps, TextButton, fmtDay, s, tryCents } from "../ui";

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
  const [step, setStep] = useState(0);
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<Record<string, string | null>>({});
  const [markupText, setMarkupText] = useState(String(b.setting("orderMarkupPct", 30)));
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [account, setAccount] = useState("");
  const [again, setAgain] = useState(false);
  // 2.8.4: piezas que se cargan por renglón (si el dueño las cambia).
  const [qtys, setQtys] = useState<Record<string, string>>({});

  const plan: OrderPlan | null = useMemo(() => (order ? planSupplierOrder(b, order, choices) : null), [b, order, choices]);
  const markup = Math.max(0, Math.min(1000, Number(markupText.replace(",", ".")) || 0));
  const bps = b.feeBps();
  const accounts: Row[] = useMemo(() => b.accounts(), [b, order]);
  const stockOf = useMemo(() => new Map(b.stock().map((p: Row) => [p.id, p.stock])), [b, order]);

  const reset = () => {
    setStep(0);
    setOrder(null);
    setChoices({});
    setPrices({});
    setKeep({});
    setOpen(null);
    setAccount("");
    setAgain(false);
    setQtys({});
  };
  const qtyOf = (it: { key: string; line: { qty: number } }) => {
    const t = qtys[it.key];
    if (t === undefined) return it.line.qty;
    const n = Number(t);
    return Number.isSafeInteger(n) && n >= 0 ? n : it.line.qty;
  };
  async function pick() {
    setError("");
    try {
      const r = await Picker.getDocumentAsync({ type: ["application/pdf"], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.length) return;
      setBusy(true);
      await new Promise((ok) => setTimeout(ok, 30));
      const raw = await FS.readAsStringAsync(r.assets[0].uri, { encoding: FS.EncodingType.Base64 });
      const next = readSupplierOrderPdf(base64ToBytes(raw), r.assets[0].name || "");
      reset();
      setOrder(next);
      setStep(1);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const calcOf = (g: PriceGroup) => {
    const typed = tryCents(prices[g.family] ?? "");
    return priceCalc(g.cost, markup, bps, typed !== null && typed > 0 ? typed : undefined);
  };
  const keepOf = (g: PriceGroup) => g.currentClient !== null && (keep[g.family] ?? true);
  const clientOf = (g: PriceGroup) => (keepOf(g) ? g.currentClient! : calcOf(g).client);

  async function load() {
    if (!plan || busy) return;
    setBusy(true);
    setError("");
    try {
      await keepCopy(b);
      const decisions: Record<string, GroupDecision> = {};
      for (const g of plan.groups) decisions[g.family] = { client: calcOf(g).client, keepCurrent: keepOf(g) };
      b.setSetting("orderMarkupPct", markup);
      const changed: Record<string, number> = {};
      for (const it of plan.items) if (qtyOf(it) !== it.line.qty) changed[it.key] = qtyOf(it);
      const r = applySupplierOrder(b, withQuantities(plan, changed), decisions, account === NO_PAY ? null : account);
      reset();
      onChanged();
      notify(`Pedido cargado · ${r.units} piezas`);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  // ---------------- 1. PDF
  if (step === 0 || !plan)
    return (
      <>
        <Steps step={0} names={["PDF", "Revisar", "Cargar"]} />
        <Card>
          <Text style={s.subtitle}>Pedido del proveedor</Text>
          <Note>El PDF de «Imprimir pedido».</Note>
          <View style={{ height: 8 }} />
          <Button title={busy ? "Leyendo…" : "Elegir PDF"} icon="file-text" disabled={busy} onPress={pick} />
          {!!error && <Note color={C.red}>{error}</Note>}
        </Card>
      </>
    );

  const o = plan.order;

  // ---------------- Punto de control (2.8.2): el pedido ya se cargó → solo confirmar.
  if (step === 1 && plan.duplicate && !again) {
    const cp = orderCheckpoint(b, plan);
    return (
      <>
        <Steps step={0} names={["PDF", "Revisar", "Cargar"]} />
        <Card>
          <Text style={s.subtitle}>Este pedido ya se cargó</Text>
          <Text style={[s.body, { marginTop: 4 }]}>
            {`${cp.when ? `El ${fmtDay(cp.when)}. ` : ""}Actualmente tienes ${cp.have} piezas y vas a agregar ${cp.add} piezas más del ${cp.source}.`}
          </Text>
          <View style={{ height: 8 }} />
          <Button title="Confirmar" onPress={() => setAgain(true)} />
          <Button title="Cancelar" secondary onPress={reset} />
        </Card>
      </>
    );
  }
  const units = plan.items.reduce((n, it) => n + qtyOf(it), 0);
  const created = plan.items.filter((i) => !i.productId && qtyOf(i) > 0).length;
  const existing = new Set(plan.items.filter((i) => i.productId && qtyOf(i) > 0).map((i) => i.productId)).size;
  const projected = plan.groups.reduce((n, g) => {
    const c = priceCalc(g.cost, markup, bps, clientOf(g));
    return n + g.items.reduce((u, i) => u + qtyOf(plan.items[i]), 0) * c.profit;
  }, 0);

  // ---------------- 2. Revisar
  if (step === 1)
    return (
      <>
        <Steps step={1} names={["PDF", "Revisar", "Cargar"]} />
        <Card>
          <View style={s.between}>
            <Text style={[s.body, { fontWeight: "600" }]}>{`#${o.number || "—"} · ${units} piezas`}</Text>
            <Text style={[s.body, { fontWeight: "600" }]}>{money(o.total)}</Text>
          </View>
          <View style={[s.between, { marginTop: 10 }]}>
            <Text style={s.body}>Ganancia</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TextInput
                style={[s.input, { width: 70, textAlign: "right", marginBottom: 0 }]}
                value={markupText}
                onChangeText={(t) => {
                  setMarkupText(t);
                  setPrices({});
                }}
                keyboardType="decimal-pad"
                accessibilityLabel="Porcentaje de ganancia"
              />
              <Text style={s.body}>%</Text>
            </View>
          </View>
          <Text style={[s.muted, { fontSize: 12.5, marginTop: 4 }]}>{`+ terminal ${feeLabel(bps)} · redondeado al peso`}</Text>
          {!!o.warnings.length && (
            <Text style={[s.muted, { fontSize: 12.5, marginTop: 6, color: C.amber }]}>{o.warnings[0]}</Text>
          )}
        </Card>

        <Card>
          {plan.groups.map((g, gi) => {
            const items = g.items.map((i) => plan.items[i]);
            const qty = items.reduce((n, it) => n + qtyOf(it), 0);
            const allNew = items.every((it) => !it.productId);
            const have = [...new Set(items.filter((it) => it.productId).map((it) => it.productId!))].reduce(
              (n, id) => n + (Number(stockOf.get(id)) || 0),
              0,
            );
            const c = priceCalc(g.cost, markup, bps, clientOf(g));
            const doubt = items.find((it) => !it.productId && it.candidates.length);
            const expanded = open === g.family;
            const flavors = items.map((it) => it.line.flavor).filter(Boolean);
            return (
              <View key={g.family} style={{ paddingVertical: 10, borderTopWidth: gi ? 1 : 0, borderColor: C.line }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Pressable
                    style={{ flex: 1 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Detalle de ${g.name}`}
                    onPress={() => setOpen(expanded ? null : g.family)}
                  >
                    <Text style={[s.body, { fontWeight: "600" }]} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text style={[s.muted, { fontSize: 12.5 }]} numberOfLines={1}>
                      {`${allNew ? `${qty} pzas · nuevo` : `Tienes ${have} · +${qty} pzas`}${flavors.length > 1 ? ` · ${flavors.length} sabores` : flavors.length ? ` · ${flavors[0]}` : ""}`}
                    </Text>
                  </Pressable>
                  {keepOf(g) ? (
                    <Text style={[s.body, { fontWeight: "700" }]}>{money(c.client)}</Text>
                  ) : (
                    <TextInput
                      style={[s.input, { width: 96, textAlign: "right", marginBottom: 0, fontWeight: "700" }]}
                      value={prices[g.family] ?? (c.client / 100).toFixed(2)}
                      onChangeText={(t) => setPrices((p) => ({ ...p, [g.family]: t }))}
                      keyboardType="decimal-pad"
                      accessibilityLabel={`Precio de ${g.name}`}
                    />
                  )}
                </View>
                <Text style={[s.muted, { fontSize: 12.5, color: c.profit < 0 ? C.red : C.muted }]}>
                  {`Ganas ${money(c.profit)} c/u (${c.realPct.toFixed(0)}%)`}
                </Text>
                {g.currentClient !== null && (
                  <Chips
                    row
                    options={[
                      { id: "keep", name: `Actual ${money(g.currentClient)}` },
                      { id: "new", name: `Nuevo ${money(priceCalc(g.cost, markup, bps).client)}` },
                    ]}
                    value={keepOf(g) ? "keep" : "new"}
                    onChange={(v) => setKeep((k) => ({ ...k, [g.family]: v === "keep" }))}
                  />
                )}
                {doubt && (
                  <TextButton
                    title={`¿Es tu «${doubt.candidates[0].name}»?`}
                    onPress={() => setChoices((ch) => ({ ...ch, [doubt.key]: doubt.candidates[0].id }))}
                  />
                )}
                {expanded && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={[s.muted, { fontSize: 12.5 }]}>
                      {`Costo ${money(g.cost)} · terminal ${money(c.fee)} · te queda ${money(c.net)}`}
                    </Text>
                    {items.map((it) => (
                      <View key={it.key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                        <TextInput
                          style={[s.input, { width: 52, textAlign: "center", marginBottom: 0, paddingVertical: 4 }]}
                          value={qtys[it.key] ?? String(it.line.qty)}
                          onChangeText={(t) => setQtys((q) => ({ ...q, [it.key]: t.replace(/[^0-9]/g, "") }))}
                          keyboardType="number-pad"
                          accessibilityLabel={`Piezas de ${it.line.flavor || it.line.name}`}
                        />
                        <Text style={[s.muted, { fontSize: 12.5, flex: 1 }]} numberOfLines={1}>
                          {`${it.line.flavor || it.line.name} · ${it.productId ? "ya existe" : it.newSku}${qtyOf(it) !== it.line.qty ? ` · PDF ${it.line.qty}` : ""}`}
                        </Text>
                        {it.productId && (
                          <TextButton title="No es" onPress={() => setChoices((ch) => ({ ...ch, [it.key]: null }))} />
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
        <Button title="Continuar" onPress={() => setStep(2)} />
        <Button title="Cancelar" secondary onPress={reset} />
      </>
    );

  // ---------------- 3. Cargar
  return (
    <>
      <Steps step={2} names={["PDF", "Revisar", "Cargar"]} />
      <Card>
        <Text style={s.subtitle}>{`${units} piezas`}</Text>
        <Text style={[s.muted, { fontSize: 13 }]}>{`${created} nuevos · ${existing} ya los tenías`}</Text>
        <View style={[s.between, { marginTop: 10 }]}>
          <Text style={s.body}>Ganancia si vendes todo</Text>
          <Text style={[s.body, { fontWeight: "700", color: projected >= 0 ? C.green : C.red }]}>{money(projected)}</Text>
        </View>
        {/pendiente/i.test(o.status) && (
          <Text style={[s.muted, { fontSize: 12.5, marginTop: 6, color: C.amber }]}>Pedido pendiente de pago: cárgalo cuando llegue la mercancía.</Text>
        )}
      </Card>
      <Card>
        <Text style={s.subtitle}>{`¿Con qué pagaste ${money(o.total)}?`}</Text>
        <Chips
          options={[...accounts.map((a) => ({ id: a.id, name: a.name })), { id: NO_PAY, name: "No registrar" }]}
          value={account}
          onChange={setAccount}
        />
        {!!error && <Note color={C.red}>{error}</Note>}
      </Card>
      <Button
        title={busy ? "Cargando…" : "Cargar inventario"}
        disabled={busy || !account || (!!plan.duplicate && !again)}
        onPress={() => void load()}
      />
      <Button title="Atrás" secondary disabled={busy} onPress={() => setStep(1)} />
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
      <Text style={s.subtitle}>Margen y proyección</Text>
      <Text style={[s.muted, { fontSize: 12.5 }]}>{`Solo tú lo ves · ${totals.units} piezas en existencia`}</Text>
      <View style={{ marginVertical: 6 }}>
        {[
          ["Si vendes todo", money(totals.revenue)],
          ["Terminal", "−" + money(totals.fees)],
          ["Costo", "−" + money(totals.cost)],
          ["Ganancia", money(totals.profit)],
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
          <Text style={[s.muted, { fontSize: 12.5, color: r.profit < 0 ? C.red : C.muted }]}>
            {`${money(r.client)} · ganas ${money(r.profit)} c/u (${r.pct.toFixed(0)}%) · ${r.units} pzas → ${money(r.units * r.profit)}`}
          </Text>
        </View>
      ))}
      {list.length > 12 && <TextButton title={all ? "Ver menos" : `Ver todos (${list.length})`} onPress={() => setAll((x) => !x)} />}
    </Card>
  );
}
