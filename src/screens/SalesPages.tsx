import React from "react";
import { Alert, Share, Text, View } from "react-native";
import { localDay, money, today, type Row } from "../business";
import { cardLabel, terminalPayments } from "../receipt";
import {
  Button,
  C,
  Card,
  Chips,
  DateField,
  Note,
  Pill,
  fmtDay,
  followUpsDue,
  s,
} from "../ui";
import type { Body, OwnerPageContext } from "./ownerContext";
import {
  PERIODS,
  amount,
  minus,
  options,
  periodFrom,
  saleDay,
  strings,
  units,
} from "./ownerShared";
import { ReportsPage } from "./Reports";

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
    exportBackup,
    filters,
    matching,
    searchBox,
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
  } = ctx;
  const d = data!;
  const {
    products,
    customers,
    campaigns,
    companies,
    locations,
    accounts,
    sales,
    lots,
    m,
  } = d;
  const low = products.filter(
    (p) => !p.archived && p.inventoryKnown && p.available <= p.minimum,
  );
  const soon = followUpsDue(customers);
  if (page === "Resumen de ventas") {
    const ps = b!.periodSummary(periodFrom(currentPeriod));
    const top = b!.all(
      "SELECT p.name,SUM(l.qty) qty FROM sale_lines l JOIN sales s ON s.id=l.saleId JOIN products p ON p.id=l.productId WHERE s.status='confirmed' GROUP BY p.id ORDER BY qty DESC LIMIT 5",
    );
    return {
      scroll: (
        <>
          <View style={{ marginBottom: 10 }}>
            <Chips
              options={options(PERIODS)}
              value={currentPeriod}
              onChange={setPeriod}
            />
          </View>
          {excelCard()}
          <Card>
            <Text style={s.subtitle}>Ventas totales</Text>
            <Text style={s.price}>{money(ps.revenue)}</Text>
            <Note>
              {ps.orders} ventas confirmadas · ticket promedio{" "}
              {money(ps.ticket)}
            </Note>
          </Card>
          {byMethodCard(ps)}
          {resultCard(ps)}
          <Card>
            <Text style={s.subtitle}>Ganancia, mermas y utilidad</Text>
            {line("Ventas totales", money(ps.revenue))}
            {line("Costo de la mercancía vendida", minus(ps.cost), {
              color: C.red,
            })}
            {line(
              "Ganancia bruta",
              money(ps.gross) + " · " + ps.marginPercent.toFixed(2) + "%",
              { bold: true },
            )}
            {divider()}
            {line("Comisiones de tarjeta", minus(ps.fees), { color: C.red })}
            {line("Gastos operativos", minus(ps.expenses), {
              color: C.red,
              onPress: () => go("Control Operativo"),
            })}
            {line("Mermas y ajustes de inventario", minus(ps.shrinkage), {
              color: ps.shrinkage > 0 ? C.red : undefined,
            })}
            {divider()}
            {line("Utilidad estimada", money(ps.profit), {
              bold: true,
              color: ps.profit >= 0 ? C.green : C.red,
            })}
            <Note>
              Las mermas (caducados, dañados, regalos o faltantes del conteo) se
              valúan a su costo de compra. No mueven dinero, por eso no cambian
              el Disponible, pero sí tu utilidad.
            </Note>
          </Card>
          {!!top.length && (
            <Card>
              <Text style={s.subtitle}>Productos más vendidos</Text>
              {top.map((t, i) => (
                <View key={i} style={s.between}>
                  <Text style={[s.body, { flex: 1 }]} numberOfLines={1}>
                    {i + 1}. {t.name}
                  </Text>
                  <Text style={[s.body, { fontWeight: "700" }]}>
                    {units(t.qty)}
                  </Text>
                </View>
              ))}
            </Card>
          )}
          <Button
            title="Ver ventas y su desglose"
            onPress={() => go("Ventas")}
          />
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
            <Note>
              Registros de inversión local y gastos capturados en la app.
            </Note>
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
            <Note>Se muestran aparte de la inversión local.</Note>
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
            <Note>
              {v.customer || "Público general"} · {fmtDay(saleDay(v))} ·{" "}
              {v.channel}
            </Note>
            <Text style={s.price}>{money(v.total)}</Text>
            <Text style={s.body}>
              Cobrado {money(v.paid)} · Saldo {money(balance)}
            </Text>
            {!!v.mpOrderId && (
              <Note>🏧 Cobrado en terminal Mercado Pago · {v.mpOrderId}</Note>
            )}
            {!!v.seller && (
              <Note>{`👤 Vendida por ${v.seller} desde su teléfono`}</Note>
            )}
            {!!v.revisions && (
              <Note>
                ✏️ Modificada{" "}
                {v.revisions === 1 ? "1 vez" : `${v.revisions} veces`}{" "}
                (devoluciones o cambios de productos).
              </Note>
            )}
            {!!v.cardFeePassed && (
              <Note>
                Incluye {money(v.cardFeePassed)} de comisión de tarjeta cobrada
                al cliente (precio {money(v.basePrice)}).
              </Note>
            )}
            {!!v.notes && <Note>{v.notes}</Note>}
            {v.status === "confirmed" && (
              <Button
                title="📲 Enviar comprobante"
                secondary
                small
                onPress={() => void sendReceipt(v)}
              />
            )}
            {v.status === "confirmed" && (
              <>
                {balance > 0 && (
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
                <Button
                  title="↩️ Devolver productos / modificar venta"
                  secondary
                  small
                  onPress={() => openRevise(v)}
                />
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Editar seguimiento"
                      secondary
                      small
                      onPress={() => open("Editar venta", strings(v))}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Cancelar venta"
                      danger
                      small
                      onPress={() =>
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
                            )
                      }
                    />
                  </View>
                </View>
              </>
            )}
            {v.status === "cancelled" && (
              <>
                <Button
                  title="🗑 Eliminar venta cancelada"
                  danger
                  small
                  onPress={() => confirmDeleteSale(v, back)}
                />
                <Note>
                  Si fue una venta de prueba o un error, elimínala para que no
                  aparezca en ningún reporte.
                </Note>
              </>
            )}
          </Card>
          <Card>
            <Text style={s.subtitle}>Desglose de productos</Text>
            {v.lines.map((l: Row) => (
              <View
                key={l.id}
                style={{
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: C.line,
                }}
              >
                <Text style={s.body}>
                  {l.qty} × {l.name}
                </Text>
                <Note>{l.sku}</Note>
                {l.total === null ? (
                  <Note>
                    Esta venta histórica conserva el total, pero no tenía precio
                    por renglón.
                  </Note>
                ) : (
                  <>
                    <Note>
                      Precio unitario registrado: {money(l.unitPrice)}
                    </Note>
                    <Text style={s.body}>
                      Importe: {money(l.total)} · Costo: {money(l.cost)}
                    </Text>
                  </>
                )}
              </View>
            ))}
          </Card>
          <Card>
            <Text style={s.subtitle}>Cobros, comisión y ganancia</Text>
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
              <Text
                style={s.body}
              >{`Tu precio ${money(v.basePrice)} + comisión absorbida por el cliente ${money(v.commission)}`}</Text>
            )}
            <Text style={s.body}>
              Comisión tarjeta (Mercado Pago): {money(v.fees)}
            </Text>
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
                  🏧 {x.kind === "abono" ? "Abono" : "Cobro"} en terminal
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
                    title="📲 Comprobante de tarjeta"
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
            <Text style={s.body}>Cobro neto: {money(v.netCollected)}</Text>
            <Text style={s.body}>Ganancia estimada: {money(v.profit)}</Text>
            <Note>
              La ganancia usa costos registrados/importados; no equivale a
              utilidad fiscal.
            </Note>
          </Card>
        </>
      ),
    };
  }

  if (page === "Ventas") {
    // Las canceladas se ocultan siempre, salvo en su propio filtro.
    const filter =
      filters.Ventas === "Todas" ? "Activas" : filters.Ventas || "Activas";
    const day = today();
    const cancelled = sales.filter((v) => v.status === "cancelled");
    const list = matching(sales).filter((v) =>
      filter === "Canceladas"
        ? v.status === "cancelled"
        : v.status === "confirmed" &&
          (filter === "Por cobrar"
            ? v.paid < v.total
            : filter === "Hoy"
              ? saleDay(v) === day
              : true),
    );
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
        ? [{ id: "Efectivo", name: "💵 Efectivo" }]
        : []),
      ...accounts
        .filter(
          (a) =>
            (a.kind === "Banco" || a.kind === "Billetera") && used.has(a.id),
        )
        .map((a) => ({ id: "acct:" + a.id, name: `🏦 ${a.name}` })),
      ...(accounts.some((a) => a.kind === "Tarjeta" && used.has(a.id))
        ? [{ id: "Tarjeta", name: "🏧 Terminal (tarjeta)" }]
        : []),
    ];
    const payFilter = payOptions.some((o) => o.id === filters.VentasPago)
      ? filters.VentasPago
      : "Todos";
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
    list.splice(0, list.length, ...shown);
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
              const ps = d.todaySales;
              return (
                <Card>
                  <Text style={s.label}>Vendido hoy</Text>
                  <Text style={s.price}>{money(ps.revenue)}</Text>
                  <Note>{`${ps.orders} ${ps.orders === 1 ? "venta" : "ventas"}${m.receivable > 0 ? ` · por cobrar ${money(m.receivable)}` : ""}`}</Note>
                  <View style={s.wrap}>
                    <Button
                      title="🧮 Corte de caja"
                      secondary
                      small
                      onPress={() => go("Corte de caja")}
                    />
                    <Button
                      title="📊 Resumen"
                      secondary
                      small
                      onPress={() => go("Resumen de ventas")}
                    />
                    <Button
                      title="＋ Gasto"
                      secondary
                      small
                      onPress={() =>
                        open("Movimiento", {
                          kind: "expense",
                          accountId: cashAccount(),
                        })
                      }
                    />
                  </View>
                  {excelCard()}
                </Card>
              );
            })()}
            {searchBox("Buscar cliente o folio")}
            <View style={{ marginBottom: 10 }}>
              <Chips
                options={[
                  { id: "Activas", name: "Activas" },
                  { id: "Hoy", name: "Hoy" },
                  { id: "Por cobrar", name: "Por cobrar" },
                  {
                    id: "Canceladas",
                    name: `Canceladas (${cancelled.length})`,
                  },
                ]}
                value={filter}
                onChange={(v) => setFilters((old) => ({ ...old, Ventas: v }))}
              />
            </View>
            {payOptions.length > 2 && (
              <View style={{ marginBottom: 10 }}>
                <Text style={s.label}>Forma de cobro</Text>
                <Chips
                  options={payOptions}
                  value={payFilter}
                  onChange={(v) =>
                    setFilters((old) => ({ ...old, VentasPago: v }))
                  }
                />
              </View>
            )}
            {filter === "Canceladas" ? (
              <>
                <Note>
                  Las ventas canceladas no cuentan en ventas ni en reportes y se
                  ocultan de las demás listas.
                </Note>
                {list.length > 0 && (
                  <Button
                    title={`🗑 Eliminar ${list.length === 1 ? "la venta cancelada" : `las ${list.length} ventas canceladas`}`}
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
                  ? ` · cobrado por ${payOptions.find((o) => o.id === payFilter)?.name.replace(/^\S+\s/, "") || ""}: ${money(collectedShown)}`
                  : ""}
                {cancelled.length
                  ? ` · ${cancelled.length} ${cancelled.length === 1 ? "cancelada oculta" : "canceladas ocultas"}`
                  : ""}
              </Note>
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
                <Text style={[s.subtitle, { flex: 1 }]} numberOfLines={1}>
                  {v.customer || "Público general"}
                </Text>
                <Text style={s.price}>{money(v.total)}</Text>
              </View>
              <View style={[s.between, { gap: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Note>
                    {v.folio || v.id.slice(-8).toUpperCase()} ·{" "}
                    {fmtDay(saleDay(v))} · {v.channel}
                    {v.seller ? ` · ${v.seller}` : ""}
                  </Note>
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
              {lines.slice(0, 3).map((l, i) => (
                <Text key={i} style={s.body} numberOfLines={1}>
                  {l.qty} × {l.name}
                </Text>
              ))}
              {lines.length > 3 && (
                <Note>y {lines.length - 3} productos más</Note>
              )}
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
                  title="🗑 Eliminar"
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
    const day = corteDay || today();
    const [y, mo, dd] = day.split("-").map(Number);
    const from = new Date(y, mo - 1, dd).toISOString();
    const to = new Date(y, mo - 1, dd + 1).toISOString();
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
    const shareText = [
      `*Corte de caja · GNS Nova Negocio*`,
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
      `Caja al abrir: ${money(cash.opening)} · Caja esperada al cierre: ${money(cash.closing)}`,
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
          <DateField
            label="Día del corte"
            value={day}
            onChange={(v) => setCorteDay(v || today())}
            quick={[
              { label: "Hoy", days: 0 },
              { label: "Ayer", days: -1 },
            ]}
            allowEmpty={false}
          />
          <Card>
            <Text style={s.subtitle}>Ventas del día</Text>
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
            <Text style={s.subtitle}>💵 Efectivo</Text>
            {line("Caja al abrir el día", money(cash.opening))}
            {line("＋ Ventas cobradas en efectivo", money(cash.sales))}
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
            {line("Caja esperada al cierre", money(cash.closing), {
              bold: true,
            })}
            <Note>
              Las aportaciones, retiros y traspasos se muestran aparte: no son
              ventas. Cuenta el dinero y compáralo con la caja esperada; si no
              cuadra, registra la diferencia en Cuentas.
            </Note>
          </Card>
          {!!items.length && (
            <Card>
              <Text style={s.subtitle}>Productos vendidos</Text>
              {items.map((i) => line(i.name, units(i.qty)))}
            </Card>
          )}
          <Button
            title="📤 Compartir corte"
            onPress={() =>
              void Share.share({ message: shareText }).catch(() => {})
            }
          />
          <Button
            title="💾 Guardar respaldo del día"
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
