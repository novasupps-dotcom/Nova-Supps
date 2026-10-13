// Componentes compartidos. El lector se carga solo si existe su módulo nativo.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { catalogueImages } from "./catalogueImages";
import { canScan } from "./native";
import { CameraScanner } from "./scanner";
import { cents, money, today, saleSegment, segmentsOf, type Row } from "./business";

export const C = {
  bg: "#F3F4EF",
  paper: "#FFFFFF",
  ink: "#173D32",
  muted: "#5F6E64",
  accent: "#D5EC9C",
  soft: "#EAF0E4",
  line: "#DFE5DC",
  red: "#A53B36",
  redSoft: "#F8E5E3",
  amber: "#8A5A00",
  amberSoft: "#FBF0D9",
  green: "#2E6B3F",
  greenSoft: "#E3F1E6",
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-10-02" → "2 oct 2026". */
export function fmtDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) return day || "";
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export function addMonths(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  // 31 de octubre + 1 mes = 30 de noviembre (último día del mes, no se brinca al siguiente).
  const last = new Date(y, m + n, 0).getDate();
  const x = new Date(y, m - 1 + n, Math.min(d, last));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export function daysBetween(a: string, b: string) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
/** Días de anticipación para avisar de un seguimiento (próximo contacto). */
export const FOLLOW_UP_DAYS = 5;
/** Clientes con próximo contacto vencido o dentro de los próximos `days` días (el más cercano primero). */
export function followUpsDue<T extends { archived?: any; nextDate?: string }>(customers: T[], days = FOLLOW_UP_DAYS, day = today()): (T & { daysLeft: number })[] {
  const until = addDays(day, days);
  return customers
    .filter((c) => !c.archived && /^\d{4}-\d{2}-\d{2}$/.test(c.nextDate || "") && (c.nextDate as string) <= until)
    .map((c) => ({ ...c, daysLeft: daysBetween(day, c.nextDate as string) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
/** "Hoy", "Mañana", "En 3 días · 10 oct 2026" o "Vencido hace 2 días". */
export function followUpLabel(daysLeft: number, nextDate: string) {
  if (daysLeft < 0) return `Vencido hace ${-daysLeft} ${daysLeft === -1 ? "día" : "días"}`;
  if (daysLeft === 0) return "Hoy";
  if (daysLeft === 1) return `Mañana · ${fmtDay(nextDate)}`;
  return `En ${daysLeft} días · ${fmtDay(nextDate)}`;
}
/** Importe escrito → centavos, o null si aún no es válido. */
export function tryCents(raw: string): number | null {
  try {
    return raw?.trim() ? cents(raw) : null;
  } catch {
    return null;
  }
}

export function Button({
  title,
  onPress,
  secondary = false,
  danger = false,
  small = false,
  disabled = false,
  flex = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  small?: boolean;
  disabled?: boolean;
  flex?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        danger && s.danger,
        small && s.small,
        flex && { flex: 1 },
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: C.ink }, danger && { color: C.red }, small && { fontSize: 13 }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Card({ children, onPress, tone }: { children: React.ReactNode; onPress?: () => void; tone?: "warn" | "ok" | "bad" }) {
  const toneStyle = tone === "warn" ? { backgroundColor: C.amberSoft, borderColor: "#F0DDB0" } : tone === "bad" ? { backgroundColor: C.redSoft, borderColor: "#EBC7C3" } : tone === "ok" ? { backgroundColor: C.greenSoft, borderColor: "#C8E2CE" } : null;
  if (onPress)
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.card, toneStyle, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  return <View style={[s.card, toneStyle]}>{children}</View>;
}
export function Note({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text style={[s.muted, color ? { color } : null]}>{children}</Text>;
}
export function Pill({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "ok" | "warn" | "bad" }) {
  const bg = tone === "ok" ? C.greenSoft : tone === "warn" ? C.amberSoft : tone === "bad" ? C.redSoft : C.soft;
  const fg = tone === "ok" ? C.green : tone === "warn" ? C.amber : tone === "bad" ? C.red : C.ink;
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}
/** Fila de opciones de una sola elección (reemplaza al selector modal cuando son pocas). */
export function Chips({
  options,
  value,
  onChange,
  allowEmpty,
}: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: string;
}) {
  const all = allowEmpty ? [{ id: "", name: allowEmpty }, ...options] : options;
  return (
    <View style={s.wrap}>
      {all.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id || "empty"}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={[s.chip, on && s.chipOn]}
          >
            <Text style={[s.chipText, on && s.chipTextOn]}>{o.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
/** Casilla de verificación grande y fácil de tocar. */
export function Checkbox({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={[s.checkRow, value && { borderColor: C.ink, backgroundColor: C.greenSoft }]}
    >
      <View style={[s.checkBox, value && { backgroundColor: C.ink, borderColor: C.ink }]}>{value && <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>✓</Text>}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.body, { fontWeight: "700" }]}>{label}</Text>
        {!!hint && <Text style={s.muted}>{hint}</Text>}
      </View>
    </Pressable>
  );
}
export function SearchBox({ value, onChange, placeholder, onSubmit }: { value: string; onChange: (v: string) => void; placeholder: string; onSubmit?: () => void }) {
  return (
    <View style={[s.input, s.searchRow]}>
      <Text style={{ color: C.muted, fontSize: 16 }}>⌕</Text>
      <TextInput
        accessibilityLabel={placeholder}
        style={{ flex: 1, fontSize: 16, color: C.ink, paddingVertical: 0 }}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        blurOnSubmit={!onSubmit}
      />
      {!!value && (
        <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => onChange("")} hitSlop={12}>
          <Text style={{ color: C.muted, fontSize: 18 }}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}
/**
 * Campo para los códigos que genera el dueño (GNS / CAM / REC). El prefijo ya
 * está escrito: solo se teclean los 8 caracteres y la app pone el guion sola.
 * No se puede pegar (sin menú de copiar/pegar y se rechaza cualquier texto que
 * entre de golpe): el código se escribe a mano, letra por letra.
 */
export function CodeInput({ prefix, label, value, onChange }: { prefix: "GNS" | "CAM" | "REC"; label: string; value: string; onChange: (raw: string) => void }) {
  const [warn, setWarn] = useState("");
  const last = useRef(value);
  last.current = value;
  const shown = value.length > 4 ? `${value.slice(0, 4)}-${value.slice(4)}` : value;
  function change(text: string) {
    let raw = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (raw.startsWith(prefix) && raw.length > 8) raw = raw.slice(prefix.length);
    raw = raw.slice(0, 8);
    const prev = last.current;
    // Más de un carácter nuevo a la vez = texto pegado o sugerido por el teclado.
    if (raw.length > prev.length + 1) {
      setWarn("Escribe el código letra por letra; no se puede pegar.");
      return;
    }
    // Borrar justo sobre el guion: quita el carácter anterior.
    if (raw === prev && text.length < shown.length) raw = raw.slice(0, -1);
    setWarn("");
    onChange(raw);
  }
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.input, { flexDirection: "row", alignItems: "center", paddingVertical: 0 }]}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: C.muted, letterSpacing: 2 }}>{`${prefix}-`}</Text>
        <TextInput
          accessibilityLabel={label}
          style={{ flex: 1, fontSize: 20, fontWeight: "800", color: C.ink, letterSpacing: 2, paddingVertical: 12 }}
          value={shown}
          onChangeText={change}
          placeholder="XXXX-XXXX"
          placeholderTextColor={C.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          importantForAutofill="no"
          keyboardType="visible-password"
          contextMenuHidden
          selectTextOnFocus={false}
          maxLength={9}
        />
      </View>
      {!!warn && <Text style={{ color: C.red, marginTop: 6 }}>{warn}</Text>}
      <Note>{`${value.length}/8 · solo el código; sin guiones. No lleva las letras O ni I, ni los números 0 ni 1.`}</Note>
    </View>
  );
}
export function ProductPhoto({ product, index = 0, style }: { product: Row; index?: number; style: any }) {
  const [failed, setFailed] = useState(false);
  const images = catalogueImages[product.imageKey] || catalogueImages[product.sku] || catalogueImages[product.id] || [];
  const source = product.imageUri && !failed && index === 0 ? { uri: product.imageUri } : images[index];
  return source ? (
    <Image source={source} onError={() => setFailed(true)} resizeMode="contain" style={style} accessibilityLabel={product.name} />
  ) : (
    <View style={[style, { alignItems: "center", justifyContent: "center", backgroundColor: C.soft, borderRadius: 10 }]}>
      <Text style={{ fontSize: 26 }}>📦</Text>
    </View>
  );
}
export type GridProduct = { id: string; name: string; price: number; category?: string; sku?: string; brand?: string; barcode?: string; imageKey?: string; imageUri?: string; tag?: string };
/** Código escrito o leído con un lector (USB/Bluetooth): coincide exacto con el código de barras o el SKU. */
export function matchCode<T extends { sku?: string | null; barcode?: string | null }>(products: T[], raw: string): T | null {
  const code = String(raw || "").trim().toUpperCase();
  if (code.length < 3) return null;
  return products.find((p) => String(p.barcode || "").trim().toUpperCase() === code) || products.find((p) => String(p.sku || "").trim().toUpperCase() === code) || null;
}
const fold = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/**
 * 1.7 · Vender por categoría con fotos: pestañas (Creatinas, Proteínas, PWO,
 * Snacks, Vitaminas…) y cuadrícula con la imagen de cada producto. Tocar la
 * foto agrega una pieza; el número en la esquina es lo que lleva la venta.
 */
export function ProductGrid({
  products,
  qtyOf,
  limitOf,
  onAdd,
  onRemove,
  segment,
  onSegment,
  query: queryProp,
  onQuery,
}: {
  products: GridProduct[];
  qtyOf: (id: string) => number;
  limitOf: (id: string) => number;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  segment: string;
  onSegment: (s: string) => void;
  /** Búsqueda controlada desde fuera (para borrarla al terminar la venta). */
  query?: string;
  onQuery?: (q: string) => void;
}) {
  const [ownQuery, setOwnQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const query = queryProp ?? ownQuery;
  const setQuery = onQuery ?? setOwnQuery;
  const [width, setWidth] = useState(0);
  // Categoría y texto de búsqueda de cada producto se calculan una sola vez (no en cada tecla o toque).
  const index = useMemo(() => {
    const seg = new Map<string, string>();
    const hay = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const p of products) {
      const g = saleSegment(p);
      seg.set(p.id, g);
      counts.set(g, (counts.get(g) ?? 0) + 1);
      hay.set(p.id, fold(`${p.name} ${p.sku || ""} ${p.brand || ""} ${p.category || ""} ${p.barcode || ""}`));
    }
    return { seg, hay, counts, segments: segmentsOf(products) };
  }, [products]);
  const segments = index.segments;
  const current = segments.includes(segment) || segment === "Todos" ? segment : segments[0] || "Todos";
  const q = fold(query.trim());
  const shown = products.filter((p) => (q ? (index.hay.get(p.id) || "").includes(q) : current === "Todos" || index.seg.get(p.id) === current));
  const cols = width >= 840 ? 4 : width >= 560 ? 3 : 2;
  const GAP = 10;
  const tileWidth: any = width ? Math.floor((width - GAP * (cols - 1)) / cols) : "48%";
  const count = (name: string) => index.counts.get(name) ?? 0;
  // Lector de códigos (teclado USB/Bluetooth): al leer el código y "Enter" se agrega al carrito.
  const submit = () => {
    const hit = matchCode(products, query);
    if (hit) {
      onAdd(hit.id);
      setQuery("");
    }
  };
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}><SearchBox value={query} onChange={setQuery} placeholder="Buscar producto" onSubmit={submit} /></View>
        {canScan() && <Pressable accessibilityRole="button" accessibilityLabel="Leer código con cámara" style={[s.stepper, { width: 48, height: 48 }]} onPress={() => setScannerOpen(true)}><Text style={s.subtitle}>📷</Text></Pressable>}
      </View>
      <CameraScanner visible={scannerOpen} onClose={() => setScannerOpen(false)} onScan={code => {
        const hit = matchCode(products, code);
        if (!hit) return { text: "No está en el catálogo.", bad: true };
        if (qtyOf(hit.id) >= limitOf(hit.id)) return { text: `${hit.name}: no quedan piezas disponibles.`, bad: true };
        onAdd(hit.id);
        return { text: `Agregado: ${hit.name}` };
      }} />
      {!q && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }} style={{ marginBottom: 8 }} keyboardShouldPersistTaps="handled">
          {[...segments, "Todos"].map((name) => {
            const on = name === current;
            return (
              <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Categoría ${name}`} onPress={() => onSegment(name)} style={[s.chip, on && s.chipOn]}>
                <Text style={[s.chipText, on && s.chipTextOn]}>{name === "Todos" ? `Todos (${products.length})` : `${name} (${count(name)})`}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {!!q && <Note>{`${shown.length} ${shown.length === 1 ? "resultado" : "resultados"} en todas las categorías`}</Note>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
        {shown.map((p) => {
          const qty = qtyOf(p.id);
          const max = limitOf(p.id);
          const out = max < 1 && qty < 1;
          const atMax = qty >= max;
          return (
            <View key={p.id} style={[s.tile, { width: tileWidth }, qty > 0 && s.tileOn, out && { opacity: 0.45 }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Agregar ${p.name}`} accessibilityState={{ disabled: out || atMax }} disabled={out} onPress={() => onAdd(p.id)}>
                <View style={s.tilePhoto}>
                  <ProductPhoto product={p} style={{ width: "100%", height: "100%" }} />
                  {qty > 0 && (
                    <View style={s.tileBadge}>
                      <Text style={s.tileBadgeText}>{qty}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.tileName} numberOfLines={2}>
                  {p.name}
                </Text>
                <Text style={s.tilePrice}>{money(p.price)}</Text>
                {!!p.tag && <Text style={s.tileTag} numberOfLines={1}>{`🏷️ ${p.tag}`}</Text>}
                <Text style={[s.tileStock, { color: max < 1 ? C.red : max <= 2 ? C.amber : C.muted }]}>{!Number.isFinite(max) ? "" : max < 1 ? (qty ? "Ya no quedan más" : "Sin existencias") : `${max} ${max === 1 ? "disponible" : "disponibles"}`}</Text>
              </Pressable>
              {qty > 0 && (
                <View style={s.tileActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Quitar una de ${p.name}`} style={s.tileBtn} onPress={() => onRemove(p.id)}>
                    <Text style={s.subtitle}>{qty > 1 ? "−" : "✕"}</Text>
                  </Pressable>
                  <Text style={[s.subtitle, { marginBottom: 0 }]}>{qty}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Agregar otra de ${p.name}`} accessibilityState={{ disabled: atMax }} style={[s.tileBtn, atMax && { opacity: 0.35 }]} onPress={() => onAdd(p.id)}>
                    <Text style={s.subtitle}>＋</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>
      {!shown.length && <Note>{q ? "No hay coincidencias." : "No hay productos en esta categoría."}</Note>}
    </View>
  );
}
export function CardFeePreview({ value, bps = 406 }: { value: number | null; bps?: number }) {
  if (value === null || !Number.isSafeInteger(value) || value < 0) return <Note>Completa el importe del cobro.</Note>;
  const fee = Math.round((value * bps) / 10000);
  return (
    <Card tone="warn">
      <Text style={s.subtitle}>Cobro con tarjeta</Text>
      <Text style={s.body}>Cobro: {money(value)}</Text>
      <Text style={s.body}>{`Comisión Mercado Pago ${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%: ${money(fee)}`}</Text>
      <Text style={s.price}>Neto: {money(value - fee)}</Text>
      <Note>La comisión se descuenta una sola vez del importe cobrado.</Note>
    </Card>
  );
}

type Quick = { label: string; days?: number; months?: number };
export const QUICK_FOLLOWUP: Quick[] = [
  { label: "Hoy", days: 0 },
  { label: "Mañana", days: 1 },
  { label: "En 3 días", days: 3 },
  { label: "En 1 semana", days: 7 },
  { label: "En 2 semanas", days: 14 },
];
export const QUICK_EXPIRY: Quick[] = [
  { label: "6 meses", months: 6 },
  { label: "1 año", months: 12 },
  { label: "18 meses", months: 18 },
  { label: "2 años", months: 24 },
];
export const QUICK_CAMPAIGN: Quick[] = [
  { label: "Hoy", days: 0 },
  { label: "En 1 semana", days: 7 },
  { label: "En 1 mes", months: 1 },
];
/** Fecha con atajos y calendario; guarda AAAA-MM-DD (compatible con la base). */
export function DateField({
  label,
  value,
  onChange,
  quick,
  allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  quick: Quick[];
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today();
  const [month, setMonth] = useState(base.slice(0, 7));
  // El calendario sigue a la fecha elegida (p. ej. "Ayer" el día 1 cambia de mes).
  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) setMonth(value.slice(0, 7));
  }, [value]);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [...Array((first + 6) % 7).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const pick = (d: number) => {
    onChange(`${month}-${String(d).padStart(2, "0")}`);
    setOpen(false);
  };
  const shift = (n: number) => {
    const x = new Date(y, m - 1 + n, 1);
    setMonth(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} style={[s.input, s.between]} onPress={() => setOpen(!open)}>
        <Text style={{ color: value ? C.ink : C.muted, fontSize: 16 }}>{value ? fmtDay(value) : "Sin fecha"}</Text>
        <Text style={{ color: C.muted }}>📅</Text>
      </Pressable>
      <View style={[s.wrap, { marginTop: 8 }]}>
        {quick.map((q) => {
          const v = q.months ? addMonths(today(), q.months) : addDays(today(), q.days ?? 0);
          return (
            <Pressable key={q.label} accessibilityRole="button" style={[s.chip, value === v && s.chipOn]} onPress={() => onChange(v)}>
              <Text style={[s.chipText, value === v && s.chipTextOn]}>{q.label}</Text>
            </Pressable>
          );
        })}
        {allowEmpty && !!value && (
          <Pressable accessibilityRole="button" style={s.chip} onPress={() => onChange("")}>
            <Text style={s.chipText}>Quitar fecha</Text>
          </Pressable>
        )}
      </View>
      {open && (
        <View style={s.calendar}>
          <View style={s.between}>
            <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => shift(-1)} hitSlop={10} style={s.calNav}>
              <Text style={s.subtitle}>‹</Text>
            </Pressable>
            <Text style={s.subtitle}>
              {MONTHS_LONG[m - 1]} {y}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" onPress={() => shift(1)} hitSlop={10} style={s.calNav}>
              <Text style={s.subtitle}>›</Text>
            </Pressable>
          </View>
          <View style={s.calGrid}>
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
              <Text key={"h" + i} style={[s.calCell, { color: C.muted, fontWeight: "700" }]}>
                {d}
              </Text>
            ))}
            {cells.map((d, i) => {
              const v = d ? `${month}-${String(d).padStart(2, "0")}` : "";
              const on = v === value;
              const isToday = v === today();
              return d ? (
                <Pressable key={i} accessibilityRole="button" accessibilityLabel={fmtDay(v)} onPress={() => pick(d)} style={[s.calCellBox, on && { backgroundColor: C.ink }, isToday && !on && { borderWidth: 1, borderColor: C.ink }]}>
                  <Text style={{ color: on ? "#fff" : C.ink, fontWeight: isToday ? "800" : "500" }}>{d}</Text>
                </Pressable>
              ) : (
                <View key={i} style={s.calCellBox} />
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderColor: C.line,
    minHeight: 64,
  },
  wordmark: { fontSize: 22, fontWeight: "900", letterSpacing: 0.8, color: C.ink },
  headerTitle: { fontSize: 22, fontWeight: "800", color: C.ink, flex: 1 },
  backBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingRight: 10, minHeight: 44 },
  badge: { backgroundColor: C.accent, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6 },
  badgeText: { color: C.ink, fontSize: 11, fontWeight: "700" },
  content: { padding: 18, paddingBottom: 120, width: "100%", alignSelf: "center" },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.6, color: C.ink, marginBottom: 4 },
  subtitle: { fontSize: 17, fontWeight: "700", color: C.ink, marginBottom: 6 },
  section: { fontSize: 13, fontWeight: "800", color: C.muted, letterSpacing: 1, marginTop: 14, marginBottom: 8, textTransform: "uppercase" },
  body: { fontSize: 15, color: C.ink, lineHeight: 22, marginVertical: 2 },
  muted: { fontSize: 13.5, color: C.muted, lineHeight: 20 },
  card: { backgroundColor: C.paper, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  heroAmount: { fontSize: 38, fontWeight: "800", color: "#fff", marginVertical: 8 },
  button: {
    backgroundColor: C.ink,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
    minHeight: 48,
  },
  secondary: { backgroundColor: C.soft, borderWidth: 1, borderColor: C.line },
  danger: { backgroundColor: C.redSoft, borderWidth: 1, borderColor: "#EBC7C3" },
  small: { minHeight: 40, paddingVertical: 8, paddingHorizontal: 12 },
  buttonText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 4 },
  row: { flexDirection: "row", gap: 8, marginVertical: 4 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  productRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  productImage: { width: 76, height: 96 },
  price: { fontSize: 20, color: C.ink, fontWeight: "800", marginVertical: 4 },
  photo: { height: 200, width: "100%", marginVertical: 12 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "700", color: C.ink, marginBottom: 7 },
  input: {
    borderWidth: 1,
    borderColor: "#CCD6C9",
    borderRadius: 12,
    backgroundColor: "#FFF",
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: C.ink,
    minHeight: 50,
    justifyContent: "center",
  },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, paddingVertical: 10 },
  nav: { backgroundColor: "#FFF", borderTopWidth: 1, borderColor: C.line },
  navRow: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 6 },
  navItem: { flex: 1, minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 14, gap: 2 },
  navOn: { backgroundColor: C.accent },
  navIcon: { fontSize: 20 },
  navText: { fontSize: 12, color: C.muted, fontWeight: "600" },
  fab: {
    position: "absolute",
    right: 18,
    backgroundColor: C.ink,
    borderRadius: 30,
    paddingHorizontal: 22,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  toast: {
    position: "absolute",
    left: 18,
    right: 18,
    backgroundColor: "#0F2A22",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    elevation: 8,
  },
  toastText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  modalHeader: { paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line, flexDirection: "row", alignItems: "center", gap: 12 },
  option: { paddingVertical: 16, borderBottomWidth: 1, borderColor: C.line },
  cartRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line },
  cartBar: { position: "absolute", left: 16, right: 16, bottom: 12, backgroundColor: C.ink, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  cartBarText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  tile: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 8, overflow: "hidden" },
  tileOn: { borderColor: C.ink, borderWidth: 2, padding: 7 },
  tilePhoto: { height: 120, borderRadius: 10, backgroundColor: "#fff", marginBottom: 6, alignItems: "center", justifyContent: "center" },
  tileBadge: { position: "absolute", top: 4, right: 4, minWidth: 28, height: 28, borderRadius: 14, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  tileBadgeText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  tileName: { fontSize: 14, fontWeight: "700", color: C.ink, minHeight: 38, lineHeight: 19 },
  tilePrice: { fontSize: 17, fontWeight: "800", color: C.ink, marginTop: 2 },
  tileTag: { fontSize: 12, fontWeight: "800", color: C.green, marginTop: 1 },
  tileStock: { fontSize: 12, marginTop: 1 },
  tileActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  tileBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: C.soft, borderWidth: 1, borderColor: C.line },
  stepper: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: C.soft, borderWidth: 1, borderColor: C.line },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", minHeight: 40, justifyContent: "center" },
  chipOn: { backgroundColor: C.ink, borderColor: C.ink },
  chipText: { color: C.ink, fontSize: 14, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  pill: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontWeight: "700" },
  errorBox: { backgroundColor: C.redSoft, borderColor: "#EBC7C3", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  calendar: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginTop: 10 },
  calNav: { width: 44, height: 40, alignItems: "center", justifyContent: "center" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", textAlign: "center", paddingVertical: 6 },
  calCellBox: { width: "14.28%", height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", marginBottom: 14, minHeight: 56 },
  checkBox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: "#9AA79E", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  payOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(10,25,20,0.55)", alignItems: "center", justifyContent: "center", padding: 18, zIndex: 20, elevation: 20 },
  payCard: { backgroundColor: "#fff", borderRadius: 22, padding: 22, width: "100%", maxWidth: 440, alignItems: "stretch" },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line, minHeight: 60 },
  menuIcon: { fontSize: 22, width: 32, textAlign: "center" },
});
