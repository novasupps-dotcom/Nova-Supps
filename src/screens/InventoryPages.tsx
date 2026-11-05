import React from "react";
import { Alert, Linking, View } from "react-native";
import { Text } from "../text";
import { grossUp, localDay, money, today } from "../business";
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
    gridProducts,
    basket,
    productById,
    addToBasket,
    removeFromBasket,
    saleSeg,
    setSaleSeg,
    emptyBasket,
    openCheckout,
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
    return {
      scroll: (
        <>
          {!!d.mpPending && (
            <Card tone="warn">
              <Text style={s.subtitle}>
                Cobro en terminal sin confirmar · {money(d.mpPending.amount)}
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
              >{`${cloudStatus.conflicts} ${cloudStatus.conflicts === 1 ? "venta de vendedor por revisar" : "ventas de vendedores por revisar"}`}</Text>
              <Button title="Revisar" small onPress={() => go("Equipo")} />
            </Card>
          )}
          {(!!soon.length || lastDays === null || lastDays >= 7) && (
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
                        onPress: () => go("Clientes", "Próximos 5 días"),
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
          <ProductGrid
            products={gridProducts as any}
            qtyOf={(id) => basket.find((i) => i.productId === id)?.qty ?? 0}
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
            cartCount={basket.reduce((n: number, i: any) => n + i.qty, 0)}
            onCheckout={openCheckout}
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
                icon="trash-2" title="Vaciar carrito"
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
            <Button title="Cargar pedido del proveedor (PDF)" icon="file-text" secondary small onPress={() => go("Cargar pedido")} />
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
                <ProductPhoto product={p} style={{ width: 72, height: 88 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.body, { fontWeight: "600" }]} numberOfLines={2}>
                    {p.name}
                  </Text>
                  <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>
                    {p.brand || p.category} · {p.sku}
                  </Text>
                  <Text style={[s.price, { marginTop: 6, marginBottom: 0 }]}>{money(p.price)}</Text>
                  {grossUp(p.price, d.feeBps) !== p.price && (
                    <Text style={[s.muted, { fontSize: 12.5 }]}>{`Cliente paga ${money(grossUp(p.price, d.feeBps))}`}</Text>
                  )}
                  <View style={{ marginTop: 6 }}>
                    {p.inventoryKnown ? (
                      <Pill
                        text={p.available === p.stock ? `${p.available} disponibles` : `${p.available} disponibles · ${p.stock} físicas`}
                        tone={p.available < 1 ? "bad" : lowStock ? "warn" : "ok"}
                      />
                    ) : (
                      <Pill text="Existencias por confirmar" tone="warn" />
                    )}
                  </View>
                </View>
                <Icon name="chevron-right" size={18} color={C.faint} />
              </View>
              <View style={{ marginTop: 10 }}>{sellButton(p)}</View>
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
            {!!p.description && <Text style={[s.body, { marginTop: 10 }]}>{p.description}</Text>}
            <Note>
              {[p.flavor, p.presentation].filter(Boolean).join(" · ") ||
                "Presentación por confirmar"}
            </Note>
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
            <View style={{ height: 10 }} />
            {sellButton(p)}
          </Card>
          <QuickActions
            items={[
              { label: "Editar", icon: "pencil", onPress: () => editProduct(p) },
              { label: "Entrada", icon: "download", onPress: () => open("Entrada", { productId: p.id }) },
              {
                label: "Cantidad",
                icon: "boxes",
                onPress: () => open("Ajuste de inventario", { productId: p.id, reason: "Se duplicó", counted: String(p.stock) }),
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
                      : "Pendiente"}
                  </Note>
                </Card>
              );
            })}
        </>
      ),
    };

  return null;
}

const DUP_CACHE = new WeakMap<object, DuplicateGroup[]>();
