// 2.1 · Catálogo para clientes: mensaje de WhatsApp o PDF con fotos y precios.
// 2.5 · Se elige al cliente y, con su número, el catálogo en PDF le llega a su chat de
// WhatsApp con un toque (el PDF se sube a la base en línea y se manda el enlace). La app
// avisa y registra a quién se le envió.
import * as FS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState } from "react";
import { Linking, Pressable, Share, Switch, View } from "react-native";
import { Text, TextInput } from "../text";
import {
  grossUp,
  localDay,
  promoTagFor,
  saleSegment,
  segmentsOf,
  today,
  type Business,
  type Row,
} from "../business";
import { catalogPdf, catalogText, prettyPhone, type CatalogItem, type CatalogPhoto } from "../catalogPdf";
import type { Cloud } from "../cloud";
import { jpegSize } from "../pdf";
import { base64ToBytes, bytesToBase64, compressJpegBase64, rgbToJpegBase64 } from "../photos";
import { decodePng, isPng, shrinkRgb } from "../png";
import { validWhatsapp, whatsappNumber } from "../receipt";
import { Button, C, Card, Checkbox, Chips, Icon, MenuList, Note, SearchBox, fmtDay, s } from "../ui";

export { STORE_NAME } from "../theme";
import { STORE_NAME, TILE } from "../theme";

type ItemWithSources = CatalogItem & { uris: string[] };
export type CatalogSend = { customerId: string; name: string; phone: string; at: string; url: string; count: number };

/** Productos que entran al catálogo, ordenados por categoría y nombre (precio al cliente). */
export function catalogItems(
  b: Business,
  products: Row[],
  feeBps: number,
  opts: { segment: string; includeOut: boolean },
): ItemWithSources[] {
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
    .map(({ p, segment }) => ({
      id: p.id,
      name: String(p.name),
      segment,
      price: grossUp(Number(p.price), feeBps),
      tag: promos.length ? promoTagFor(promos, p.id, segment, day) : "",
      imageKey: p.imageKey || p.sku || p.id,
      out: Number(p.available) < 1,
      // Mismo orden que las fotos de la app: la del proveedor, las extra y la tuya.
      uris: [p.cleanImageUri, ...(Array.isArray(p.imageUris) ? p.imageUris : []), p.imageUri].filter(
        (u, i, all) => typeof u === "string" && !!u && all.indexOf(u) === i,
      ),
    }));
}

const later = <T,>(ms: number, value: T) => new Promise<T>((r) => setTimeout(() => r(value), ms));
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
/** Bytes de una foto: archivo del teléfono o descarga (máximo 8 s; se guarda en caché). */
async function photoBytes(uri: string): Promise<{ bytes: Uint8Array; local: string } | null> {
  try {
    let local = uri;
    if (/^https?:/i.test(uri)) {
      local = `${FS.cacheDirectory}catalogo-${hash(uri)}`;
      const info = await FS.getInfoAsync(local);
      if (!info.exists) {
        const r: any = await Promise.race([FS.downloadAsync(uri, local), later(8000, null)]);
        if (!r || r.status >= 400) return null;
      }
    }
    const b64 = await FS.readAsStringAsync(local, { encoding: FS.EncodingType.Base64 });
    return b64 ? { bytes: base64ToBytes(b64), local } : null;
  } catch {
    return null;
  }
}
/** JPG con el convertidor del teléfono (WebP y otros formatos). */
async function nativeJpeg(uri: string): Promise<string | null> {
  try {
    const M = require("expo-image-manipulator");
    const ctx = M.ImageManipulator.manipulate(uri);
    ctx.resize({ width: 480 });
    const img = await ctx.renderAsync();
    const saved = await img.saveAsync({ compress: 0.78, format: M.SaveFormat.JPEG, base64: true });
    try {
      img.release();
    } catch {}
    return saved?.base64 || null;
  } catch {
    return null;
  }
}
/** Foto para el PDF: JPG reducido; PNG con transparencia sobre blanco; si no hay, la miniatura incluida. */
export async function photoFor(it: ItemWithSources): Promise<CatalogPhoto | null> {
  for (const uri of it.uris) {
    // 2.5.2: una foto que falla no detiene el catálogo; se prueba la siguiente o la miniatura.
    try {
      const got = await photoBytes(uri);
      if (!got) continue;
      const { bytes, local } = got;
      if (jpegSize(bytes)) {
        const b64 = bytesToBase64(bytes);
        return { kind: "jpeg", base64: b64.length > 160_000 ? compressJpegBase64(b64, 480, 74) : b64 };
      }
      if (isPng(bytes)) {
        const png = decodePng(bytes);
        if (png) return { kind: "jpeg", base64: rgbToJpegBase64(shrinkRgb(png, 420), 80) };
      }
      const converted = await nativeJpeg(local);
      if (converted) return { kind: "jpeg", base64: converted };
    } catch {}
  }
  const thumbs: Record<string, string> = require("../catalogueThumbs").catalogueThumbs;
  const thumb = thumbs[it.imageKey || ""] || thumbs[it.id];
  return thumb ? { kind: "jpeg", base64: thumb } : null;
}

