import React from "react";
import { STORE_NAME, TILE } from "../theme";
import { Alert, Pressable, Share, View } from "react-native";
import { Text } from "../text";
import { cardFee, feeLabel, grossUp, localDay, money, today, type Row } from "../business";
import { salesReport } from "../reports";
import { TextInput } from "../text";
import { cardLabel, terminalPayments } from "../receipt";
import {
  Button,
  C,
  Card,
  Chips,
  Note,
  Pill,
  fmtDay,
  s,
  QuickActions,
  MenuList,
  TextButton,
  Icon,
} from "../ui";
import type { Body, OwnerPageContext } from "./ownerContext";
import {
  amount,
  minus,
  normalize,
  CORTE_DEFAULT,
  MONTHS_ES,
  corteRange,
  hourLabel,
  monthWeeks,
  saleDay,
  strings,
  units,
} from "./ownerShared";
import { ReportsPage } from "./Reports";

/** «2026-11-11» ± n días. */
function addDaysIso(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

const DEFAULT_CASH_ASIDE: Row = { amount: 210000, holder: "Gustavo", note: "Efectivo en resguardo" };
/** 2.11 · Efectivo en resguardo (por ejemplo, el que tiene Gustavo): queda registrado pero no se suma. */
function CashAsideNote({ b, aside, amount: amt, act }: { b: any; aside: Row; amount: number; act: (fn: () => void, done?: string) => boolean }) {
  const [edit, setEdit] = React.useState(false);
  const [money_, setMoney] = React.useState(amt ? String(amt / 100) : "");
  const [holder, setHolder] = React.useState(String(aside.holder || ""));
  const [note, setNote] = React.useState(String(aside.note || ""));
  if (!edit)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Efectivo en resguardo" onPress={() => setEdit(true)} style={{ marginTop: 10, backgroundColor: C.soft, borderRadius: 12, padding: 10 }}>
        <Text style={[s.body, { fontWeight: "600" }]}>
          {amt ? `Efectivo en resguardo: ${money(amt)}${aside.holder ? ` · lo tiene ${aside.holder}` : ""}` : "＋ Anotar efectivo en resguardo"}
        </Text>
        <Note>{amt ? `${aside.note ? aside.note + " · " : ""}No se suma en ningún mes. Toca para editar.` : "Efectivo que existe pero no cuenta en el mes (por ejemplo, el que tiene Gustavo)."}</Note>
      </Pressable>
    );
  return (
    <View style={{ marginTop: 10, backgroundColor: C.soft, borderRadius: 12, padding: 10, gap: 6 }}>
      <Text style={[s.body, { fontWeight: "600" }]}>Efectivo en resguardo (no se suma)</Text>
      <TextInput accessibilityLabel="Importe en resguardo" style={s.input} value={money_} onChangeText={setMoney} keyboardType="decimal-pad" placeholder="Importe MXN" placeholderTextColor={C.muted} />
      <TextInput accessibilityLabel="Quién lo tiene" style={s.input} value={holder} onChangeText={setHolder} placeholder="¿Quién lo tiene? (ej. Gustavo)" placeholderTextColor={C.muted} />
      <TextInput accessibilityLabel="Nota del resguardo" style={s.input} value={note} onChangeText={setNote} placeholder="Nota (opcional)" placeholderTextColor={C.muted} />
      <View style={[s.row, { marginVertical: 0 }]}>
        <Button
          title="Guardar"
          small
          onPress={() => {
            const c = Math.round(Number(String(money_).replace(/[$,\s]/g, "")) * 100);
            if (act(() => b.setSetting("cashAside", { amount: Number.isFinite(c) && c > 0 ? c : 0, holder: holder.trim().slice(0, 40), note: note.trim().slice(0, 120), at: new Date().toISOString() }), "Efectivo en resguardo guardado"))
              setEdit(false);
          }}
        />
        <Button title="Cancelar" secondary small onPress={() => setEdit(false)} />
      </View>
    </View>
  );
}

