import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { money, today, type Row } from "../business";
import { whatsappNumber } from "../receipt";
import {
  Button,
  C,
  Card,
  FOLLOW_UP_DAYS,
  Note,
  Pill,
  daysBetween,
  fmtDay,
  followUpLabel,
  followUpsDue,
  s,
} from "../ui";
import type { Body, OwnerPageContext } from "./ownerContext";
import { strings, units } from "./ownerShared";

export function renderCustomersPages(ctx: OwnerPageContext): Body | null {
  if (
    ![
      "Clientes",
      "Campañas",
      "Compañías",
      "Ubicaciones",
      "Oportunidades",
      "Datos importados",
    ].includes(ctx.page)
  )
    return null;
  const {
    data,
    page,
    b,
    open,
    cashAccount,
    filters,
    matching,
    searchBox,
    filterChips,
    query,
    setFilters,
    openSale,
    editCampaign,
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
  if (page === "Clientes") {
    const filter = filters.Clientes || "Todos";
    const soonIds = new Set(soon.map((c) => c.id));
    const list = matching(customers).filter((c) =>
      filter === "Archivados"
        ? c.archived
        : !c.archived &&
          (filter === "Por contactar"
            ? c.nextDate && c.nextDate <= today()
            : filter === "Próximos 5 días"
              ? soonIds.has(c.id)
              : true),
    );
    if (filter === "Próximos 5 días")
      list.sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)));
    return {
      list: {
        data: list,
        header: (
          <>
            <Button title="＋ Cliente" onPress={() => open("Cliente")} />
            {!!soon.length && filter !== "Próximos 5 días" && (
              <Card tone="warn">
                <Text
                  style={s.subtitle}
                >{`🔔 ${soon.length === 1 ? "1 seguimiento próximo" : `${soon.length} seguimientos próximos`}`}</Text>
                {soon.slice(0, 3).map((c) => (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    onPress={() => open("Cliente", strings(c))}
                    style={s.cartRow}
                  >
                    <Text
                      style={[s.body, { flex: 1, fontWeight: "700" }]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <Note color={c.daysLeft < 0 ? C.red : C.amber}>
                      {followUpLabel(c.daysLeft, c.nextDate)}
                    </Note>
                  </Pressable>
                ))}
                <Button
                  title={
                    soon.length > 3
                      ? `Ver los ${soon.length}`
                      : "Ver seguimientos"
                  }
                  secondary
                  small
                  onPress={() =>
                    setFilters((old) => ({
                      ...old,
                      Clientes: "Próximos 5 días",
                    }))
                  }
                />
              </Card>
            )}
            <View style={{ height: 8 }} />
            {searchBox("Buscar nombre o teléfono")}
            {filterChips("Clientes", [
              "Todos",
              "Próximos 5 días",
              "Por contactar",
              "Archivados",
            ])}
          </>
        ),
        item: (c) => {
          const stats = d.byCustomer.get(c.id) ?? { count: 0, total: 0 };
          const late = c.nextDate ? daysBetween(c.nextDate, today()) : null;
          const wa = whatsappNumber(c.phone);
          return (
            <Card>
              <View style={s.between}>
                <Text style={[s.subtitle, { flex: 1 }]}>{c.name}</Text>
                <Pill
                  text={c.stage}
                  tone={
                    c.stage === "Cliente" || c.stage === "Frecuente"
                      ? "ok"
                      : "neutral"
                  }
                />
              </View>
              <Note>{c.phone || "Teléfono pendiente"}</Note>
              {late !== null && (
                <Note color={late >= 0 ? C.red : C.muted}>
                  {late > 0
                    ? `Contactar: vencido hace ${late} ${late === 1 ? "día" : "días"}`
                    : late === 0
                      ? "Contactar: hoy"
                      : `Próximo contacto: ${fmtDay(c.nextDate)}`}
                </Note>
              )}
              {!!c.notes && <Note>{c.notes}</Note>}
              <Text style={s.body}>
                {stats.count} {stats.count === 1 ? "compra" : "compras"} ·{" "}
                {money(stats.total)}
              </Text>
              <View style={s.wrap}>
                {!!c.phone && (
                  <Button
                    title="📞 Llamar"
                    secondary
                    small
                    onPress={() =>
                      Linking.openURL("tel:" + c.phone).catch(() => {})
                    }
                  />
                )}
                {!!wa && (
                  <Button
                    title="💬 WhatsApp"
                    secondary
                    small
                    onPress={() =>
                      Linking.openURL("https://wa.me/" + wa).catch(() => {})
                    }
                  />
                )}
                <Button
                  title="Editar"
                  secondary
                  small
                  onPress={() => open("Cliente", strings(c))}
                />
                <Button
                  title="Nueva venta"
                  small
                  onPress={() => openSale({ customerId: c.id })}
                />
              </View>
            </Card>
          );
        },
        empty: (
          <Card>
            <Text style={s.body}>No hay clientes con este filtro.</Text>
            {!!query && (
              <Button
                title={`＋ Crear "${query}"`}
                secondary
                small
                onPress={() => open("Cliente", { name: query })}
              />
            )}
          </Card>
        ),
      },
    };
  }

  if (page === "Campañas")
    return {
      scroll: (
        <>
          <Button title="＋ Campaña" onPress={() => open("Campaña")} />
          <View style={{ height: 8 }} />
          {searchBox("Buscar campaña o canal")}
          {matching(campaigns).map((c) => (
            <Card key={c.id}>
              <View style={s.between}>
                <Text style={[s.subtitle, { flex: 1 }]}>{c.name}</Text>
                <Pill
                  text={c.status || "Borrador"}
                  tone={c.status === "Activa" ? "ok" : "neutral"}
                />
              </View>
              <Note>
                {c.channel} · {c.code}
              </Note>
              <Text style={s.body}>
                Venta atribuida {money(c.revenue)} · Gasto {money(c.spend)}
              </Text>
              <Note>
                Presupuesto {money(c.budget || 0)} · Margen bruto{" "}
                {money(c.gross)}
              </Note>
              <Note>
                {c.spend
                  ? `ROAS: ${(c.revenue / c.spend).toFixed(2)}×`
                  : "ROAS: pendiente de gasto registrado"}{" "}
                · Resultado atribuido {money(c.gross - c.spend)}
              </Note>
              <View style={s.wrap}>
                <Button
                  title="Actualizar"
                  secondary
                  small
                  onPress={() => editCampaign(c)}
                />
                <Button
                  title="Registrar gasto"
                  secondary
                  small
                  onPress={() =>
                    open("Movimiento", {
                      campaignId: c.id,
                      note: `Campaña ${c.name}`,
                      accountId: cashAccount(),
                    })
                  }
                />
                <Button
                  title="Registrar venta"
                  small
                  onPress={() =>
                    openSale({
                      campaignId: c.id,
                      channel: c.channel,
                      companyId: c.companyId || "",
                      locationId: c.locationId || "",
                    })
                  }
                />
              </View>
            </Card>
          ))}
          {!campaigns.length && (
            <Note>
              Aún no hay campañas cargadas. Crea la primera con nombre, canal y
              estado.
            </Note>
          )}
        </>
      ),
    };

  if (page === "Compañías" || page === "Ubicaciones") {
    const isCompany = page === "Compañías";
    return {
      scroll: (
        <>
          <Button
            title={"＋ " + (isCompany ? "Compañía" : "Ubicación")}
            onPress={() => open(isCompany ? "Compañía" : "Ubicación")}
          />
          <View style={{ height: 8 }} />
          {searchBox("Buscar por nombre")}
          {matching(isCompany ? companies : locations).map((r) => (
            <Card
              key={r.id}
              onPress={() =>
                open(isCompany ? "Compañía" : "Ubicación", strings(r))
              }
            >
              <Text style={s.subtitle}>{r.name}</Text>
              <Note>
                {r.kind}
                {r.company ? ` · ${r.company}` : ""}
              </Note>
              <Note>
                {r.address || r.phone || r.email || "Detalles pendientes"}
              </Note>
              {!!r.notes && <Note>{r.notes}</Note>}
              {!isCompany && (
                <Note>
                  {units(
                    lots
                      .filter((l) => l.locationId === r.id)
                      .reduce((n, l) => n + l.qty, 0),
                  )}{" "}
                  asignadas
                </Note>
              )}
              <Note color={C.ink}>Toca para editar ›</Note>
            </Card>
          ))}
          <Note>
            {isCompany
              ? "Registra tu negocio, proveedores, socios o clientes empresa."
              : "Las existencias importadas están sin ubicación hasta que asignes sus lotes."}
          </Note>
        </>
      ),
    };
  }

  if (page === "Oportunidades")
    return {
      scroll: (
        <>
          <Card>
            <Text style={s.subtitle}>Reposición</Text>
            {low.length ? (
              low.map((p) => (
                <View key={p.id} style={s.cartRow}>
                  <Text style={[s.body, { flex: 1 }]}>
                    {p.name} · {p.available} disponibles
                  </Text>
                  <Button
                    title="＋ Entrada"
                    secondary
                    small
                    onPress={() => open("Entrada", { productId: p.id })}
                  />
                </View>
              ))
            ) : (
              <Note>No hay productos en mínimo.</Note>
            )}
          </Card>
          <Card>
            <Text
              style={s.subtitle}
            >{`Seguimientos (vencidos y próximos ${FOLLOW_UP_DAYS} días)`}</Text>
            {soon.length ? (
              soon.map((c) => (
                <View key={c.id} style={s.cartRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.body}>{c.name}</Text>
                    <Note color={c.daysLeft < 0 ? C.red : C.amber}>
                      {followUpLabel(c.daysLeft, c.nextDate)}
                    </Note>
                  </View>
                  <Button
                    title="Actualizar"
                    secondary
                    small
                    onPress={() => open("Cliente", strings(c))}
                  />
                </View>
              ))
            ) : (
              <Note>{`No hay seguimientos vencidos ni en los próximos ${FOLLOW_UP_DAYS} días.`}</Note>
            )}
          </Card>
          <Card>
            <Text style={s.subtitle}>Paquetes por probar</Text>
            <Note>
              Combina productos complementarios y valida el costo antes de
              vender. Las sugerencias comerciales aún se registran manualmente.
            </Note>
            <Button
              title="Crear paquete"
              secondary
              small
              onPress={() => open("Paquete")}
            />
          </Card>
        </>
      ),
    };

  if (page === "Datos importados")
    return {
      scroll: (
        <>
          <Card>
            <Text style={s.subtitle}>Carga inicial desde Excel</Text>
            {(() => {
              const sm = b!.setting("source08Summary", null) as Row | null;
              if (!sm)
                return (
                  <Note>
                    No hay una carga inicial registrada en este teléfono.
                  </Note>
                );
              const pay = sm.payments || {};
              return (
                <>
                  <Note>
                    {sm.sales} ventas · {units(sm.units || 0)} entregadas
                  </Note>
                  <Text style={s.body}>
                    Ventas {money(sm.revenue || 0)} (transferencia{" "}
                    {money(pay.transfer || 0)} · tarjeta {money(pay.card || 0)}{" "}
                    · efectivo {money(pay.cash || 0)}). Comisión de tarjeta{" "}
                    {money(sm.fees || 0)} → ventas netas{" "}
                    {money(sm.netSales || 0)}.
                  </Text>
                </>
              );
            })()}
            <Note>
              Estas cifras describen solo lo que se importó del Excel. El
              Resumen de ventas muestra los totales con todas tus operaciones.
            </Note>
          </Card>
          <Card>
            <Text style={s.subtitle}>Pendientes por confirmar</Text>
            {b!.setting("source08Warnings", []).map((w: string, i: number) => (
              <Text key={i} style={s.body}>
                • {w}
              </Text>
            ))}
            <Note>
              Campañas, compañías, ubicaciones y bancos reales no venían en las
              fuentes y requieren captura.
            </Note>
          </Card>
          <Card>
            <Text style={s.subtitle}>Fuentes</Text>
            <Note>
              Control de inventario y ventas (Excel), catálogo Nova Supps (PDF)
              y costos de referencia del pedido 0635262. Los costos importados
              excluyen flete y seguro: el margen de esas ventas es estimado.
            </Note>
          </Card>
        </>
      ),
    };
  return null;
}
