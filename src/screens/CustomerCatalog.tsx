// 2.1 · Catálogo para clientes: mensaje de WhatsApp o PDF con fotos y precios.
import * as FS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState } from "react";
import { Share, Switch, Text, TextInput, View } from "react-native";
import {
  grossUp,
  promoTagFor,
  saleSegment,
  segmentsOf,
  today,
  type Business,
  type Row,
} from "../business";
import { catalogPdf, catalogText, type CatalogItem } from "../catalogPdf";
import { bytesToBase64, compressJpegBase64 } from "../photos";
import { validWhatsapp } from "../receipt";
import { Button, C, Card, Chips, fmtDay, Note, s } from "../ui";

export const STORE_NAME = "GNS · Nova Supps";

/** Productos que entran al catálogo, ordenados por categoría y nombre (precio al cliente). */
export function catalogItems(
  b: Business,
  products: Row[],
  feeBps: number,
  opts: { segment: string; includeOut: boolean },
): CatalogItem[] {
  const promos = b.promos();
  const day = today();
  return products
    .filter((p) => !p.archived && (opts.includeOut || Number(p.available) > 0))
    .map((p) => ({ p, segment: saleSegment(p) }))
    .filter((x) => !opts.segment || x.segment === opts.segment)
    .sort((a, z) =>
      a.segment === z.segment
        ? String(a.p.name).localeCompare(String(z.p.name), "es")
        : a.segment.localeCompare(z.segment, "es"),
    )
    .map(
      ({ p, segment }) =>
        ({
          id: p.id,
          name: String(p.name),
          segment,
          price: grossUp(Number(p.price), feeBps),
          tag: promos.length ? promoTagFor(promos, p.id, segment, day) : "",
          imageKey: p.imageKey || p.sku || p.id,
          imageUri: p.imageUri || "",
        }) as CatalogItem & { imageUri: string },
    );
}

/** Foto en base64 para el PDF: la tuya (reducida) o la miniatura del catálogo incluido. */
async function photoFor(
  it: CatalogItem & { imageUri?: string },
): Promise<string | null> {
  if (it.imageUri && /\.jpe?g$/i.test(it.imageUri)) {
    try {
      const raw = await FS.readAsStringAsync(it.imageUri, {
        encoding: FS.EncodingType.Base64,
      });
      return raw.length > 120_000 ? compressJpegBase64(raw, 360, 70) : raw;
    } catch {}
  }
  const thumbs: Record<string, string> =
    require("../catalogueThumbs").catalogueThumbs;
  return thumbs[it.imageKey || ""] || thumbs[it.id] || null;
}

export function CustomerCatalogPage({
  b,
  products,
  feeBps,
  notify,
}: {
  b: Business;
  products: Row[];
  feeBps: number;
  notify: (t: string) => void;
}) {
  const [segment, setSegment] = useState("");
  const [includeOut, setIncludeOut] = useState(false);
  const [phone, setPhone] = useState<string>(
    String(b.setting("storeWhatsapp", "") || ""),
  );
  const [note, setNote] = useState<string>(
    String(b.setting("catalogNote", "") || ""),
  );
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const segments = useMemo(
    () => segmentsOf(products.filter((p) => !p.archived)),
    [products],
  );
  const items = useMemo(
    () => catalogItems(b, products, feeBps, { segment, includeOut }),
    [b, products, feeBps, segment, includeOut],
  );
  const info = () => {
    const wa = phone.replace(/\D/g, "");
    if (wa && !validWhatsapp(wa))
      throw new Error("El WhatsApp de la tienda debe tener 10 dígitos.");
    b.setSetting("storeWhatsapp", wa);
    b.setSetting("catalogNote", note.trim().slice(0, 140));
    return {
      store: STORE_NAME,
      whatsapp: wa,
      note: note.trim().slice(0, 140),
      date: fmtDay(today()),
    };
  };
  const shareText = async () => {
    setErr("");
    try {
      await Share.share({ message: catalogText(items, info()) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const sharePdf = async () => {
    setErr("");
    setBusy("Preparando fotos…");
    try {
      const data = info();
      await new Promise((r) => setTimeout(r, 30));
      const withPhotos: CatalogItem[] = [];
      for (const it of items)
        withPhotos.push({ ...it, imageBase64: await photoFor(it) });
      setBusy("Armando el PDF…");
      await new Promise((r) => setTimeout(r, 30));
      const bytes = catalogPdf(withPhotos, data);
      const uri = FS.documentDirectory + `Catalogo_Nova_${today()}.pdf`;
      await FS.writeAsStringAsync(uri, bytesToBase64(bytes), {
        encoding: FS.EncodingType.Base64,
      });
      setBusy("");
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Compartir catálogo",
      });
      notify(`Catálogo listo · ${items.length} productos`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <Note>
        Mándale a tus clientes tus productos con foto y precio (el precio que
        pagan, ya con la comisión). Las promociones vigentes aparecen marcadas.
      </Note>
      <Card>
        <Text style={s.label}>
          WhatsApp de la tienda para pedidos (10 dígitos)
        </Text>
        <TextInput
          accessibilityLabel="WhatsApp de la tienda para pedidos (10 dígitos)"
          style={s.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="55 1234 5678"
          placeholderTextColor={C.muted}
        />
        <Text style={s.label}>Nota para tus clientes (opcional)</Text>
        <TextInput
          accessibilityLabel="Nota para tus clientes (opcional)"
          style={s.input}
          value={note}
          onChangeText={setNote}
          placeholder="Ej. Envío gratis desde $1,000"
          placeholderTextColor={C.muted}
        />
      </Card>
      <Text style={s.label}>Categoría</Text>
      <Chips
        options={segments.map((x) => ({ id: x, name: x }))}
        value={segment}
        onChange={setSegment}
        allowEmpty="Todas"
      />
      <View style={[s.between, { marginVertical: 6 }]}>
        <Text style={[s.body, { flex: 1 }]}>
          Incluir productos sin existencias
        </Text>
        <Switch
          accessibilityLabel="Incluir productos sin existencias"
          value={includeOut}
          onValueChange={setIncludeOut}
        />
      </View>
      <Note>{`${items.length} ${items.length === 1 ? "producto" : "productos"} en el catálogo.`}</Note>
      {!!err && <Note color={C.red}>{err}</Note>}
      {!!busy && <Note>{busy}</Note>}
      <Button
        title="💬 Compartir mensaje de WhatsApp"
        disabled={!items.length || !!busy}
        onPress={() => void shareText()}
      />
      <Button
        title={busy ? "Preparando…" : "📄 Crear PDF con fotos"}
        secondary
        disabled={!items.length || !!busy}
        onPress={() => void sharePdf()}
      />
    </>
  );
}