export function CustomerCatalogPage({
  b,
  products,
  customers = [],
  feeBps,
  notify,
  getCloud = () => null,
  initialCustomerId = "",
  onSent,
}: {
  b: Business;
  products: Row[];
  customers?: Row[];
  feeBps: number;
  notify: (t: string) => void;
  getCloud?: () => Cloud | null;
  initialCustomerId?: string;
  onSent?: () => void;
}) {
  const [segment, setSegment] = useState("");
  const [includeOut, setIncludeOut] = useState(true);
  const [phone, setPhone] = useState<string>(String(b.setting("storeWhatsapp", "") || ""));
  const [note, setNote] = useState<string>(String(b.setting("catalogNote", "") || ""));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [picking, setPicking] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [toPhone, setToPhone] = useState("");
  const [savePhone, setSavePhone] = useState(true);
  const [sends, setSends] = useState<CatalogSend[]>(() => b.setting("catalogSends", []) || []);
  const active = customers.filter((c) => !c.archived);
  const chosen = active.find((c) => c.id === customerId) || null;
  const targetPhone = chosen?.phone ? String(chosen.phone) : toPhone;
  const canSend = validWhatsapp(targetPhone);
  const segments = useMemo(() => segmentsOf(products.filter((p) => !p.archived)), [products]);
  const items = useMemo(
    () => catalogItems(b, products, feeBps, { segment, includeOut }),
    [b, products, feeBps, segment, includeOut],
  );
  const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const matches = active
    .filter((c) => !pickQuery || fold(`${c.name} ${c.phone || ""}`).includes(fold(pickQuery)))
    .slice(0, 12);
  const info = () => {
    const wa = phone.replace(/\D/g, "");
    if (wa && !validWhatsapp(wa)) throw new Error("El WhatsApp de la tienda debe tener 10 dígitos.");
    b.setSetting("storeWhatsapp", wa);
    b.setSetting("catalogNote", note.trim().slice(0, 140));
    return { store: STORE_NAME, whatsapp: wa, note: note.trim().slice(0, 140), date: fmtDay(today()) };
  };
  /** Arma el PDF con todas las fotos y lo guarda en el teléfono. */
  const buildPdf = async () => {
    const data = info();
    setBusy("Preparando fotos…");
    await later(30, null);
    const withPhotos: CatalogItem[] = [];
    for (const it of items) withPhotos.push({ ...it, photo: await photoFor(it) });
    setBusy("Armando el PDF…");
    await later(30, null);
    const bytes = catalogPdf(withPhotos, data);
    const uri = FS.documentDirectory + `Catalogo_Nova_${today()}.pdf`;
    await FS.writeAsStringAsync(uri, bytesToBase64(bytes), { encoding: FS.EncodingType.Base64 });
    return { bytes, uri, data };
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
    try {
      const { uri } = await buildPdf();
      setBusy("");
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Compartir catálogo" });
      notify(`Catálogo listo · ${items.length} productos`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  /** Un toque: PDF a la nube y el chat del cliente abierto con el enlace (sin internet: el catálogo en texto). */
  const sendToCustomer = async () => {
    setErr("");
    const wa = whatsappNumber(targetPhone);
    const name = chosen?.name || prettyPhone(targetPhone);
    const first = String(chosen?.name || "").split(/\s+/)[0];
    try {
      const { bytes, data } = await buildPdf();
      let url = "";
      let why = "";
      const cloud = getCloud();
      if (cloud?.session) {
        setBusy("Subiendo el PDF…");
        try {
          const id = Math.random().toString(36).slice(2, 10);
          url = await cloud.uploadPublic("catalogos", `catalogo-${today()}-${id}.pdf`, bytes, "application/pdf");
        } catch (e) {
          why = e instanceof Error ? e.message : String(e);
        }
      } else why = "Conecta la base en línea (Ajustes → Vendedores) para mandar el PDF.";
      const hello = first ? `Hola ${first}, ` : "Hola, ";
      const message = url
        ? `${hello}te comparto el catálogo de ${STORE_NAME} (${data.date}) con fotos y precios:\n${url}${data.note ? `\n\n${data.note}` : ""}`
        : `${hello}te comparto el catálogo de ${STORE_NAME}:\n\n${catalogText(items, data)}`;
      setBusy("Abriendo WhatsApp…");
      await Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent(message)}`);
      if (chosen && !chosen.phone && savePhone) b.saveCustomer({ ...chosen, phone: targetPhone.replace(/\D/g, "") });
      const entry: CatalogSend = { customerId: chosen?.id || "", name, phone: wa, at: new Date().toISOString(), url, count: items.length };
      const next = [entry, ...sends].slice(0, 100);
      b.setSetting("catalogSends", next);
      setSends(next);
      onSent?.();
      notify(url ? `Catálogo enviado a ${name}` : `Catálogo enviado a ${name} en texto`);
      if (why) setErr(`Se mandó en texto: ${why}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <Text style={[s.section, { marginTop: 4 }]}>Enviar a</Text>
      <MenuList
        items={[
          {
            key: "to",
            title: chosen ? chosen.name : "Elegir cliente",
            desc: chosen
              ? chosen.phone
                ? `WhatsApp ${prettyPhone(String(chosen.phone))}`
                : "Sin WhatsApp guardado"
              : "Busca por nombre o teléfono",
            icon: "user",
            tint: chosen ? TILE.red : TILE.graphite,
            onPress: () => setPicking(!picking),
          },
        ]}
      />
      {picking && (
        <Card>
          <SearchBox value={pickQuery} onChange={setPickQuery} placeholder="Buscar cliente" />
          {matches.map((c, i) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => (setCustomerId(c.id), setPicking(false), setPickQuery(""))}
              style={({ pressed }) => [s.cartRow, i === matches.length - 1 && { borderBottomWidth: 0 }, pressed && { opacity: 0.6 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.body, { fontWeight: "500" }]}>{c.name}</Text>
                <Text style={[s.muted, { fontSize: 13 }]}>{c.phone ? prettyPhone(String(c.phone)) : "Sin WhatsApp"}</Text>
              </View>
              {c.id === customerId && <Icon name="check" size={18} color={C.brand} />}
            </Pressable>
          ))}
          {!matches.length && <Note>No hay clientes con ese nombre.</Note>}
          <Pressable
            accessibilityRole="button"
            onPress={() => (setCustomerId(""), setPicking(false))}
            style={{ paddingTop: 10 }}
          >
            <Text style={{ color: C.brand, fontSize: 15 }}>Sin cliente: escribir el número</Text>
          </Pressable>
        </Card>
      )}
      {!picking && !chosen?.phone && (
        <View style={s.field}>
          <Text style={s.label}>WhatsApp del cliente (10 dígitos)</Text>
          <TextInput
            accessibilityLabel="WhatsApp del cliente (10 dígitos)"
            style={s.input}
            value={toPhone}
            onChangeText={setToPhone}
            keyboardType="phone-pad"
            placeholder="55 1234 5678"
            placeholderTextColor={C.muted}
          />
          {!!chosen && (
            <Checkbox label={`Guardar este número en ${chosen.name}`} value={savePhone} onChange={setSavePhone} />
          )}
        </View>
      )}
      {!!err && <Note color={C.red}>{err}</Note>}
      {!!busy && <Note>{busy}</Note>}
      <Button
        icon="send"
        title={busy ? "Preparando…" : `Enviar catálogo${chosen ? ` a ${String(chosen.name).split(/\s+/)[0]}` : ""} por WhatsApp`}
        disabled={!items.length || !!busy || !canSend}
        onPress={() => void sendToCustomer()}
      />
      <Note>Se abre su chat con el enlace al PDF; solo toca enviar. La app registra a quién se lo mandaste.</Note>

      <Text style={s.section}>Contenido</Text>
      <Card>
        <Text style={[s.label, { marginTop: 0 }]}>WhatsApp de la tienda para pedidos (10 dígitos)</Text>
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
      <Chips
        row
        options={segments.map((x) => ({ id: x, name: x }))}
        value={segment}
        onChange={setSegment}
        allowEmpty="Todas"
      />
      <View style={[s.between, { marginVertical: 8 }]}>
        <Text style={[s.body, { flex: 1 }]}>Incluir productos sin existencias</Text>
        <Switch
          accessibilityLabel="Incluir productos sin existencias"
          value={includeOut}
          trackColor={{ true: C.green, false: C.fill }}
          thumbColor="#fff"
          onValueChange={setIncludeOut}
        />
      </View>
      <Note>{`${items.length} ${items.length === 1 ? "producto" : "productos"} con foto y precio final${includeOut ? "; los agotados aparecen marcados" : ""}.`}</Note>

      <Text style={s.section}>Otras formas</Text>
      <Button
        icon="file-text"
        title={busy ? "Preparando…" : "Crear PDF con fotos"}
        secondary
        disabled={!items.length || !!busy}
        onPress={() => void sharePdf()}
      />
      <Button
        icon="message-circle"
        title="Compartir mensaje de WhatsApp"
        secondary
        disabled={!items.length || !!busy}
        onPress={() => void shareText()}
      />
      {!!sends.length && (
        <>
          <Text style={s.section}>Últimos envíos</Text>
          <View style={[s.list, { paddingHorizontal: 16 }]}>
            {sends.slice(0, 5).map((x, i) => (
              <View key={x.at + i} style={[s.cartRow, i === Math.min(4, sends.length - 1) && { borderBottomWidth: 0 }]}>
                <Icon name={x.url ? "file-text" : "message-circle"} size={18} color={C.muted} />
                <Text style={[s.body, { flex: 1 }]} numberOfLines={1}>
                  {x.name}
                </Text>
                <Text style={s.muted}>{fmtDay(localDay(x.at))}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </>
  );
}
