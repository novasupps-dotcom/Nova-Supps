import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import { Text, TextInput } from "../text";
import {
  findProductByCode,
  normalizeProductCode,
} from "../barcodes";
import { money, type Business, type Row } from "../business";
import { canScan } from "../native";
import {
  catalogCandidates,
  lookupProductCode,
  photoMatchesCatalog,
  type LookupResult,
  type OnlineProduct,
} from "../productLookup";
import { CameraScanner } from "../scanner";
import { Button, C, Card, Note, Pill, ProductPhoto, s } from "../ui";

export function InventoryCodeForm({
  b,
  code,
  products,
  selectedId,
  picker,
  startScanning,
  onCode,
  onCreate,
  onReceive,
  onLink,
  onRestore,
  onDetail,
  onSell,
  autoSell = false,
  onEnrich,
}: {
  b: Business;
  code: string;
  products: Row[];
  selectedId: string;
  picker: React.ReactNode;
  startScanning?: boolean;
  onCode: (code: string) => void;
  onCreate: (code: string, online?: OnlineProduct) => void;
  onReceive: (product: Row, code: string) => void;
  onLink: (product: Row, code: string, source?: string) => boolean;
  onRestore: (product: Row) => void;
  onDetail: (product: Row) => void;
  onSell?: (product: Row) => void;
  autoSell?: boolean;
  onEnrich: (product: Row, online: OnlineProduct) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [lookup, setLookup] = useState<{
    code: string;
    result?: LookupResult;
    busy?: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [linked, setLinked] = useState<{
    code: string;
    id: string;
    automatic?: boolean;
  } | null>(null);
  const [linkError, setLinkError] = useState("");
  const forceNext = useRef(false);
  const immediateNext = useRef(false);
  const attempted = useRef(new Set<string>());
  const linkRef = useRef(onLink);
  const enrichRef = useRef(onEnrich);
  const sellRef = useRef(onSell);
  const enriched = useRef(new Set<string>());
  const autoSold = useRef(new Set<string>());
  enrichRef.current = onEnrich;
  sellRef.current = onSell;
  linkRef.current = onLink;
  const normalized = normalizeProductCode(code);
  const valid = normalized.length > 0 && normalized.length <= 40;
  const local = valid ? findProductByCode(products, normalized) : null;
  const result = lookup?.code === normalized ? lookup.result : undefined;
  const busy = lookup?.code === normalized && lookup.busy;
  const online = result?.product;
  const candidates = useMemo(
    () => (online ? catalogCandidates(products, online) : []),
    [products, online],
  );
  const product =
    local ||
    (linked?.code === normalized
      ? products.find((p) => p.id === linked.id)
      : null);
  const selected = products.find(
    (item) => item.id === selectedId && !item.archived,
  );

  useEffect(() => {
    if (!startScanning || code || !canScan()) return;
    const timer = setTimeout(() => setScanning(true), 350);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    setLinkError("");
    if (!valid || scanning) return;
    const controller = new AbortController();
    const force = forceNext.current;
    forceNext.current = false;
    const delay = immediateNext.current ? 0 : 550;
    immediateNext.current = false;
    setLookup({ code: normalized, busy: true });
    // Una pausa al escribir evita buscar cada dígito. Cámara y lector con Enter comparten la resolución.
    const timer = setTimeout(() => {
      void lookupProductCode(
        normalized,
        b,
        force,
        controller.signal,
        local || undefined,
      )
        .then((next) => {
          if (!controller.signal.aborted)
            setLookup({ code: normalized, result: next });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setLookup({
              code: normalized,
              result: {
                kind: "unavailable",
                at: Date.now(),
                message:
                  "No se pudo completar la consulta. Busca en tu catálogo o vuelve a intentar.",
              },
            });
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, valid, local?.id, scanning, retry, b]);
  useEffect(() => {
    const match = candidates.find((candidate) => candidate.automatic);
    if (!match || local || scanning || !online) return;
    const key = normalized + ":" + match.product.id;
    if (attempted.current.has(key)) return;
    attempted.current.add(key);
    if (linkRef.current(match.product, normalized, online.source))
      setLinked({ code: normalized, id: match.product.id, automatic: true });
    else
      setLinkError(
        "No se pudo guardar la asociación. Revisa el producto y vuelve a vincularlo.",
      );
  }, [candidates, normalized, local?.id, scanning, online]);
  useEffect(() => {
    if (!product || !online || !photoMatchesCatalog(product, online)) return;
    const key = product.id + ":" + online.imageUri;
    if (enriched.current.has(key)) return;
    enriched.current.add(key);
    enrichRef.current(product, online);
  }, [product?.id, online]);
  useEffect(() => {
    if (
      !autoSell ||
      !product ||
      product.archived ||
      !product.inventoryKnown ||
      product.available < 1 ||
      scanning
    )
      return;
    const key = normalized + ":" + product.id;
    if (autoSold.current.has(key)) return;
    autoSold.current.add(key);
    sellRef.current?.(product);
  }, [autoSell, product?.id, product?.available, normalized, scanning]);

  const preview = (item: Row, external = false) => (
    <>
      <ProductPhoto
        key={String(item.id || item.code)}
        product={
          external
            ? item
            : {
                ...item,
                code: normalized,
                cleanImageUri:
                  online && photoMatchesCatalog(item, online)
                    ? online.imageUri
                    : item.cleanImageUri,
                lookupCode:
                  online && photoMatchesCatalog(item, online)
                    ? online.actualCode
                    : item.lookupCode,
                imageUris:
                  online && photoMatchesCatalog(item, online)
                    ? online.imageUris
                    : item.imageUris,
              }
        }
        style={{
          width: "100%",
          height: 190,
          borderRadius: 12,
          backgroundColor: C.paper,
        }}
      />
      <Text style={[s.subtitle, { marginTop: 12 }]}>{item.name}</Text>
      {!!item.brand && <Note>{item.brand}</Note>}
      {!!item.sku && <Note>SKU interno: {item.sku}</Note>}
      <Note>
        {[item.presentation, item.flavor].filter(Boolean).join(" · ") ||
          "Presentación por confirmar"}
      </Note>
      {!external && (
        <>
          <Text style={s.price}>{money(item.price)}</Text>
          <Note>Precio de venta registrado · solo consulta en esta ficha.</Note>
          <Pill
            text={
              item.inventoryKnown
                ? `${item.stock} piezas físicas · ${item.available} disponibles`
                : "Inventario por confirmar"
            }
            tone={item.inventoryKnown && item.available > 0 ? "ok" : "warn"}
          />
        </>
      )}
      {!!item.description && (
        <Text style={s.body} numberOfLines={4}>
          {item.description}
        </Text>
      )}
    </>
  );

  return (
    <>
      <View style={s.field}>
        <Text style={s.label}>Código de barras o SKU interno</Text>
        <TextInput
          accessibilityLabel="Código de barras o SKU interno"
          style={s.input}
          value={code}
          onChangeText={onCode}
          onSubmitEditing={() => {
            immediateNext.current = true;
            onCode(normalized);
            setRetry((value) => value + 1);
          }}
          submitBehavior="submit"
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Escanea con la cámara o el lector"
          returnKeyType="search"
        />
        <Note>
          Un lector USB o Bluetooth puede escribir el código y enviar Enter.
        </Note>
      </View>
      {canScan() && (
        <Button
          icon="scan-barcode" title="Escanear otro producto"
          secondary
          onPress={() => setScanning(true)}
        />
      )}
      <CameraScanner
        visible={scanning}
        continuous={false}
        instruction="Lee el código de barras o el SKU. La cámara se cerrará y aparecerá la ficha del producto."
        onClose={() => setScanning(false)}
        onScan={(raw) => {
          const next = normalizeProductCode(raw);
          if (!next || next.length > 40)
            return {
              text: "Lee un código de producto de hasta 40 caracteres.",
              bad: true,
            };
          immediateNext.current = true;
          onCode(next);
          return { text: "Código leído." };
        }}
      />
      {normalized.length > 40 && (
        <Note>El código admite hasta 40 caracteres.</Note>
      )}
      {product ? (
        <Card>
          <Pill text="Producto identificado en tu catálogo" tone="ok" />
          {preview(product)}
          <Note>Se cargaron tus datos guardados. Las fuentes en línea no cambian tu precio.</Note>
          {busy && <Note>Buscando información y foto en línea…</Note>}
          {online && (
            <>
              <Note>
                Fuente en línea: {online.source}
                {online.matchedBy === "catalog"
                  ? " · encontrada con nombre, marca y sabor de tu catálogo"
                  : " · código identificado"}
              </Note>
              {!!online.presentation &&
                online.presentation !== product.presentation && (
                  <Note>
                    Presentación publicada por la fuente: {online.presentation}.
                    Tu ficha indica: {product.presentation || "por confirmar"}.
                  </Note>
                )}
              <Button
                title="Consultar fuente"
                secondary
                small
                onPress={() =>
                  void Linking.openURL(online.sourceUrl).catch(() => {})
                }
              />
            </>
          )}
          {!busy && result && !online && <Note>{result.message}</Note>}
          <Button
            title="Buscar información y foto en línea"
            secondary
            small
            disabled={!!busy}
            onPress={() => {
              forceNext.current = true;
              setRetry((value) => value + 1);
            }}
          />
          {linked?.code === normalized && linked.id === product.id && (
            <Note>
              {linked.automatic
                ? "Código asociado automáticamente."
                : "Código vinculado al producto."}{" "}
              En la siguiente lectura se abrirá esta ficha directamente.
            </Note>
          )}
          {product.archived ? (
            <>
              <Note>
                Producto archivado. Restáuralo para agregar existencias o
                venderlo.
              </Note>
              <Button
                title="Restaurar producto"
                onPress={() => onRestore(product)}
              />
            </>
          ) : (
            <>
              <Button
                title="Agregar al stock"
                onPress={() => onReceive(product, normalized)}
              />
              {onSell && (
                <Button
                  title="Agregar una pieza al carrito"
                  secondary
                  disabled={!product.inventoryKnown || product.available < 1}
                  onPress={() => onSell(product)}
                />
              )}
            </>
          )}
          <Button
            title="Ver detalle completo"
            secondary
            onPress={() => onDetail(product)}
          />
          <Note>La entrada se guarda cuando confirmas cantidad y costo.</Note>
        </Card>
      ) : valid ? (
        <>
          {busy && (
            <Card>
              <ActivityIndicator color={C.ink} />
              <Note>Identificando el producto en línea…</Note>
            </Card>
          )}
          {online && (
            <Card>
              <Pill text="Vista previa del producto encontrado" tone="ok" />
              {preview(online, true)}
              <Note>
                Fuente: {online.source}
                {online.source === "Open Food Facts"
                  ? " · datos ODbL · foto CC BY-SA"
                  : ""}
              </Note>
              <Button
                title="Consultar fuente"
                secondary
                small
                onPress={() =>
                  void Linking.openURL(online.sourceUrl).catch(() => {})
                }
              />
              <Button
                title="Dar de alta con estos datos"
                onPress={() => onCreate(normalized, online)}
              />
              <Note>Revisa presentación, precio y existencias antes de guardar.</Note>
            </Card>
          )}
          {!!linkError && <Note color={C.red}>{linkError}</Note>}
          {!!candidates.length && !product && (
            <Card>
              <Text style={s.subtitle}>Coincidencias en tu catálogo</Text>
              <Note>
                Confirma la presentación y el sabor para guardar la asociación.
              </Note>
              {candidates.map(({ product: item }) => (
                <View key={item.id} style={{ marginTop: 12 }}>
                  <View style={s.productRow}>
                    <ProductPhoto product={item} style={s.productImage} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.subtitle}>{item.name}</Text>
                      <Note>
                        {[item.brand, item.presentation, item.flavor]
                          .filter(Boolean)
                          .join(" · ")}
                      </Note>
                    </View>
                  </View>
                  <Button
                    title="Es este producto: vincular código"
                    secondary
                    onPress={() => {
                      if (onLink(item, normalized, online?.source))
                        setLinked({ code: normalized, id: item.id });
                    }}
                  />
                </View>
              ))}
            </Card>
          )}
          <Card>
            {!!result?.message && !online && <Note>{result.message}</Note>}
            {!online && !busy && (
              <Button
                title="Dar de alta producto"
                onPress={() => onCreate(normalized)}
              />
            )}
            {picker}
            {!!selected && (
              <Note>
                El código se añadirá a {selected.name}. Sus otros códigos y su
                SKU se conservan.
              </Note>
            )}
            <Button
              title="Vincular al producto elegido"
              secondary
              disabled={!selected}
              onPress={() => {
                if (selected && onLink(selected, normalized))
                  setLinked({ code: normalized, id: selected.id });
              }}
            />
            {!busy && (
              <Button
                title="Volver a consultar en línea"
                secondary
                small
                onPress={() => {
                  forceNext.current = true;
                  setRetry((value) => value + 1);
                }}
              />
            )}
          </Card>
        </>
      ) : (
        <Note>Escanea un código para abrir la vista previa del producto.</Note>
      )}
    </>
  );
}
