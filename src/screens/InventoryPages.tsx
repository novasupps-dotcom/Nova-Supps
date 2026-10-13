import React from "react";
import { Pressable, Text, View } from "react-native";
import { grossUp, localDay, money, today, type Row } from "../business";
import { catalogueImages } from "../catalogueImages";
import {
  Button,
  C,
  Card,
  Note,
  Pill,
  ProductGrid,
  ProductPhoto,
  daysBetween,
  fmtDay,
  followUpsDue,
  s,
} from "../ui";
import type { Body, OwnerPageContext } from "./ownerContext";
import { amount, normalize, units } from "./ownerShared";

export function renderInventoryPages(ctx: OwnerPageContext): Body | null {
  if (
    ![
      "Vender",
      "Stock",
      "Catálogo",
      "Detalle producto",
      "Lotes",
      "Paquetes",
    ].includes(ctx.page)
  )
    return null;
  const {
    data,
    page,
    b,
    go,
    open,
    setPay,
    cloudStatus,
    exportBackup,
    gridProducts,
    basket,
    productById,
    addToBasket,
    removeFromBasket,
    saleSeg,
    setSaleSeg,
    emptyBasket,
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
    openSale,
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
  if (page === "Vender") {
    const lastDays = d.lastBackup
      ? daysBetween(localDay(d.lastBackup), today())
      : null;
    return {
      scroll: (
        <>
          {!!d.mpPending && (
            <Card tone="warn">
              <Text style={s.subtitle}>
                🏧 Cobro en terminal sin confirmar · {money(d.mpPending.amount)}
              </Text>
              <Note>
                La app se cerró mientras se cobraba. Revísalo: la venta se
                registra solo si Mercado Pago lo aprobó.
              </Note>
              <Button
                title="Revisar cobro"
                small
                onPress={() =>
                  setPay({
                    ...(d.mpPending as any),
                    outcome: "pending",
                    text: "Consultando a Mercado Pago…",
                    tick: 0,
                    fails: 0,
                  })
                }
              />
            </Card>
          )}
          {!!cloudStatus?.conflicts && (
            <Card tone="warn">
              <Text
                style={s.subtitle}
              >{`👥 ${cloudStatus.conflicts} ${cloudStatus.conflicts === 1 ? "venta de vendedor por revisar" : "ventas de vendedores por revisar"}`}</Text>
              <Button title="Revisar" small onPress={() => go("Equipo")} />
            </Card>
          )}
          {!!soon.length && (
            <Pressable
              accessibilityRole="button"
              onPress={() => go("Clientes", "Próximos 5 días")}
              style={[s.menuRow, { borderBottomWidth: 0 }]}
            >
              <Text style={s.menuIcon}>🔔</Text>
              <Text style={[s.body, { flex: 1 }]}>
                {soon.length === 1
                  ? "1 seguimiento próximo"
                  : `${soon.length} seguimientos próximos`}
              </Text>
              <Text style={{ color: C.muted, fontSize: 18 }}>›</Text>
            </Pressable>
          )}
          {(lastDays === null || lastDays >= 7) && (
            <Pressable
              accessibilityRole="button"
              onPress={exportBackup}
              style={[s.menuRow, { borderBottomWidth: 0 }]}
            >
              <Text style={s.menuIcon}>💾</Text>
              <Text style={[s.body, { flex: 1 }]}>
                {lastDays === null
                  ? "Aún no guardas un respaldo"
                  : `Último respaldo hace ${lastDays} días`}
              </Text>
              <Text style={{ color: C.muted, fontSize: 18 }}>Respaldar ›</Text>
            </Pressable>
          )}
          <ProductGrid
            products={gridProducts as any}
            qtyOf={(id) => basket.find((i) => i.productId === id)?.qty ?? 0}
            limitOf={(id) => Math.max(0, productById.get(id)?.available ?? 0)}
            onAdd={(id) => void addToBasket(id, 1, true)}
            onRemove={removeFromBasket}
            segment={saleSeg}
            onSegment={setSaleSeg}
          />
          <View style={s.wrap}>
            <Button
              title="＋ Producto nuevo"
              secondary
              small
              onPress={() => open("Producto", { toBasket: "1" })}
            />
            {!!basket.length && (
              <Button
                title="🗑 Vaciar carrito"
                secondary
                small
                onPress={emptyBasket}
              />
            )}
          </View>
        </>
      ),
    };
  }

  if (page === "Stock" || page === "Catálogo") {
    const filter = filters[page] || "Todos";
    const list = matching(products).filter((p) =>
      filter === "Archivados"
        ? p.archived
        : !p.archived &&
          (filter === "Bajo mínimo"
            ? p.inventoryKnown && p.available <= p.minimum
            : filter === "Sin stock"
              ? p.available < 1
              : true),
    );
    return {
      list: {
        data: list,
        header: (
          <>
            <View style={s.wrap}>
              <Button
                title="＋ Producto"
                small
                onPress={() => open("Producto")}
              />
              <Button
                title="＋ Entrada"
                secondary
                small
                onPress={() => open("Entrada")}
              />
              <Button
                title="Ajustar conteo"
                secondary
                small
                onPress={() => open("Ajuste de inventario")}
              />
            </View>
            <View style={{ height: 6 }} />
            {searchBox("Buscar nombre, SKU o marca")}
            {filterChips(page, [
              "Todos",
              "Bajo mínimo",
              "Sin stock",
              "Archivados",
            ])}
          </>
        ),
        item: (p) => {
          const lowStock = p.inventoryKnown && p.available <= p.minimum;
          return (
            <Card
              onPress={() => {
                setProductDetailId(p.id);
                go("Detalle producto");
              }}
            >
              <View style={s.productRow}>
                <ProductPhoto product={p} style={s.productImage} />
                <View style={{ flex: 1 }}>
                  <Text style={s.subtitle} numberOfLines={2}>
                    {p.name}
                  </Text>
                  <Note>
                    {p.brand || p.category} · {p.sku}
                  </Note>
                  <Text style={s.price}>{money(p.price)}</Text>
                  <Note>{`Cliente paga ${money(grossUp(p.price, d.feeBps))}`}</Note>
                  {p.inventoryKnown ? (
                    <Pill
                      text={`${p.available} disponibles · ${p.stock} físicas`}
                      tone={p.available < 1 ? "bad" : lowStock ? "warn" : "ok"}
                    />
                  ) : (
                    <Pill text="Existencias por confirmar" tone="warn" />
                  )}
                </View>
              </View>
              <View style={[s.row, { marginTop: 10 }]}>
                <View style={{ flex: 1 }}>{sellButton(p)}</View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Editar"
                    secondary
                    small
                    onPress={() => editProduct(p)}
                  />
                </View>
              </View>
            </Card>
          );
        },
        empty: (
          <Card>
            <Text style={s.body}>No hay coincidencias.</Text>
            <Button
              title="＋ Dar de alta un producto"
              secondary
              small
              onPress={() => open("Producto", { name: query })}
            />
          </Card>
        ),
      },
    };
  }

  if (page === "Detalle producto") {
    const p = products.find((x) => x.id === productDetailId);
    if (!p)
      return { scroll: <Note>Este producto ya no está disponible.</Note> };
    const photos = p.imageUri
      ? [{ uri: p.imageUri }]
      : catalogueImages[p.imageKey] ||
        catalogueImages[p.sku] ||
        catalogueImages[p.id] ||
        [];
    return {
      scroll: (
        <>
          <Card>
            <Text style={s.title}>{p.name}</Text>
            <Note>
              {p.brand || p.category} · {p.sku}
            </Note>
            {p.archived && <Pill text="Archivado" tone="warn" />}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                marginVertical: 12,
              }}
            >
              {(photos.length ? photos : [null]).map((_: any, i: number) => (
                <ProductPhoto
                  key={i}
                  product={p}
                  index={i}
                  style={{
                    width: 145,
                    height: 190,
                    backgroundColor: "#fff",
                    borderRadius: 12,
                  }}
                />
              ))}
            </View>
            <Text style={s.price}>{money(p.price)}</Text>
            {!!p.description && <Text style={s.body}>{p.description}</Text>}
            <Note>
              {[p.flavor, p.presentation].filter(Boolean).join(" · ") ||
                "Presentación por confirmar"}
            </Note>
            <View style={{ height: 6 }} />
            <Pill
              text={
                p.inventoryKnown
                  ? `${p.stock} físicas · ${p.available} vendibles`
                  : "Inventario por confirmar"
              }
              tone={p.available < 1 ? "bad" : "ok"}
            />
            <View style={{ height: 10 }} />
            {sellButton(p)}
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Editar"
                  secondary
                  small
                  onPress={() => editProduct(p)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="＋ Entrada"
                  secondary
                  small
                  onPress={() => open("Entrada", { productId: p.id })}
                />
              </View>
            </View>
            <Button
              title="Ajustar existencias (conteo, merma, regalo)"
              secondary
              small
              onPress={() => open("Ajuste de inventario", { productId: p.id })}
            />
            <Button
              title={p.archived ? "Restaurar producto" : "Archivar producto"}
              secondary
              small
              onPress={() =>
                act(
                  () => b!.setProductArchived(p.id, !p.archived),
                  p.archived ? "Producto restaurado" : "Producto archivado",
                )
              }
            />
            <Note>
              Archivar oculta el producto del stock y de nuevas ventas; conserva
              su historial.
            </Note>
          </Card>
          <Card>
            <Text style={s.subtitle}>Lotes, costo y ubicación</Text>
            {lots
              .filter((l) => l.productId === p.id)
              .map((l) => (
                <View key={l.id} style={{ marginTop: 8 }}>
                  <Text style={s.body}>
                    {l.label} · {units(l.qty)} · {money(l.cost)} c/u
                  </Text>
                  <Note>
                    Caducidad: {l.expires ? fmtDay(l.expires) : "Pendiente"} ·{" "}
                    {l.location || "Sin ubicación"}
                  </Note>
                </View>
              ))}
          </Card>
        </>
      ),
    };
  }

  if (page === "Lotes")
    return {
      scroll: (
        <>
          {searchBox("Buscar producto o SKU")}
          {lots
            .filter((l) =>
              normalize(l.product + " " + l.sku).includes(normalize(query)),
            )
            .map((l) => {
              const days = l.expires ? daysBetween(today(), l.expires) : null;
              return (
                <Card key={l.id}>
                  <Text style={s.subtitle}>{l.product}</Text>
                  <Note>
                    {l.label} · {units(l.qty)} · {money(l.cost)} c/u
                  </Note>
                  <Note
                    color={
                      days !== null && days < 0
                        ? C.red
                        : days !== null && days <= 60
                          ? C.amber
                          : undefined
                    }
                  >
                    Caducidad:{" "}
                    {l.expires
                      ? fmtDay(l.expires) +
                        (days !== null && days < 0
                          ? " · vencido"
                          : days !== null && days <= 60
                            ? ` · en ${days} días`
                            : "")
                      : "Pendiente"}{" "}
                    · {l.location || "Sin ubicación"}
                  </Note>
                  <Button
                    title="Asignar / cambiar ubicación"
                    secondary
                    small
                    onPress={() =>
                      open("Asignar ubicación", {
                        lotId: l.id,
                        locationId: l.locationId || "",
                      })
                    }
                  />
                </Card>
              );
            })}
        </>
      ),
    };

  if (page === "Paquetes")
    return {
      scroll: (
        <>
          <Button title="＋ Paquete" onPress={() => open("Paquete")} />
          <Note>Cada venta descuenta los productos que lo componen.</Note>
          <View style={{ height: 8 }} />
          {b!.bundles().map((bundle) => {
            const items = bundle.items as Row[];
            return (
              <Card key={bundle.id}>
                <Text style={s.subtitle}>
                  {bundle.name} · {money(bundle.price)}
                </Text>
                {items.map((i) => (
                  <Note key={i.productId}>
                    {i.qty} × {i.name}
                  </Note>
                ))}
                <Button
                  title="Vender paquete"
                  small
                  onPress={() =>
                    openSale(
                      { total: amount(bundle.price) },
                      items.map((i) => ({
                        productId: i.productId,
                        qty: i.qty,
                      })),
                    )
                  }
                />
              </Card>
            );
          })}
        </>
      ),
    };
  return null;
}