export function renderSalesPages(ctx: OwnerPageContext): Body | null {
  if (
    ![
      "Resumen de ventas",
      "Control Operativo",
      "Detalle venta",
      "Ventas",
      "Corte de caja",
      "Reportes",
    ].includes(ctx.page)
  )
    return null;
  const {
    data,
    page,
    b,
    excelCard,
    excelOpen,
    openExcel,
    byMethodCard,
    line,
    divider,
    go,
    open,
    cashAccount,
    exportBackup,
    filters,
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
    corteDay,
    setCorteDay,
    revision,
    query,
  } = ctx;
  const d = data!;
  const {
    accounts,
    sales,
    m,
  } = d;
  if (page === "Resumen de ventas") {
    // 2.11 · Resumen mensual sencillo: empieza en 0 cada mes; se puede ver por semana.
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthKey = /^\d{4}-\d{2}$/.test(filters.ResMes || "") ? filters.ResMes : curKey;
    const [my, mm] = monthKey.split("-").map(Number);
    const mStart = new Date(my, mm - 1, 1);
    const mEnd = new Date(my, mm, 1);
    const weeks = monthWeeks(mStart, mEnd);
    const wi = Number(filters.ResSem);
    const week = filters.ResSem !== "" && filters.ResSem !== undefined && Number.isInteger(wi) && weeks[wi] ? weeks[wi] : null;
    const from = (week ? week.from : mStart).toISOString();
    const to = (week ? week.to : mEnd).toISOString();
    const ps = b!.periodSummary(from, to);
    const monthName = MONTHS_ES[mm - 1];
    const shiftMonth = (n: number) => {
      const t = new Date(my, mm - 1 + n, 1);
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
      if (key > curKey) return;
      setFilters((old) => ({ ...old, ResMes: key, ResSem: "" }));
    };
    const expenses = b!.all(
      "SELECT l.*,a.name account FROM ledger l JOIN accounts a ON a.id=l.accountId WHERE l.kind='expense' AND l.note NOT LIKE 'Comisión tarjeta%' AND l.created>=? AND l.created<? ORDER BY l.created",
      from,
      to,
    );
    // 2.11.2: de entrada, los $2,100 en efectivo que tiene Gustavo (se puede editar).
    const aside: Row = b!.setting("cashAside", null) || DEFAULT_CASH_ASIDE;
    const asideAmt = Number(aside.amount) || 0;
    const sellers = salesReport(b!, { from, to }).sellers;
    const profit = ps.revenue - ps.cost - ps.fees;
    // Proyección: vender todo el stock (supuesto: todo con tarjeta; el cliente absorbe la comisión).
    const proj = (b!.stock() as Row[])
      .filter((p) => !p.archived && Number(p.stock) > 0)
      .reduce(
        (n, p) => {
          const q = Number(p.stock);
          const charged = grossUp(p.price, d.feeBps) * q;
          n.cost += Number(p.value) || 0;
          n.charged += charged;
          n.receive += p.price * q;
          n.fee += cardFee(charged, d.feeBps);
          n.pieces += q;
          return n;
        },
        { cost: 0, charged: 0, receive: 0, fee: 0, pieces: 0 },
      );
    const periodLabel = week ? week.label : `${monthName} ${my}`;
    return {
      scroll: (
        <>
          <View style={[s.between, { marginBottom: 8 }]}>
            <Button title="‹" secondary small onPress={() => shiftMonth(-1)} />
            <Text style={[s.subtitle, { marginBottom: 0, flex: 1, textAlign: "center" }]}>{`${monthName[0].toUpperCase()}${monthName.slice(1)} ${my}`}</Text>
            <Button title="›" secondary small disabled={monthKey >= curKey} onPress={() => shiftMonth(1)} />
          </View>
          <View style={{ marginBottom: 10 }}>
            <Chips
              row
              options={[{ id: "", name: "Todo el mes" }, ...weeks.map((w, i) => ({ id: String(i), name: w.label }))]}
              value={week ? String(wi) : ""}
              onChange={(v) => setFilters((old) => ({ ...old, ResSem: v }))}
            />
          </View>
          <Card>
            <Text style={[s.label, { marginLeft: 0, marginTop: 0 }]}>{`Ventas totales · ${periodLabel}`}</Text>
            <Text style={{ fontSize: 34, fontWeight: "700", color: C.ink, fontVariant: ["tabular-nums"] }}>{money(ps.revenue)}</Text>
            <Note>{`${ps.orders} ${ps.orders === 1 ? "venta" : "ventas"}${ps.orders ? ` · ticket promedio ${money(ps.ticket)}` : ""}`}</Note>
          </Card>
          <Card>
            <Text style={s.subtitle}>Ventas por forma de pago</Text>
            {ps.byMethod.map((x: Row) =>
              x.method === "Tarjeta" ? (
                <View key="Tarjeta">
                  {line("Terminal Mercado Pago", money(x.gross))}
                  {line(`Comisión Mercado Pago ${feeLabel(d.feeBps)}`, minus(x.fee), { indent: true, color: C.red })}
                  {line("Neto terminal", money(x.net), { indent: true })}
                </View>
              ) : (
                <View key={x.method}>{line(x.method, money(x.gross))}</View>
              ),
            )}
            {!ps.byMethod.length && <Note>Sin cobros en este periodo.</Note>}
          </Card>
          {expenses.length > 0 && (
            <Card>
              <Text style={s.subtitle}>Gastos operativos</Text>
              {expenses.map((x) => (
                <View key={x.id}>{line(`${x.note} · ${x.account}`, minus(-x.amount), { color: C.red })}</View>
              ))}
              {divider()}
              {line("Total de gastos", minus(ps.expenses), { bold: true, color: C.red })}
            </Card>
          )}
          <Card tone="ok">
            <Text style={s.subtitle}>Disponible</Text>
            {line("Ventas cobradas (netas de comisión)", money(ps.netSales))}
            {ps.expenses > 0 && line("Gastos operativos", minus(ps.expenses), { color: C.red })}
            {divider()}
            {line(`Disponible · ${periodLabel}`, money(ps.available), { bold: true, color: ps.available >= 0 ? C.green : C.red })}
            <CashAsideNote b={b!} aside={aside} amount={asideAmt} act={act} />
          </Card>
          <Card>
            <Text style={s.subtitle}>Utilidad</Text>
            {line("Ventas (precio de venta)", money(ps.revenue))}
            {line("Costo de la mercancía (precio de compra)", minus(ps.cost), { color: C.red })}
            {ps.fees > 0 && line("Comisiones de tarjeta", minus(ps.fees), { color: C.red })}
            {divider()}
            {line("Utilidad", `${money(profit)}${ps.revenue ? ` · ${Math.round((profit / ps.revenue) * 100)}%` : ""}`, { bold: true, color: profit >= 0 ? C.green : C.red })}
            {ps.expenses > 0 && line("Utilidad después de gastos", money(profit - ps.expenses), { color: profit - ps.expenses >= 0 ? C.green : C.red })}
          </Card>
          <Card>
            <Text style={s.subtitle}>Margen y proyección del stock</Text>
            {line(`Stock a costo · ${units(proj.pieces)}`, money(proj.cost))}
            {line("Venta proyectada (todo el stock)", money(proj.charged))}
            {line(`Comisión de tarjeta ${feeLabel(d.feeBps)} (supuesto: todo con tarjeta)`, minus(proj.fee), { color: C.red })}
            {line("Costo de la mercancía", minus(proj.cost), { color: C.red })}
            {divider()}
            {line(
              "Ganancia proyectada",
              `${money(proj.charged - proj.fee - proj.cost)}${proj.charged ? ` · ${Math.round(((proj.charged - proj.fee - proj.cost) / proj.charged) * 100)}%` : ""}`,
              { bold: true, color: C.green },
            )}
          </Card>
          <Card>
            <Text style={s.subtitle}>Por vendedor</Text>
            {sellers.length ? (
              sellers.map((x) => (
                <View key={x.seller}>
                  {line(
                    `${/^t[uú] \(due[ñn]o\)$/i.test(x.seller) ? "Dueño" : x.seller} · ${x.sales} ${x.sales === 1 ? "venta" : "ventas"}`,
                    money(x.charged),
                  )}
                </View>
              ))
            ) : (
              <Note>Sin ventas en este periodo.</Note>
            )}
            <Note>Al cobrar eliges quién vendió (Dueño o tu vendedora).</Note>
          </Card>
          <Button title="Ver ventas y su desglose" onPress={() => go("Ventas")} />
        </>
      ),
    };
  }

  if (page === "Control Operativo") {
    const rows = b!.operatingControl();
    return {
      scroll: (
        <>
          <Card>
            <Text style={s.subtitle}>Gastos operativos</Text>
            <Text style={s.price}>{money(m.operatingOutflows)}</Text>
          </Card>
          <Button
            title="＋ Registrar gasto"
            onPress={() =>
              open("Movimiento", { kind: "expense", accountId: cashAccount() })
            }
          />
          <View style={{ height: 8 }} />
          {rows
            .filter((x) => !x.isFee)
            .map((x) => (
              <Card key={x.id}>
                <View style={s.between}>
                  <Text style={[s.subtitle, { flex: 1 }]}>{x.note}</Text>
                  <Text style={s.price}>{money(-x.amount)}</Text>
                </View>
                <Note>
                  {fmtDay(localDay(x.created))} · {x.account}
                </Note>
              </Card>
            ))}
          <Card>
            <Text style={s.subtitle}>Comisiones de tarjeta</Text>
            <Text style={s.price}>{money(m.fees)}</Text>
          </Card>
        </>
      ),
    };
  }

  if (page === "Detalle venta") {
    let v: Row | null = null;
    try {
      v = saleDetailId ? b!.saleDetail(saleDetailId) : null;
    } catch {
      v = null;
    }
    if (!v) return { scroll: <Note>Esta venta ya no está disponible.</Note> };
    const balance = Math.max(0, v.total - v.paid);
    return {
      scroll: (
        <>
          <Card>
            <View style={s.between}>
              <Text style={[s.subtitle, { flex: 1 }]}>
                {v.folio || v.id.slice(-8).toUpperCase()}
              </Text>
              <Pill
                text={
                  v.status === "cancelled"
                    ? "Cancelada"
                    : balance
                      ? "Saldo " + money(balance)
                      : "Pagada"
                }
                tone={
                  v.status === "cancelled" ? "bad" : balance ? "warn" : "ok"
                }
              />
            </View>
            <Text style={[s.muted, { fontSize: 13 }]}>
              {v.customer || "Público general"} · {fmtDay(saleDay(v))}
              {v.channel && !/^sin canal/i.test(String(v.channel)) ? ` · ${v.channel}` : ""}
            </Text>
            <Text style={{ fontSize: 34, fontWeight: "700", color: C.ink, marginTop: 10, fontVariant: ["tabular-nums"] }}>
              {money(v.total)}
            </Text>
            {balance > 0 && (
              <Text style={s.muted}>{`Cobrado ${money(v.paid)} · Saldo ${money(balance)}`}</Text>
            )}
            {/* 2.9: los datos extra en una sola línea. */}
            {(!!v.mpOrderId || !!v.seller || !!v.revisions) && (
              <Note>
                {[
                  v.mpOrderId ? "Terminal Mercado Pago" : "",
                  v.seller ? `Vendió ${v.seller}` : "",
                  v.revisions ? `Modificada ${v.revisions === 1 ? "1 vez" : `${v.revisions} veces`}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Note>
            )}
            {!!v.notes && <Note>{v.notes}</Note>}
            {v.status === "confirmed" && balance > 0 && (
              <Button
                title="Abonar"
                onPress={() =>
                  open("Abono", {
                    saleId: v.id,
                    amount: amount(balance),
                    accountId: cashAccount(),
                  })
                }
              />
            )}
          </Card>
          {v.status === "confirmed" && (
            <MenuList
              items={[
                {
                  key: "receipt",
                  title: "Enviar comprobante",
                  icon: "send",
                  tint: TILE.blue,
                  onPress: () => void sendReceipt(v),
                },
                {
                  key: "revise",
                  title: "Devolver productos / modificar venta",
                  icon: "undo-2",
                  tint: TILE.gold,
                  onPress: () => openRevise(v),
                },
                {
                  key: "follow",
                  title: "Editar seguimiento",
                  icon: "pencil",
                  tint: TILE.graphite,
                  onPress: () => open("Editar venta", strings(v)),
                },
                {
                  key: "cancel",
                  title: "Cancelar venta",
                  icon: "x",
                  tint: TILE.red,
                  danger: true,
                  onPress: () =>
                        v.mpOrderId && mpCfg
                          ? Alert.alert(
                              "Cancelar y devolver",
                              "Esta venta se cobró en tu terminal Mercado Pago. Confirma solo si te regresaron toda la mercancía en estado vendible.",
                              [
                                { text: "Volver", style: "cancel" },
                                {
                                  text: "Solo cancelar en la app",
                                  onPress: () =>
                                    act(
                                      () => b!.cancel(v.id),
                                      "Venta cancelada",
                                    ),
                                },
                                {
                                  text: "Devolver en Mercado Pago y cancelar",
                                  style: "destructive",
                                  onPress: async () => {
                                    // Primero se valida que la venta sí se puede cancelar: nunca se devuelve dinero sin cancelarla.
                                    try {
                                      b!.dryRun(() => b!.cancel(v.id));
                                    } catch (e) {
                                      return Alert.alert(
                                        "No se puede cancelar",
                                        errText(e) +
                                          " No se devolvió nada en Mercado Pago.",
                                      );
                                    }
                                    // Venta y abonos cobrados en la terminal: se devuelve cada cobro.
                                    const orders = [
                                      ...new Set(
                                        terminalPayments(v)
                                          .map((x: Row) =>
                                            String(x.orderId || ""),
                                          )
                                          .filter(Boolean),
                                      ),
                                    ];
                                    const done: string[] = [];
                                    for (const orderId of orders) {
                                      try {
                                        await mpClient().refundOrder(orderId);
                                        done.push(orderId);
                                      } catch (e) {
                                        if (!done.length)
                                          return Alert.alert(
                                            "Mercado Pago no devolvió el cobro",
                                            errText(e) +
                                              " La venta sigue activa.",
                                          );
                                        return Alert.alert(
                                          "Devolución incompleta",
                                          `Se devolvieron ${done.length} de ${orders.length} cobros en Mercado Pago (${errText(e)}). La venta sigue activa: devuelve el resto desde Mercado Pago y después usa “Solo cancelar en la app”.`,
                                        );
                                      }
                                    }
                                    act(
                                      () => b!.cancel(v.id),
                                      orders.length > 1
                                        ? `${orders.length} cobros devueltos y venta cancelada`
                                        : "Cobro devuelto y venta cancelada",
                                    );
                                  },
                                },
                              ],
                            )
                          : Alert.alert(
                              "Cancelar y devolver",
                              "Solo confirma si devolviste toda la mercancía en estado vendible. Se devuelve el cobro; las comisiones de tarjeta permanecen como gasto.",
                              [
                                { text: "Volver", style: "cancel" },
                                {
                                  text: "Confirmar devolución",
                                  style: "destructive",
                                  onPress: () =>
                                    act(
                                      () => b!.cancel(v.id),
                                      "Venta cancelada",
                                    ),
                                },
                              ],
                            ),
                },
              ]}
            />
          )}
          {v.status === "cancelled" && (
            <Card>
              <Button
                icon="trash-2" title="Eliminar venta cancelada"
                danger
                small
                onPress={() => confirmDeleteSale(v, back)}
              />
            </Card>
          )}
          <Card>
            <Text style={s.subtitle}>Productos</Text>
            {v.lines.map((l: Row, i: number) => (
              <View
                key={l.id}
                style={{ paddingVertical: 8, borderTopWidth: i ? 0.5 : 0, borderTopColor: C.inputLine }}
              >
                <View style={[s.between, { gap: 8 }]}>
                  <Text style={[s.body, { flex: 1 }]} numberOfLines={2}>{`${l.qty} × ${l.name}`}</Text>
                  {l.total !== null && <Text style={[s.body, { fontWeight: "600" }]}>{money(l.total)}</Text>}
                </View>
                <Text style={[s.muted, { fontSize: 12.5 }]}>
                  {l.total === null ? `${l.sku} · venta antigua sin precio por renglón` : `${l.sku} · ${money(l.unitPrice)} c/u · costo ${money(l.cost)}`}
                </Text>
              </View>
            ))}
          </Card>
          <Card>
            <Text style={s.subtitle}>Cobros</Text>
            {v.movements
              .filter((x: Row) => ["sale", "refund"].includes(x.kind))
              .map((x: Row) => (
                <Text key={x.id} style={s.body}>
                  {x.kind === "refund" || x.amount < 0
                    ? x.kind === "refund"
                      ? "Devolución total"
                      : "Devolución parcial"
                    : "Cobro"}{" "}
                  · {x.account} · {money(x.amount)} ·{" "}
                  {fmtDay(localDay(x.created))}
                </Text>
              ))}
            {v.commission > 0 && (
              <Note>{`Tu precio ${money(v.basePrice)} + comisión del cliente ${money(v.commission)}`}</Note>
            )}
            {v.fees > 0 && <Note>{`Comisión Mercado Pago ${money(v.fees)}`}</Note>}
            {terminalPayments(v).map((x: Row, i: number) => (
              <View
                key={x.orderId || i}
                style={{
                  marginTop: 10,
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: C.line,
                }}
              >
                <Text style={[s.body, { fontWeight: "700" }]}>
                  {x.kind === "abono" ? "Abono" : "Cobro"} en terminal
                  {x.amount || x.card?.amount
                    ? ` · ${money(x.card?.amount || x.amount)}`
                    : ""}
                </Text>
                <Note>
                  {cardLabel(x.card || {})}
                  {x.card?.authorization
                    ? ` · Aut. ${x.card.authorization}`
                    : ""}
                  {x.card?.operation ? ` · Op. ${x.card.operation}` : ""}
                </Note>
                {!!x.feeId && (
                  <Note>
                    {x.realFee !== undefined
                      ? `Comisión real Mercado Pago: ${money(x.realFee)}`
                      : "Comisión estimada; Mercado Pago aún no la confirma"}
                  </Note>
                )}
                <View style={s.wrap}>
                  <Button
                    icon="send" title="Comprobante de tarjeta"
                    small
                    onPress={() => void sendCardReceipt(v!, x)}
                  />
                  {x.realFee === undefined && !!x.feeId && !!mpCfg && (
                    <Button
                      title="Consultar comisión"
                      secondary
                      small
                      onPress={() => void reconcileFee(v!.id, x, true)}
                    />
                  )}
                </View>
              </View>
            ))}
            <View style={[s.between, { marginTop: 8 }]}>
              <Text style={[s.body, { fontWeight: "600" }]}>{`Recibiste ${money(v.netCollected)}`}</Text>
              <Text style={[s.body, { fontWeight: "700", color: v.profit >= 0 ? C.green : C.red }]}>{`Ganas ${money(v.profit)}`}</Text>
            </View>
          </Card>
        </>
      ),
    };
  }

  if (page === "Ventas") {
    // Las canceladas se ocultan siempre, salvo en su propio filtro.
    const filter =
      filters.Ventas === "Todas" ? "Activas" : filters.Ventas || "Activas";
    const cancelled = sales.filter((v) => v.status === "cancelled");
    const qNorm = normalize(query);
    const rango = filters.VentasRango === "Semana" ? "Semana" : "Mes";
    const nowD = new Date();
    const rangeFrom = (
      rango === "Semana"
        ? new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() - ((nowD.getDay() + 6) % 7))
        : new Date(nowD.getFullYear(), nowD.getMonth(), 1)
    ).toISOString();
    let list = sales.filter((v) => {
      // 2.11: solo las ventas del mes o de la semana (sin filtros de estado ni de cobro).
      const statusOk =
        filter === "Canceladas"
          ? v.status === "cancelled"
          : v.status === "confirmed" && String(v.created) >= rangeFrom;
      if (!statusOk) return false;
      if (!qNorm) return true;
      return normalize([v.customer, v.folio, v.channel, v.seller].join(" ")).includes(qNorm);
    });
    // Filtro por forma de cobro: efectivo, cada cuenta de transferencia (Mercado Pago, Banamex…) y terminal.
    const kindOf = (id: string) =>
      accounts.find((a) => a.id === id)?.kind || "";
    const used = new Set<string>();
    for (const v of sales)
      for (const id of Object.keys(d.payByAccount.get(v.id) || {}))
        used.add(id);
    const payOptions = [
      { id: "Todos", name: "Todos los cobros" },
      ...(accounts.some((a) => a.kind === "Efectivo" && used.has(a.id))
        ? [{ id: "Efectivo", name: "Efectivo" }]
        : []),
      ...accounts
        .filter(
          (a) =>
            (a.kind === "Banco" || a.kind === "Billetera") && used.has(a.id),
        )
        .map((a) => ({ id: "acct:" + a.id, name: `${a.name}` })),
      ...(accounts.some((a) => a.kind === "Tarjeta" && used.has(a.id))
        ? [{ id: "Tarjeta", name: "Terminal (tarjeta)" }]
        : []),
    ];
    const payFilter: string = "Todos";
    const inGroup = (accountId: string) =>
      payFilter.startsWith("acct:")
        ? accountId === payFilter.slice(5)
        : kindOf(accountId) === payFilter;
    const paidBy = (v: Row) =>
      Object.entries(d.payByAccount.get(v.id) || {}).reduce(
        (n, [id, amt]) => n + (inGroup(id) ? (amt as number) : 0),
        0,
      );
    const shown =
      payFilter === "Todos"
        ? list
        : list.filter((v) =>
            Object.entries(d.payByAccount.get(v.id) || {}).some(
              ([id, amt]) => inGroup(id) && (amt as number) !== 0,
            ),
          );
    list = shown;
    const totalShown = list
      .filter((v) => v.status === "confirmed")
      .reduce((n, v) => n + v.total, 0);
    const collectedShown =
      payFilter === "Todos"
        ? 0
        : list
            .filter((v) => v.status === "confirmed")
            .reduce((n, v) => n + paidBy(v), 0);
    return {
      list: {
        data: list,
        header: (
          <>
            {(() => {
              // 2.11.2: el bloque grande sigue al filtro de la lista (mes o semana); hoy va debajo.
              const ps = b!.periodSummary(rangeFrom);
              const hoy = d.todaySales;
              return (
                <>
                  <Card>
                    <Text style={[s.label, { marginLeft: 0, marginTop: 0 }]}>{rango === "Semana" ? "Vendido esta semana" : "Vendido este mes"}</Text>
                    <Text style={{ fontSize: 36, fontWeight: "700", color: C.ink, fontVariant: ["tabular-nums"] }}>
                      {money(ps.revenue)}
                    </Text>
                    <Text style={s.muted}>
                      {`${ps.orders} ${ps.orders === 1 ? "venta" : "ventas"} · hoy ${money(hoy.revenue)} (${hoy.orders})`}
                      {m.receivable > 0 ? ` · Por cobrar ${money(m.receivable)}` : ""}
                    </Text>
                  </Card>
                  <QuickActions
                    items={[
                      { label: "Corte de caja", icon: "calculator", onPress: () => (setFilters((o) => ({ ...o, Corte: "" })), setCorteDay(""), go("Corte de caja")) },
                      { label: "Resumen", icon: "chart-column", onPress: () => go("Resumen de ventas") },
                      {
                        label: "Nuevo gasto",
                        icon: "receipt-text",
                        onPress: () =>
                          open("Movimiento", {
                            kind: "expense",
                            accountId: cashAccount(),
                          }),
                      },
                      { label: "Excel", icon: "download", onPress: openExcel },
                    ]}
                  />
                  {excelOpen && excelCard()}
                </>
              );
            })()}
            <View style={{ marginBottom: 6 }}>
              <Chips
                row
                options={[
                  { id: "Mes", name: "Este mes" },
                  { id: "Semana", name: "Esta semana" },
                ]}
                value={filter === "Canceladas" ? "" : rango}
                onChange={(v) => setFilters((old) => ({ ...old, Ventas: "", VentasRango: v }))}
              />
            </View>
            {filter === "Canceladas" ? (
              <>
                <TextButton title="‹ Volver a las ventas" onPress={() => setFilters((old) => ({ ...old, Ventas: "" }))} />
                <Note>No cuentan en tus ventas ni en reportes.</Note>
                {list.length > 0 && (
                  <Button
                    icon="trash-2" title={`Eliminar ${list.length === 1 ? "la venta cancelada" : `las ${list.length} ventas canceladas`}`}
                    danger
                    small
                    onPress={() => confirmDeleteAllCancelled(list)}
                  />
                )}
              </>
            ) : (
              <Note>
                {list.length} {list.length === 1 ? "venta" : "ventas"} ·{" "}
                {money(totalShown)}
                {payFilter !== "Todos"
                  ? ` · cobrado por ${payOptions.find((o) => o.id === payFilter)?.name || ""}: ${money(collectedShown)}`
                  : ""}
              </Note>
            )}
            {filter !== "Canceladas" && cancelled.length > 0 && (
              <TextButton
                title={`Ver canceladas (${cancelled.length})`}
                color={C.muted}
                onPress={() => setFilters((old) => ({ ...old, Ventas: "Canceladas" }))}
              />
            )}
            <View style={{ height: 8 }} />
          </>
        ),
        item: (v) => {
          const balance = v.total - v.paid;
          const lines = d.lines.get(v.id) ?? [];
          return (
            <Card
              onPress={() => {
                setSaleDetailId(v.id);
                go("Detalle venta");
              }}
            >
              <View style={s.between}>
                <Text style={[s.body, { flex: 1, fontWeight: "600", fontSize: 17 }]} numberOfLines={1}>
                  {v.customer || "Público general"}
                </Text>
                <Text style={[s.price, { fontSize: 18, marginVertical: 0 }]}>{money(v.total)}</Text>
              </View>
              <View style={[s.between, { gap: 8, marginTop: 4 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>
                    {v.folio || v.id.slice(-8).toUpperCase()} ·{" "}
                    {fmtDay(saleDay(v))}
                    {v.channel && !/^sin canal/i.test(String(v.channel)) ? ` · ${v.channel}` : ""}
                    {v.seller ? ` · ${v.seller}` : ""}
                  </Text>
                </View>
                <Pill
                  text={
                    v.status === "cancelled"
                      ? "Cancelada"
                      : balance > 0
                        ? "Saldo " + money(balance)
                        : "Pagada"
                  }
                  tone={
                    v.status === "cancelled"
                      ? "bad"
                      : balance > 0
                        ? "warn"
                        : "ok"
                  }
                />
              </View>
              {lines.length > 0 && (
                <Text style={[s.muted, { marginTop: 6 }]} numberOfLines={1}>
                  {lines.map((l) => `${l.qty} × ${l.name}`).join(" · ")}
                </Text>
              )}
              {v.status === "confirmed" && (() => {
                // 2.11.2 · Con qué se pagó (efectivo, tarjeta o transferencia · cuenta).
                const pays = Object.entries(d.payByAccount.get(v.id) || {}).filter(([, amt]) => (amt as number) > 0);
                const label = (id: string) => {
                  const a = accounts.find((x) => x.id === id);
                  if (!a) return "Cobro";
                  return a.kind === "Efectivo" ? "Efectivo" : a.kind === "Tarjeta" ? "Tarjeta (terminal)" : `Transferencia · ${a.name}`;
                };
                const text = pays.length
                  ? pays.map(([id, amt]) => (pays.length > 1 ? `${label(id)} ${money(amt as number)}` : label(id))).join(" + ")
                  : "Sin cobro";
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <Icon name={pays.some(([id]) => accounts.find((x) => x.id === id)?.kind === "Tarjeta") ? "credit-card" : pays.some(([id]) => accounts.find((x) => x.id === id)?.kind === "Efectivo") ? "banknote" : "landmark"} size={14} color={C.muted} />
                    <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>{text}</Text>
                  </View>
                );
              })()}
              {v.status === "confirmed" && balance > 0 && (
                <Button
                  title="Abonar"
                  small
                  onPress={() =>
                    open("Abono", {
                      saleId: v.id,
                      amount: amount(balance),
                      accountId: cashAccount(),
                    })
                  }
                />
              )}
              {v.status === "cancelled" && (
                <Button
                  icon="trash-2" title="Eliminar"
                  danger
                  small
                  onPress={() => confirmDeleteSale(v)}
                />
              )}
            </Card>
          );
        },
        empty: (
          <Note>
            {filter === "Canceladas"
              ? "No hay ventas canceladas."
              : sales.length
                ? "No hay ventas con este filtro."
                : "Tus ventas aparecerán aquí."}
          </Note>
        ),
      },
    };
  }

  if (page === "Corte de caja") {
    // 2.11 · Corte de 6:30 PM a 6:30 PM, con «Cerrar corte» y vista de los últimos 7 días.
    const hhmm = String(b!.setting("corteHour", CORTE_DEFAULT));
    const day = corteDay || today();
    const { from, to } = corteRange(day, hhmm);
    const nowIso = new Date().toISOString();
    const closedOf = (dd: string): Row | null => b!.setting("corte:" + dd, null);
    const statusOf = (dd: string): { text: string; tone: "ok" | "warn" | "neutral" } => {
      const c = closedOf(dd);
      if (c) {
        const t = new Date(c.at);
        return { text: `Corte realizado · ${hourLabel(`${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}`)}`, tone: "ok" };
      }
      return nowIso < corteRange(dd, hhmm).to ? { text: `En curso · cierra ${hourLabel(hhmm)}`, tone: "neutral" } : { text: "Corte pendiente", tone: "warn" };
    };
    const mode = filters.Corte === "7" ? "7" : day === today() ? "Hoy" : day === addDaysIso(today(), -1) ? "Ayer" : "";
    const modeChips = (
      <View style={{ marginBottom: 10 }}>
        <Chips
          row
          options={[
            { id: "Hoy", name: "Hoy" },
            { id: "Ayer", name: "Ayer" },
            { id: "7", name: "Últimos 7 días" },
          ]}
          value={mode}
          onChange={(v) => {
            setFilters((old) => ({ ...old, Corte: v === "7" ? "7" : "" }));
            if (v !== "7") setCorteDay(v === "Ayer" ? addDaysIso(today(), -1) : today());
          }}
        />
      </View>
    );
    if (mode === "7") {
      const days = Array.from({ length: 7 }, (_, i) => addDaysIso(today(), -i));
      const rows = days.map((dd) => {
        const r = corteRange(dd, hhmm);
        return { dd, ps: b!.periodSummary(r.from, r.to), st: statusOf(dd) };
      });
      const total = rows.reduce((n, r) => n + r.ps.revenue, 0);
      const orders = rows.reduce((n, r) => n + r.ps.orders, 0);
      const pending = rows.filter((r) => r.st.tone === "warn" && r.ps.orders > 0).length;
      return {
        scroll: (
          <>
            {modeChips}
            <Card>
              <Text style={s.subtitle}>Últimos 7 días</Text>
              <Text style={s.price}>{money(total)}</Text>
              <Note>{`${orders} ${orders === 1 ? "venta" : "ventas"}${pending ? ` · ${pending} ${pending === 1 ? "corte pendiente" : "cortes pendientes"}` : " · cortes al día"}`}</Note>
            </Card>
            {rows.map(({ dd, ps, st }) => (
              <Card
                key={dd}
                onPress={() => {
                  setFilters((old) => ({ ...old, Corte: "" }));
                  setCorteDay(dd);
                }}
              >
                <View style={s.between}>
                  <Text style={[s.body, { fontWeight: "600", flex: 1 }]}>{dd === today() ? "Hoy" : fmtDay(dd)}</Text>
                  <Text style={[s.body, { fontWeight: "700", fontVariant: ["tabular-nums"] }]}>{money(ps.revenue)}</Text>
                </View>
                <View style={[s.between, { marginTop: 4 }]}>
                  <Note>{`${ps.orders} ${ps.orders === 1 ? "venta" : "ventas"}`}</Note>
                  <Pill text={st.text} tone={st.tone} />
                </View>
              </Card>
            ))}
            <Note>{`Cada corte va de las ${hourLabel(hhmm)} del día anterior a las ${hourLabel(hhmm)}.`}</Note>
          </>
        ),
      };
    }
    const ps = b!.periodSummary(from, to);
    const expenses = b!.all(
      "SELECT l.*,a.name account FROM ledger l JOIN accounts a ON a.id=l.accountId WHERE l.kind='expense' AND l.note NOT LIKE 'Comisión tarjeta%' AND l.created>=? AND l.created<? ORDER BY l.created",
      from,
      to,
    );
    const cash = b!.cashSummary(from, to);
    const cancelled = b!.one(
      "SELECT COUNT(*) n FROM sales WHERE status='cancelled' AND created>=? AND created<?",
      from,
      to,
    ).n as number;
    const items = b!.all(
      "SELECT l.name,SUM(l.qty) qty FROM sale_lines l JOIN sales s ON s.id=l.saleId WHERE s.status='confirmed' AND s.created>=? AND s.created<? GROUP BY l.productId ORDER BY qty DESC",
      from,
      to,
    );
    const result = ps.netSales - ps.expenses;
    // 2.11.2: efectivo del corte = cobrado en efectivo − gastos y compras en efectivo (± otros movimientos).
    const cashNet = cash.sales - cash.expenses - cash.purchases + cash.others.reduce((n: number, x: Row) => n + Number(x.amount), 0);
    const shareText = [
      `*Corte de caja · ${STORE_NAME}*`,
      fmtDay(day),
      "",
      `Ventas: ${ps.orders} · ${money(ps.revenue)}`,
      ...ps.byMethod.map((x: Row) =>
        x.method === "Tarjeta"
          ? `Tarjeta: ${money(x.gross)} − comisión ${money(x.fee)} = ${money(x.net)}`
          : `${x.method}: ${money(x.gross)}`,
      ),
      ...(ps.receivable
        ? [`A crédito (por cobrar): ${money(ps.receivable)}`]
        : []),
      ...(ps.commissions
        ? [
            `Comisión absorbida por clientes (incluida): ${money(ps.commissions)}`,
          ]
        : []),
      `Ventas netas: ${money(ps.netSales)}`,
      `Gastos del día: ${money(ps.expenses)}`,
      `*Resultado del día: ${money(result)}*`,
      "",
      `Efectivo de ventas: ${money(cash.sales)}`,
      ...(cash.expenses
        ? [`Gastos pagados en efectivo: ${money(cash.expenses)}`]
        : []),
      ...(cash.purchases
        ? [`Compras pagadas en efectivo: ${money(cash.purchases)}`]
        : []),
      ...cash.others.map((x: Row) => `${x.label}: ${money(x.amount)}`),
      `*Efectivo del corte: ${money(cashNet)}*`,
      ...(cancelled ? [`Ventas canceladas: ${cancelled}`] : []),
      ...(items.length
        ? [
            "",
            "Productos vendidos:",
            ...items.map((i) => `${i.qty} × ${i.name}`),
          ]
        : []),
    ].join("\n");
    return {
      scroll: (
        <>
          {modeChips}
          <Card>
            <View style={[s.between, { gap: 8 }]}>
              <Text style={[s.subtitle, { flex: 1 }]}>{day === today() ? "Corte de hoy" : `Corte del ${fmtDay(day)}`}</Text>
              <Pill text={statusOf(day).text} tone={statusOf(day).tone} />
            </View>
            <Note>{`Del ${fmtDay(addDaysIso(day, -1))} ${hourLabel(hhmm)} al ${fmtDay(day)} ${hourLabel(hhmm)}`}</Note>
            <Text style={s.price}>{money(ps.revenue)}</Text>
            <Note>
              {ps.orders} {ps.orders === 1 ? "venta" : "ventas"}
              {cancelled
                ? ` · ${cancelled} cancelada${cancelled === 1 ? "" : "s"}`
                : ""}
            </Note>
          </Card>
          {byMethodCard(ps)}
          <Card>
            <Text style={s.subtitle}>Gastos del día</Text>
            {expenses.length ? (
              expenses.map((x) =>
                line(`${x.note} · ${x.account}`, minus(-x.amount), {
                  color: C.red,
                }),
              )
            ) : (
              <Note>Sin gastos registrados.</Note>
            )}
            {divider()}
            {line("Ventas netas", money(ps.netSales))}
            {line("Gastos", minus(ps.expenses), { color: C.red })}
            {line("Resultado del día", money(result), {
              bold: true,
              color: result >= 0 ? C.green : C.red,
            })}
          </Card>
          <Card tone="warn">
            {/* 2.11.2: solo el efectivo del corte (sin el saldo acumulado de la caja). */}
            <Text style={s.subtitle}>Efectivo del corte</Text>
            {line("Ventas cobradas en efectivo", money(cash.sales), { bold: true })}
            {!!cash.expenses &&
              line("− Gastos pagados en efectivo", minus(cash.expenses), {
                color: C.red,
              })}
            {!!cash.purchases &&
              line("− Compras pagadas en efectivo", minus(cash.purchases), {
                color: C.red,
              })}
            {cash.others.map((x: Row) =>
              line(
                `${x.amount < 0 ? "−" : "＋"} ${x.label}`,
                x.amount < 0 ? minus(-x.amount) : money(x.amount),
                { indent: true },
              ),
            )}
            {divider()}
            {line("Efectivo que debe haber del corte", money(cashNet), {
              bold: true,
            })}
          </Card>
          {!!items.length && (
            <Card>
              <Text style={s.subtitle}>Productos vendidos</Text>
              {items.map((i) => line(i.name, units(i.qty)))}
            </Card>
          )}
          {!closedOf(day) ? (
            <Button
              icon="lock"
              title="Cerrar corte"
              onPress={() =>
                act(
                  () =>
                    b!.setSetting("corte:" + day, {
                      at: new Date().toISOString(),
                      revenue: ps.revenue,
                      orders: ps.orders,
                      cash: cashNet,
                    }),
                  "Corte cerrado",
                )
              }
            />
          ) : (
            <Note color={C.green}>{`Corte cerrado el ${fmtDay(localDay(closedOf(day)!.at))} · ventas ${money(Number(closedOf(day)!.revenue) || 0)} · caja ${money(Number(closedOf(day)!.cash) || 0)}`}</Note>
          )}
          <Button
            icon="share-2" title="Compartir corte"
            secondary
            onPress={() =>
              void Share.share({ message: shareText }).catch(() => {})
            }
          />
          <Button
            icon="hard-drive" title="Guardar respaldo del día"
            secondary
            onPress={exportBackup}
          />
        </>
      ),
    };
  }

  if (page === "Reportes")
    return { scroll: <ReportsPage b={b!} version={revision} /> };
  return null;
}
