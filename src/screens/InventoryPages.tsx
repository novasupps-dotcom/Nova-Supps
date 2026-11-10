import React from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import { Text } from "../text";
import { grossUp, jordanianStack, localDay, money, saleSegment, segmentsOf, today } from "../business";
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
  MenuList,
  QuickActions,
  TextButton,
  Icon,
  IconButton,
} from "../ui";
import { TILE } from "../theme";
import { duplicateGroups, type DuplicateGroup } from "../duplicates";
import type { Body, OwnerPageContext } from "./ownerContext";
import { normalize, units } from "./ownerShared";

export function renderInventoryPages(ctx: OwnerPageContext): Body | null {
  if (
    ![
      "Vender",
      "Stock",
      "Catálogo",
      "Detalle producto",
      "Lotes",
      "Repetidos",
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
    exportStock,
    gridProducts,
    basket,
    basketQtyMap,
    basketCustomerId,
    clearBasketCustomer,
    openFollowPopup,
    parkedCart,
    resumeParkedCart,
    discardParkedCart,
    productById,
    addToBasket,
    removeFromBasket,
    saleSeg,
    setSaleSeg,
    emptyBasket,
    openCheckout,
    filters,
    setFilters,
    matching,
    searchBox,
    filterChips,
    setProductDetailId,
    sellButton,
    editProduct,
    query,
    productDetailId,
    act,
    notify,
  } = ctx;
  const d = data!;
  // 2.8.1: eliminar desde Stock (mantener presionado) o desde el detalle del producto.
  const askDelete = (p: any, after?: () => void) => {
    const sold = b!.one("SELECT COUNT(*) n FROM sale_lines WHERE productId=?", p.id).n > 0;
    Alert.alert(
      "Eliminar producto",
      sold
        ? `${p.name} tiene ventas. Se quita de Stock y de Vender; tus ventas no cambian. Lo recuperas en Archivados.`
        : `${p.name}${p.stock ? ` y sus ${p.stock} piezas` : ""} se borra por completo.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => {
            let mode = "";
            if (act(() => (mode = b!.deleteProduct(p.id).mode), "")) {
              notify(mode === "deleted" ? "Producto eliminado" : "Producto archivado");
              after?.();
            }
          },
        },
      ],
    );
  };
  const {
    products,
    customers,
    lots,
  } = d;
  // 2.8.2: productos repetidos (se calcula una vez por cada versión de los datos).
  const dups = (() => {
    let v = DUP_CACHE.get(d);
    if (!v) DUP_CACHE.set(d, (v = duplicateGroups(b!)));
    return v;
  })();
  const sold30 = (() => {
    let m = SOLD30_CACHE.get(d);
    if (!m) {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const rows = b!.all(
        "SELECT l.productId, COALESCE(SUM(l.qty),0) n FROM sale_lines l JOIN sales s ON s.id=l.saleId WHERE s.status='confirmed' AND s.created>=? GROUP BY l.productId",
        since,
      );
      m = new Map(rows.map((r: any) => [String(r.productId), Number(r.n) || 0]));
      SOLD30_CACHE.set(d, m);
    }
    return m;
  })();
  const askMerge = (g: DuplicateGroup, keep: any) => {
    const others = g.products.filter((p) => p.id !== keep.id);
    const pieces = others.reduce((n, p) => n + (Number(p.stock) || 0), 0);
    Alert.alert(
      "Unificar",
      `${pieces ? `${pieces} piezas pasan a` : "Se queda solo"} «${keep.name}» y ${others.length === 1 ? "el otro se elimina" : `los otros ${others.length} se eliminan`} (con ventas se archivan).`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Unificar",
          onPress: () => {
            if (act(() => b!.mergeProducts(keep.id, others.map((p) => p.id)), "")) notify(`Unificado · ${keep.name}`);
          },
        },
      ],
    );
  };
  const soon = followUpsDue(customers);
  if (page === "Vender") {
    const lastDays = d.lastBackup
      ? daysBetween(localDay(d.lastBackup), today())
      : null;
    const basketCustomer = basketCustomerId
      ? customers.find((c) => c.id === basketCustomerId)
      : null;
    const kioskMode = filters.ModoVenta === "Kiosco";
    const jStack = jordanianStack(b!, gridProducts as any, basket, basketCustomerId || null);
    const totalPieces = basket.reduce((n: number, i: any) => n + i.qty, 0);
    return {
      scroll: (
        <>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 10,
              backgroundColor: C.paper,
              borderRadius: 16,
              padding: 6,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modo Punto de venta"
              onPress={() => setFilters((old) => ({ ...old, ModoVenta: "POS" }))}
              style={[
                s.chip,
                !kioskMode && s.chipOn,
                { flex: 1, alignItems: "center", paddingVertical: 7, paddingHorizontal: 8 },
              ]}
            >
              <Text style={[s.chipText, !kioskMode && s.chipTextOn, { fontSize: 12.5, fontWeight: "600" }]} numberOfLines={1}>
                🛍️ Punto de venta
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modo Kiosco"
              onPress={() =>
                setFilters((old) => ({ ...old, ModoVenta: kioskMode ? "POS" : "Kiosco" }))
              }
              style={[
                s.chip,
                kioskMode && s.chipOn,
                { flex: 1, alignItems: "center", paddingVertical: 7, paddingHorizontal: 8 },
              ]}
            >
              <Text style={[s.chipText, kioskMode && s.chipTextOn, { fontSize: 12.5, fontWeight: "600" }]} numberOfLines={1}>
                📱 Modo Kiosco
              </Text>
            </Pressable>
          </View>
          {kioskMode && (
            <View style={[s.between, { marginBottom: 10, paddingHorizontal: 4 }]}>
              <Text style={[s.subtitle, { marginBottom: 0 }]}>
                📱 Modo Kiosco · Suplementos y Precios
              </Text>
              <Button
                title="Salir de Kiosco"
                secondary
                small
                onPress={() => setFilters((old) => ({ ...old, ModoVenta: "POS" }))}
              />
            </View>
          )}
          {!kioskMode && !!d.mpPending && (
            <Card tone="warn">
              <Text style={s.subtitle}>
                Cobro en terminal sin confirmar · {money(d.mpPending.amount)}
              </Text>
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
          {!kioskMode && !!cloudStatus?.conflicts && (
            <Card tone="warn">
              <Text
                style={s.subtitle}
              >{`${cloudStatus.conflicts} ${cloudStatus.conflicts === 1 ? "venta de vendedor por revisar" : "ventas de vendedores por revisar"}`}</Text>
              <Button title="Revisar" small onPress={() => go("Equipo")} />
            </Card>
          )}
          {!kioskMode && (!!soon.length || lastDays === null || lastDays >= 7) && (
            <MenuList
              items={[
                ...(soon.length
                  ? [
                      {
                        key: "soon",
                        title:
                          soon.length === 1
                            ? "1 seguimiento próximo"
                            : `${soon.length} seguimientos próximos`,
                        icon: "bell" as const,
                        tint: TILE.gold,
                        value: "Ver / acciones",
                        onPress: openFollowPopup,
                      },
                    ]
                  : []),
                ...(lastDays === null || lastDays >= 7
                  ? [
                      {
                        key: "backup",
                        title:
                          lastDays === null
                            ? "Aún no guardas un respaldo"
                            : `Último respaldo hace ${lastDays} días`,
                        icon: "hard-drive" as const,
                        tint: TILE.graphite,
                        value: "Respaldar",
                        onPress: exportBackup,
                      },
                    ]
                  : []),
              ]}
            />
          )}
          {!kioskMode && !!parkedCart && (
            <View
              style={[
                s.between,
                {
                  backgroundColor: C.amberSoft,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginBottom: 10,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.body, { fontWeight: "600", color: C.ink }]}>
                  {`Venta en espera · ${parkedCart.items.reduce((n, i) => n + i.qty, 0)} pzas (${parkedCart.at})`}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <TextButton title="Retomar" bold color={C.brand} onPress={resumeParkedCart} />
                <TextButton title="Descartar" color={C.red} onPress={discardParkedCart} />
              </View>
            </View>
          )}
          {!!basketCustomer && (
            <View
              style={[
                s.between,
                {
                  backgroundColor: C.paper,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginBottom: 8,
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Icon name="user" size={16} color={C.brand} />
                <Text style={[s.body, { fontWeight: "600", flex: 1 }]} numberOfLines={1}>
                  {`Cliente: ${basketCustomer.name}`}
                </Text>
              </View>
              <TextButton title="Quitar" color={C.muted} onPress={clearBasketCustomer} />
            </View>
          )}
          {basket.length > 0 &&( jStack.items.length > 0 || jStack.complete) && (
            <View
              style={{
                backgroundColor: C.paper,
                borderRadius: 18,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 10,
                gap: 6,
              }}
            >
              <View style={s.between}>
                <Text style={[s.label, { marginBottom: 0, color: C.brand }]}>
                  {jStack.label}
                </Text>
                {!kioskMode && !basketCustomer && customers.length > 0 && (
                  <TextButton
                    title="👤 Elegir cliente"
                    color={C.brand}
                    onPress={() => go("Clientes")}
                  />
                )}
              </View>
              {!jStack.complete && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {jStack.items.slice(0, 1).map((sug: any) => (
                    <Pressable
                      key={sug.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Stack sugerido ${sug.name}`}
                      onPress={() => addToBasket(sug.id, 1, true)}
                      style={[
                        s.chip,
                        {
                          backgroundColor: C.paper, borderWidth: 1, borderColor: C.line,
                          paddingVertical: 6,
                          paddingHorizontal: 11,
                          maxWidth: "100%",
                        },
                      ]}
                    >
                      <Text
                        style={[s.chipText, { color: C.brand, fontSize: 12.5, fontWeight: "600" }]}
                        numberOfLines={1}
                      >
                        {`＋ ${sug.name} (${money(sug.price)})`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
          {kioskMode ? (
            <View style={{ gap: 18 }}>
              {(() => {
                const availProds = (gridProducts as any[]).filter(
                  (p) => (productById.get(p.id)?.available ?? 0) > 0,
                );
                const tipos = segmentsOf(availProds);
                if (!tipos.length) {
                  return <Note>No hay suplementos con existencias disponibles.</Note>;
                }
                return tipos.map((tipo) => {
                  const seenFam = new Set<string>();
                  const groupItems = availProds.filter((p) => {
                    if (saleSegment(p) !== tipo) return false;
                    const k = p.family || p.id;
                    if (seenFam.has(k)) return false;
                    seenFam.add(k);
                    return true;
                  });
                  return (
                    <View key={`kiosk-seg-${tipo}`} style={{ gap: 10 }}>
                      <View
                        style={{
                          borderBottomWidth: 1,
                          borderBottomColor: C.line,
                          paddingBottom: 6,
                        }}
                      >
                        <Text
                          style={[
                            s.subtitle,
                            {
                              marginBottom: 0,
                              fontSize: 18,
                              color: C.ink,
                              textTransform: "uppercase",
                              letterSpacing: 0.6,
                            },
                          ]}
                        >
                          {tipo}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                        {groupItems.map((p: any) => {
                          const qty = basketQtyMap.get(p.id) ?? 0;
                          return (
                            <Pressable
                              key={p.id}
                              accessibilityRole="button"
                              accessibilityLabel={`Kiosco ${p.familyName || p.name}`}
                              onPress={() => addToBasket(p.id, 1, true)}
                              style={[
                                s.tile,
                                {
                                  width: "48%",
                                  padding: 12,
                                  alignItems: "center",
                                },
                                qty > 0 && s.tileOn,
                              ]}
                            >
                              <View style={[s.tilePhoto, { width: "100%", height: 150, marginBottom: 8 }]}>
                                <ProductPhoto product={p} style={{ width: "100%", height: "100%" }} />
                                {qty > 0 && (
                                  <View style={s.tileBadge}>
                                    <Text style={s.tileBadgeText}>{String(qty)}</Text>
                                  </View>
                                )}
                              </View>
                              <Text
                                style={[s.tileName, { textAlign: "center", fontSize: 14 }]}
                                numberOfLines={2}
                              >
                                {p.familyName || p.name}
                              </Text>
                              <Text
                                style={[
                                  s.price,
                                  {
                                    fontSize: 20,
                                    fontWeight: "700",
                                    color: C.brand,
                                    textAlign: "center",
                                    marginTop: 4,
                                    marginBottom: 0,
                                  },
                                ]}
                              >
                                {money(p.price)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
          ) : (
            <ProductGrid
              products={gridProducts as any}
              qtyOf={(id) => basketQtyMap.get(id) ?? 0}
              limitOf={(id) => Math.max(0, productById.get(id)?.available ?? 0)}
              onAdd={(id) => addToBasket(id, 1, true)}
              lookupStore={b!}
              onPhotoResolved={(product, online) =>
                act(() => b!.saveProductLookupPhoto(product.id, online))
              }
              onRemove={removeFromBasket}
              segment={saleSeg}
              onSegment={setSaleSeg}
              onInventoryCode={(barcode) =>
                open("Inventario por código", { barcode, autoSell: "1" })
              }
              cartCount={totalPieces}
              onCheckout={openCheckout}
              expiringIds={d.expiringIds}
            />
          )}
          {kioskMode ? (
            totalPieces > 0 ? (
              <View style={{ marginTop: 12 }}>
                <Button
                  icon="shopping-cart"
                  title={`Pasar a caja · Cobrar pedido (${totalPieces} ${totalPieces === 1 ? "pieza" : "piezas"})`}
                  onPress={() => {
                    setFilters((old) => ({ ...old, ModoVenta: "POS" }));
                    openCheckout();
                  }}
                />
              </View>
            ) : null
          ) : (
            <View style={[s.between, { marginTop: 8, paddingHorizontal: 4 }]}>
              <TextButton
                title="＋ Producto nuevo"
                onPress={() => open("Producto", { toBasket: "1" })}
              />
              {!!basket.length && (
                <TextButton
                  title="Vaciar carrito"
                  color={C.red}
                  onPress={emptyBasket}
                />
              )}
            </View>
          )}
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
            <QuickActions
              items={[
                { label: "Nuevo producto", icon: "plus", tint: C.brand, onPress: () => open("Producto") },
                {
                  label: "Escanear",
                  icon: "scan-barcode",
                  onPress: () => open("Inventario por código", { startScanning: "1" }),
                },
                { label: "Nueva entrada", icon: "download", onPress: () => open("Entrada") },
                { label: "Conteo", icon: "list-checks", onPress: () => open("Ajuste de inventario") },
              ]}
            />
            <View style={[s.wrap, { gap: 8, marginBottom: 4 }]}>
              <Button title="Cargar pedido del proveedor (PDF)" icon="file-text" secondary small flex onPress={() => go("Cargar pedido")} />
              {page === "Stock" && (
                <Button title="Reporte de stock (Excel)" icon="file-spreadsheet" secondary small flex onPress={() => void exportStock()} />
              )}
            </View>
            {!!dups.length && (
              <TextButton
                title={`${dups.length} ${dups.length === 1 ? "producto repetido" : "productos repetidos"} · Revisar`}
                color={C.amber}
                bold
                onPress={() => go("Repetidos")}
              />
            )}
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
              onLongPress={() => (p.archived ? undefined : askDelete(p))}
            >
              <View style={s.productRow}>
                <ProductPhoto product={p} style={{ width: 68, height: 84 }} />
                <View style={{ flex: 1 }}>
                  <View style={[s.between, { alignItems: "flex-start", gap: 8 }]}>
                    <Text style={[s.body, { fontWeight: "600", flex: 1 }]} numberOfLines={2}>
                      {p.name}
                    </Text>
                    <Text style={[s.price, { fontSize: 18, marginVertical: 0 }]}>{money(p.price)}</Text>
                  </View>
                  <Text style={[s.muted, { fontSize: 12.5, marginTop: 2 }]} numberOfLines={1}>
                    {p.brand || p.category} · {p.sku}
                    {grossUp(p.price, d.feeBps) !== p.price ? ` · Cliente paga ${money(grossUp(p.price, d.feeBps))}` : ""}
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
                    {p.inventoryKnown ? (
                      <Pill
                        text={p.available === p.stock ? `${p.available} disponibles` : `${p.available} disponibles · ${p.stock} físicas`}
                        tone={p.available < 1 ? "bad" : lowStock ? "warn" : "ok"}
                      />
                    ) : (
                      <Pill text="Existencias por confirmar" tone="warn" />
                    )}
                    {(() => {
                      const s30 = sold30.get(p.id) ?? 0;
                      if (s30 <= 0) return null;
                      const daysLeft = p.available > 0 ? Math.max(1, Math.round((p.available * 30) / s30)) : 0;
                      const sugOrder = Math.max(0, s30 - p.available);
                      return (
                        <Text style={[s.muted, { fontSize: 12 }]}>
                          {`30d: ${s30} pzas${p.available > 0 ? ` (~${daysLeft}d)` : ""}${sugOrder > 0 && p.available <= p.minimum ? ` · pedir ${sugOrder}` : ""}`}
                        </Text>
                      );
                    })()}
                  </View>
                </View>
                <Icon name="chevron-right" size={18} color={C.faint} />
              </View>
              {!p.archived && (
                <View style={[s.row, { marginTop: 10, marginVertical: 0, alignItems: "center" }]}>
                  {(p.available > 0 || (basketQtyMap.get(p.id) ?? 0) > 0) ? (
                    <View style={{ flex: 1 }}>{sellButton(p)}</View>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                  <IconButton
                    icon="boxes"
                    label={`Cambiar cantidad de ${p.name}`}
                    bg={C.soft}
                    onPress={() => open("Ajuste de inventario", { productId: p.id, reason: "Corrección", counted: String(p.stock) })}
                  />
                </View>
              )}
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

  if (page === "Repetidos")
    return {
      scroll: (
        <>
          {!dups.length && <Note>No hay productos repetidos.</Note>}
          {dups.map((g) => (
            <Card key={g.key}>
              {g.products.map((p, i) => (
                <View key={p.id} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: C.line }}>
                  <Text style={[s.body, { fontWeight: "600" }]} numberOfLines={2}>
                    {p.name}
                  </Text>
                  <Text style={[s.muted, { fontSize: 12.5 }]}>{`${p.sku} · ${p.stock} pzas · ${money(p.price)}`}</Text>
                  <View style={[s.row, { gap: 14, marginVertical: 0 }]}>
                    <TextButton title="Unificar aquí" bold onPress={() => askMerge(g, p)} />
                    <TextButton title="Eliminar" color={C.red} onPress={() => askDelete(p)} />
                  </View>
                </View>
              ))}
            </Card>
          ))}
        </>
      ),
    };

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
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 10,
                marginBottom: 14,
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
                    backgroundColor: C.paper,
                    borderRadius: 16,
                  }}
                />
              ))}
            </View>
            <Text style={[s.title, { fontSize: 24 }]}>{p.name}</Text>
            <Text style={[s.muted, { fontSize: 13 }]}>
              {p.brand || p.category} · {p.sku}
            </Text>
            {p.archived && <Pill text="Archivado" tone="warn" />}
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 10 }}>
              <Text style={[s.price, { fontSize: 26 }]}>{money(p.price)}</Text>
              {grossUp(p.price, d.feeBps) !== p.price && (
                <Text style={s.muted}>{`Cliente paga ${money(grossUp(p.price, d.feeBps))}`}</Text>
              )}
            </View>
            <Pill
              text={
                p.inventoryKnown
                  ? p.available === p.stock
                    ? `${p.available} disponibles`
                    : `${p.available} disponibles · ${p.stock} físicas`
                  : "Inventario por confirmar"
              }
              tone={p.available < 1 ? "bad" : "ok"}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {[
                p.category ? `Categoría: ${p.category}` : "",
                p.brand ? `Marca: ${p.brand}` : "",
                p.flavor ? `Sabor: ${p.flavor}` : "",
                p.presentation ? `Presentación: ${p.presentation}` : "",
              ]
                .filter(Boolean)
                .map((tag) => (
                  <Pill key={tag} text={tag} tone="neutral" />
                ))}
            </View>
            {!!p.description && <Text style={[s.body, { marginTop: 8, color: C.muted }]}>{p.description}</Text>}
            {!!p.lookupSource && (
              <>
                <Note>
                  Fuente de la ficha: {p.lookupSource}
                  {p.lookupSource === "Open Food Facts"
                    ? " · datos ODbL · foto CC BY-SA"
                    : ""}
                </Note>
                {!!p.lookupSourceUrl && (
                  <TextButton
                    title="Consultar fuente"
                    onPress={() =>
                      void Linking.openURL(p.lookupSourceUrl).catch(() => {})
                    }
                  />
                )}
              </>
            )}
            {!p.archived && (p.available > 0 || (basketQtyMap.get(p.id) ?? 0) > 0) && (
              <>
                <View style={{ height: 10 }} />
                {sellButton(p)}
              </>
            )}
          </Card>
          <QuickActions
            items={[
              { label: "Editar", icon: "pencil", onPress: () => editProduct(p) },
              { label: "Entrada", icon: "download", onPress: () => open("Entrada", { productId: p.id }) },
              {
                label: "Cantidad",
                icon: "boxes",
                onPress: () => open("Ajuste de inventario", { productId: p.id, reason: "Corrección", counted: String(p.stock) }),
              },
              { label: "Conteo", icon: "list-checks", onPress: () => open("Ajuste de inventario", { productId: p.id }) },
            ]}
          />
          <MenuList
            items={[
              p.archived
                ? {
                    key: "restore",
                    title: "Restaurar producto",
                    icon: "layers",
                    tint: TILE.graphite,
                    onPress: () => act(() => b!.setProductArchived(p.id, false), "Producto restaurado"),
                  }
                : {
                    key: "delete",
                    title: "Eliminar producto",
                    icon: "trash-2",
                    tint: TILE.red,
                    danger: true,
                    onPress: () => askDelete(p, () => go("Stock")),
                  },
            ]}
          />
          {(!!p.barcode || (Array.isArray(p.barcodeAliases) && p.barcodeAliases.length > 0)) && (
            <Card>
              <Text style={s.subtitle}>Códigos</Text>
              {!!p.barcode && <Note>Código de barras principal: {p.barcode}</Note>}
              {Array.isArray(p.barcodeAliases) &&
                p.barcodeAliases.map((code: string) => (
                  <View key={code} style={s.between}>
                    <Note>Código adicional: {code}</Note>
                    <TextButton
                      title="Quitar"
                      color={C.red}
                      onPress={() =>
                        act(
                          () => b!.unlinkAdditionalProductCode(p.id, code),
                          "Código adicional desvinculado",
                        )
                      }
                    />
                  </View>
                ))}
            </Card>
          )}
          <Card>
            <Text style={s.subtitle}>Lotes y costo</Text>
            {lots
              .filter((l) => l.productId === p.id)
              .map((l) => (
                <View key={l.id} style={{ marginTop: 8 }}>
                  <Text style={s.body}>
                    {l.label} · {units(l.qty)} · {money(l.cost)} c/u
                  </Text>
                  <Note>
                    Caducidad: {l.expires ? fmtDay(l.expires) : "Pendiente"}
                  </Note>
                </View>
              ))}
          </Card>
          {(() => {
            const moves = b!.all(
              "SELECT m.id, m.created, m.qty, m.kind, m.note, l.label, l.cost FROM stock_moves m JOIN lots l ON l.id = m.lotId WHERE l.productId = ? ORDER BY m.created DESC, m.rowid DESC LIMIT 20",
              p.id,
            );
            if (!moves.length) return null;
            const kindLabel: Record<string, string> = {
              initial: "Inventario inicial",
              purchase: "Compra",
              receive: "Entrada",
              sale: "Venta",
              cancel: "Cancelación",
              return: "Devolución",
              adjust: "Ajuste conteo",
              correction: "Corrección",
              merge: "Unificación",
            };
            return (
              <Card>
                <Text style={s.subtitle}>Kardex · Historial de movimientos</Text>
                {moves.map((mv: any, idx: number) => {
                  const q = Number(mv.qty) || 0;
                  return (
                    <View
                      key={mv.id || idx}
                      style={[
                        s.between,
                        {
                          paddingVertical: 6,
                          borderTopWidth: idx ? 1 : 0,
                          borderColor: C.line,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[s.body, { fontWeight: "500" }]}>
                          {kindLabel[mv.kind] || mv.kind} · {fmtDay(localDay(mv.created))}
                        </Text>
                        {!!mv.note && <Note>{mv.note}</Note>}
                      </View>
                      <Text
                        style={[
                          s.body,
                          {
                            fontWeight: "700",
                            color: q >= 0 ? C.green : C.red,
                            fontVariant: ["tabular-nums"],
                          },
                        ]}
                      >
                        {q > 0 ? `+${q}` : String(q)}
                      </Text>
                    </View>
                  );
                })}
              </Card>
            );
          })()}
        </>
      ),
    };
  }

  if (page === "Lotes") {
    const defaultLotFilter = lots.some((l) => l.qty > 0)
      ? "Con existencias"
      : "Todos";
    const lotFilter = filters.Lotes || defaultLotFilter;
    const shownLots = lots.filter((l) => {
      if (!normalize(l.product + " " + l.sku).includes(normalize(query)))
        return false;
      if (lotFilter === "Con existencias") return l.qty > 0;
      if (lotFilter === "Agotados") return l.qty < 1;
      if (lotFilter === "Próximos 60 días") {
        const days = l.expires ? daysBetween(today(), l.expires) : null;
        return l.qty > 0 && days !== null && days <= 60;
      }
      return true;
    });
    return {
      scroll: (
        <>
          {searchBox("Buscar producto o SKU")}
          {filterChips("Lotes", [
            "Con existencias",
            "Próximos 60 días",
            "Agotados",
            "Todos",
          ])}
          {!shownLots.length && (
            <Note>No hay lotes con este filtro.</Note>
          )}
          {shownLots.map((l) => {
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
                      : "Pendiente"}
                  </Note>
                </Card>
              );
            })}
        </>
      ),
    };
  }

  return null;
}

const DUP_CACHE = new WeakMap<object, DuplicateGroup[]>();
const SOLD30_CACHE = new WeakMap<object, Map<string, number>>();
