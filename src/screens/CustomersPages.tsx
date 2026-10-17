import React from "react";
import { Linking, Pressable, View } from "react-native";
import { Text } from "../text";
import { localDay, money, today, type Row } from "../business";
import { whatsappNumber } from "../receipt";
import {
  Button,
  C,
  Card,
  Icon,
  IconButton,
  Note,
  Pill,
  TextButton,
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
      "Datos importados",
    ].includes(ctx.page)
  )
    return null;
  const {
    data,
    page,
    b,
    open,
    filters,
    matching,
    searchBox,
    filterChips,
    query,
    setFilters,
    openSale,
    go,
  } = ctx;
  const d = data!;
  const {
    customers,
  } = d;
  const soon = followUpsDue(customers);
  if (page === "Clientes") {
    // 2.5 · Último catálogo enviado a cada cliente.
    const lastCatalog = new Map<string, string>();
    for (const x of (b!.setting("catalogSends", []) || []) as { customerId: string; at: string }[])
      if (x.customerId && !lastCatalog.has(x.customerId)) lastCatalog.set(x.customerId, x.at);
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
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>{searchBox("Buscar nombre o teléfono")}</View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nuevo cliente"
                onPress={() => open("Cliente")}
                style={({ pressed }) => [
                  {
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    backgroundColor: C.brand,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Icon name="user-plus" size={21} color="#fff" />
              </Pressable>
            </View>
            {filterChips("Clientes", [
              "Todos",
              "Próximos 5 días",
              "Por contactar",
              "Archivados",
            ])}
            {!!soon.length && filter !== "Próximos 5 días" && (
              <View style={[s.list, { paddingHorizontal: 16, marginTop: 8 }]}>
                <View style={[s.between, { paddingTop: 14, paddingBottom: 4 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon name="bell" size={18} color={C.amber} />
                    <Text style={[s.subtitle, { marginBottom: 0 }]}>
                      {soon.length === 1 ? "1 seguimiento próximo" : `${soon.length} seguimientos próximos`}
                    </Text>
                  </View>
                  <TextButton
                    title={soon.length > 3 ? `Ver los ${soon.length}` : "Ver seguimientos"}
                    onPress={() =>
                      setFilters((old) => ({
                        ...old,
                        Clientes: "Próximos 5 días",
                      }))
                    }
                  />
                </View>
                {soon.slice(0, 3).map((c, i) => (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    onPress={() => open("Cliente", strings(c))}
                    style={[s.cartRow, i === Math.min(2, soon.length - 1) && { borderBottomWidth: 0 }]}
                  >
                    <Text style={[s.body, { flex: 1, fontWeight: "500" }]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={[s.muted, { color: c.daysLeft < 0 ? C.red : C.amber }]}>
                      {followUpLabel(c.daysLeft, c.nextDate)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={{ height: 6 }} />
          </>
        ),
        item: (c) => {
          const stats = d.byCustomer.get(c.id) ?? { count: 0, total: 0 };
          const late = c.nextDate ? daysBetween(c.nextDate, today()) : null;
          const wa = whatsappNumber(c.phone);
          const initials = String(c.name || "?")
            .split(/\s+/)
            .slice(0, 2)
            .map((w: string) => w[0] || "")
            .join("")
            .toUpperCase();
          return (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: C.soft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: "600", color: C.ink }}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.body, { fontWeight: "600", fontSize: 17 }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>
                    {[
                      c.phone,
                      `${stats.count} ${stats.count === 1 ? "compra" : "compras"} · ${money(stats.total)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                <Pill
                  text={c.stage}
                  tone={
                    c.stage === "Cliente" || c.stage === "Frecuente"
                      ? "ok"
                      : "neutral"
                  }
                />
              </View>
              {late !== null && (
                <Text style={[s.muted, { marginTop: 8, color: late >= 0 ? C.red : C.muted }]}>
                  {late > 0
                    ? `Contactar: vencido hace ${late} ${late === 1 ? "día" : "días"}`
                    : late === 0
                      ? "Contactar: hoy"
                      : `Próximo contacto: ${fmtDay(c.nextDate)}`}
                </Text>
              )}
              {lastCatalog.has(c.id) && (
                <Text style={[s.muted, { marginTop: 4, fontSize: 13 }]}>
                  {`Catálogo enviado · ${fmtDay(localDay(lastCatalog.get(c.id)!))}`}
                </Text>
              )}
              {!!c.notes && !/^importado del excel/i.test(String(c.notes)) && (
                <Text style={[s.muted, { marginTop: 4 }]} numberOfLines={1}>
                  {c.notes}
                </Text>
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                {!!c.phone && (
                  <IconButton
                    icon="phone"
                    label="Llamar"
                    bg={C.soft}
                    onPress={() => void Linking.openURL("tel:" + c.phone).catch(() => {})}
                  />
                )}
                {!!wa && (
                  <IconButton
                    icon="message-circle"
                    label="WhatsApp"
                    bg={C.soft}
                    onPress={() => void Linking.openURL("https://wa.me/" + wa).catch(() => {})}
                  />
                )}
                <IconButton icon="pencil" label="Editar" bg={C.soft} onPress={() => open("Cliente", strings(c))} />
                <IconButton
                  icon="book-open"
                  label={`Enviar catálogo a ${c.name}`}
                  bg={C.soft}
                  onPress={() => (
                    setFilters((old) => ({ ...old, "Catálogo para clientes": c.id })),
                    go("Catálogo para clientes")
                  )}
                />
                <View style={{ flex: 1 }} />
                {/* 2.5: "Vender" cabe junto a los 4 botones en pantallas de 360 dp. */}
                <Button title="Vender" label="Nueva venta" small onPress={() => openSale({ customerId: c.id })} />
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
              Los bancos reales no venían en las fuentes y requieren captura.
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
