import React from "react";
import { STORE_NAME, TILE } from "../theme";
import { Alert, Share, View } from "react-native";
import { Text } from "../text";
import { localDay, money, saleSegment, today, type Row } from "../business";
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
  s,
  QuickActions,
  MenuList,
} from "../ui";
import type { Body, OwnerPageContext } from "./ownerContext";
import {
  PERIODS,
  amount,
  minus,
  normalize,
  options,
  periodFrom,
  saleDay,
  strings,
  units,
} from "./ownerShared";
import { ReportsPage } from "./Reports";
import { MarginProjectionCard } from "./OrderImport";

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
    excelOpen,
    openExcel,
    byMethodCard,
    resultCard,
    line,
    divider,
    go,
    open,
    cashAccount,
    exportBackup,
    filters,
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
    productById,
    query,
  } = ctx;
  const d = data!;
  const {
    accounts,
    sales,
    m,
  } = d;
  if (page === "Resumen de ventas") {
    const fromIso = periodFrom(currentPeriod);
    const ps = b!.periodSummary(fromIso);
    return {
      scroll: (
        <>
          <View style={{ marginBottom: 10 }}>
            <Chips
              row
              options={options(PERIODS)}
              value={currentPeriod}
              onChange={setPeriod}
            />
          </View>
          {excelCard("Descargar Excel de ventas")}
          <Card>
            <View style={s.between}>
              <Text style={[s.subtitle, { marginBottom: 0 }]}>Ventas totales</Text>
              {(() => {
                if (!fromIso) return null;
                const now = new Date();
                const prevFromIso =
                  currentPeriod === "Hoy"
                    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString()
                    : currentPeriod === "7 días"
                      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13).toISOString()
                      : new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
                const prevRow = b!.one(
                  "SELECT COALESCE(SUM(total),0) rev FROM sales WHERE status='confirmed' AND created>=? AND created<?",
                  prevFromIso,
                  fromIso,
                );
                const prevRev = Number(prevRow?.rev) || 0;
                if (prevRev <= 0) return null;
                const pct = Math.round(((ps.revenue - prevRev) * 100) / prevRev);
                return (
                  <Pill
                    text={`${pct >= 0 ? "+" : ""}${pct}% vs. periodo previo`}
                    tone={pct >= 0 ? "ok" : "warn"}
                  />
                );
              })()}
            </View>
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
          </Card>
          <MarginProjectionCard b={b!} />
          <ReportsPage
            b={b!}
            version={revision}
            embedded
            externalFrom={fromIso}
            externalLabel={currentPeriod}
          />
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
    const day = today();
    const cancelled = sales.filter((v) => v.status === "cancelled");
    // 2.10.4: metadatos de productos vendidos por venta (para filtrar por producto, tipo de suplemento o marca).
    const saleCatalogInfo = (v: Row) => {
      const ls = d.lines.get(v.id) ?? [];
      const types = new Set<string>();
      const brands = new Set<string>();
      const prods = new Set<string>();
      for (const l of ls) {
        const p = productById.get(l.productId);
        const t = String(p?.category || (p ? saleSegment(p) : "") || "").trim();
        const br = String(p?.brand || "").trim();
        const pr = String(p?.familyName || p?.name || l.name || "").trim();
        if (t) types.add(t);
        if (br) brands.add(br);
        if (pr) prods.add(pr);
      }
      return { types, brands, prods };
    };
    const allTypes = new Set<string>();
    const allBrands = new Set<string>();
    const allProds = new Set<string>();
    for (const v of sales) {
      if (v.status === "cancelled" && filter !== "Canceladas") continue;
      const info = saleCatalogInfo(v);
      for (const t of info.types) allTypes.add(t);
      for (const br of info.brands) allBrands.add(br);
      for (const pr of info.prods) allProds.add(pr);
    }
    const typeList = [...allTypes].sort();
    const brandList = [...allBrands].sort();
    const prodList = [...allProds].sort();
    const dimOptions = [
      { id: "Todo", name: "Todo el catálogo" },
      ...(typeList.length ? [{ id: "Tipo", name: "Tipo de suplemento" }] : []),
      ...(brandList.length ? [{ id: "Marca", name: "Marca" }] : []),
      ...(prodList.length ? [{ id: "Producto", name: "Producto" }] : []),
    ];
    const activeDim = dimOptions.some((o) => o.id === filters.VentasDim)
      ? filters.VentasDim
      : "Todo";
    const activeVal =
      activeDim === "Tipo"
        ? typeList.includes(filters.VentasVal)
          ? filters.VentasVal
          : ""
        : activeDim === "Marca"
          ? brandList.includes(filters.VentasVal)
            ? filters.VentasVal
            : ""
          : activeDim === "Producto"
            ? prodList.includes(filters.VentasVal)
              ? filters.VentasVal
              : ""
            : "";
    const qNorm = normalize(query);
    let list = sales.filter((v) => {
      const statusOk =
        filter === "Canceladas"
          ? v.status === "cancelled"
          : v.status === "confirmed" &&
            (filter === "Por cobrar"
              ? v.paid < v.total
              : filter === "Hoy"
                ? saleDay(v) === day
                : true);
      if (!statusOk) return false;
      const info = saleCatalogInfo(v);
      if (activeDim === "Tipo" && activeVal && !info.types.has(activeVal))
        return false;
      if (activeDim === "Marca" && activeVal && !info.brands.has(activeVal))
        return false;
      if (activeDim === "Producto" && activeVal && !info.prods.has(activeVal))
        return false;
      if (!qNorm) return true;
      const hay = normalize(
        [
          v.customer,
          v.folio,
          v.channel,
          v.seller,
          ...info.prods,
          ...info.brands,
          ...info.types,
        ].join(" "),
      );
      return hay.includes(qNorm);
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
              const ps = d.todaySales;
              return (
                <>
                  <Card>
                    <Text style={[s.label, { marginLeft: 0, marginTop: 0 }]}>Vendido hoy</Text>
                    <Text style={{ fontSize: 36, fontWeight: "700", color: C.ink, fontVariant: ["tabular-nums"] }}>
                      {money(ps.revenue)}
                    </Text>
                    <Text style={s.muted}>
                      {`${ps.orders} ${ps.orders === 1 ? "venta" : "ventas"}`}
                      {m.receivable > 0 ? ` · Por cobrar ${money(m.receivable)}` : ""}
                    </Text>
                  </Card>
                  <QuickActions
                    items={[
                      { label: "Corte de caja", icon: "calculator", onPress: () => go("Corte de caja") },
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
            {searchBox("Buscar cliente, folio, producto o marca")}
            <View style={{ marginBottom: 6 }}>
              <Chips
                row
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
              <View style={{ marginBottom: 6 }}>
                <Chips
                  row
                  options={payOptions}
                  value={payFilter}
                  onChange={(v) =>
                    setFilters((old) => ({ ...old, VentasPago: v }))
                  }
                />
              </View>
            )}
            {dimOptions.length > 1 && (
              <View style={{ marginBottom: activeDim !== "Todo" ? 6 : 10 }}>
                <Chips
                  row
                  options={dimOptions}
                  value={activeDim}
                  onChange={(v) =>
                    setFilters((old) => ({
                      ...old,
                      VentasDim: v,
                      VentasVal: "",
                    }))
                  }
                />
              </View>
            )}
            {activeDim !== "Todo" && (
              <View style={{ marginBottom: 10 }}>
                <Chips
                  row
                  options={(activeDim === "Tipo"
                    ? typeList
                    : activeDim === "Marca"
                      ? brandList
                      : prodList
                  ).map((name) => ({ id: name, name }))}
                  value={activeVal}
                  allowEmpty="Todos"
                  onChange={(v) =>
                    setFilters((old) => ({ ...old, VentasVal: v }))
                  }
                />
              </View>
            )}
            {filter === "Canceladas" ? (
              <>
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
            <Text style={s.subtitle}>Efectivo</Text>
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
          </Card>
          {!!items.length && (
            <Card>
              <Text style={s.subtitle}>Productos vendidos</Text>
              {items.map((i) => line(i.name, units(i.qty)))}
            </Card>
          )}
          <Button
            icon="share-2" title="Compartir corte"
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
