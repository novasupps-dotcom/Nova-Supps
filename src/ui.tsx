// Componentes compartidos. El lector se carga solo si existe su módulo nativo.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text, TextInput } from "./text";
import { SafeAreaView } from "react-native-safe-area-context";
import { catalogueImages } from "./catalogueImages";
import { catalogueThumbs } from "./catalogueThumbs";
import { canScan } from "./native";
import { CameraScanner, type ScanResult, type ScanTools } from "./scanner";
import {
  lookupProductCode,
  catalogCandidates,
  type OnlineProduct,
} from "./productLookup";
import { verifiedProductImage } from "./verifiedProducts";
import {
  findProductByCode,
  isRetailCode,
  normalizeProductCode,
  productCodes,
} from "./barcodes";
import {
  brandsOf,
  cents,
  money,
  productBrand,
  today,
  saleSegment,
  segmentsOf,
  type Row,
  type Business,
} from "./business";

export { C } from "./theme";
import { C, TILE } from "./theme";
import { ICONS, type IconName } from "./icons";
export type { IconName } from "./icons";

/** Ícono de línea (Lucide) pintado con tintColor. */
export function Icon({
  name,
  size = 22,
  color = C.ink,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: any;
}) {
  return (
    <Image
      source={{ uri: ICONS[name] }}
      accessible={false}
      importantForAccessibility="no"
      style={[{ width: size, height: size, tintColor: color }, style]}
    />
  );
}
/** Botón redondo solo con ícono (siempre con nombre para lectores de pantalla). */
export function IconButton({
  icon,
  label,
  onPress,
  color = C.ink,
  size = 22,
  plain = false,
  disabled = false,
  bg,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  /** Sin círculo de fondo. */
  plain?: boolean;
  disabled?: boolean;
  /** Color del círculo (dentro de tarjetas blancas, gris claro). */
  bg?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        s.iconBtn,
        !!bg && { backgroundColor: bg },
        plain && { backgroundColor: "transparent" },
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

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
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000,
  );
}
/** Días de anticipación para avisar de un seguimiento (próximo contacto). */
export const FOLLOW_UP_DAYS = 5;
/** Clientes con próximo contacto vencido o dentro de los próximos `days` días (el más cercano primero). */
export function followUpsDue<T extends { archived?: any; nextDate?: string }>(
  customers: T[],
  days = FOLLOW_UP_DAYS,
  day = today(),
): (T & { daysLeft: number })[] {
  const until = addDays(day, days);
  return customers
    .filter(
      (c) =>
        !c.archived &&
        /^\d{4}-\d{2}-\d{2}$/.test(c.nextDate || "") &&
        (c.nextDate as string) <= until,
    )
    .map((c) => ({ ...c, daysLeft: daysBetween(day, c.nextDate as string) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
/** "Hoy", "Mañana", "En 3 días · 10 oct 2026" o "Vencido hace 2 días". */
export function followUpLabel(daysLeft: number, nextDate: string) {
  if (daysLeft < 0)
    return `Vencido hace ${-daysLeft} ${daysLeft === -1 ? "día" : "días"}`;
  if (daysLeft === 0) return "Hoy";
  if (daysLeft === 1) return `Mañana · ${fmtDay(nextDate)}`;
  return `En ${daysLeft} días · ${fmtDay(nextDate)}`;
}
/** Importe escrito → centavos, o null si aún no es válido. */
/** 2.8.2 · ¿El producto tiene imagen? (foto propia, imagen verificada o del catálogo de la app). */
export function productHasImage(p: any): boolean {
  return !!(
    p.cleanImageUri ||
    p.imageUri ||
    (Array.isArray(p.imageUris) && p.imageUris.length) ||
    verifiedProductImage(p) ||
    catalogueImages[p.imageKey]?.length ||
    catalogueImages[p.sku]?.length ||
    catalogueImages[p.id]?.length
  );
}

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
  icon,
  label,
}: {
  title: string;
  /** Nombre para lectores de pantalla cuando el texto visible es corto. */
  label?: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  small?: boolean;
  disabled?: boolean;
  flex?: boolean;
  icon?: IconName;
}) {
  const color =
    disabled && !secondary && !small && !danger
      ? C.faint
      : danger
        ? C.red
        : secondary
          ? C.ink
          : small
            ? C.brand
            : "#fff";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        danger && s.danger,
        small && s.small,
        // Botones chicos de acción: relleno suave del acento (estilo "tinted" de iOS).
        small && !secondary && !danger && s.outline,
        flex && { flex: 1 },
        !!icon && { flexDirection: "row", gap: 8 },
        // Deshabilitado: gris (como iOS), no rojo pálido.
        disabled && !secondary && !small && !danger
          ? { backgroundColor: C.fill }
          : disabled && { opacity: 0.4 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {!!icon && <Icon name={icon} size={small ? 18 : 20} color={color} />}
      <Text style={[s.buttonText, { color }, small && { fontSize: 15 }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Card({
  children,
  onPress,
  onLongPress,
  tone,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  /** 2.8.1: mantener presionado (por ejemplo, para eliminar). */
  onLongPress?: () => void;
  tone?: "warn" | "ok" | "bad";
}) {
  const toneStyle =
    tone === "warn"
      ? { backgroundColor: C.amberSoft }
      : tone === "bad"
        ? { backgroundColor: C.redSoft }
        : null; // 2.3: "ok" queda en blanco (el estado lo dice la etiqueta).
  if (onPress)
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={({ pressed }) => [
          s.card,
          toneStyle,
          pressed && { opacity: 0.7 },
        ]}
      >
        {children}
      </Pressable>
    );
  return <View style={[s.card, toneStyle]}>{children}</View>;
}
/** 2.8.1 · Indicador de pasos (1 · 2 · 3) para los flujos guiados. */
export function Steps({ step, names }: { step: number; names: string[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
      {names.map((name, i) => (
        <View key={name} style={{ flex: 1 }} accessibilityLabel={`Paso ${i + 1} de ${names.length}: ${name}`}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= step ? C.brand : C.line }} />
          <Text style={{ fontSize: 12, marginTop: 4, color: i === step ? C.ink : C.muted }}>{`${i + 1}. ${name}`}</Text>
        </View>
      ))}
    </View>
  );
}
export function Note({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return <Text style={[s.muted, color ? { color } : null]}>{children}</Text>;
}
export function Pill({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  const bg =
    tone === "ok"
      ? C.greenSoft
      : tone === "warn"
        ? C.amberSoft
        : tone === "bad"
          ? C.redSoft
          : C.fill;
  const fg =
    tone === "ok"
      ? C.green
      : tone === "warn"
        ? C.amber
        : tone === "bad"
          ? C.red
          : C.ink;
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
  row = false,
}: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: string;
  /** Filtros: una sola fila que se desliza (ocupa menos que varias líneas). */
  row?: boolean;
}) {
  const all = allowEmpty ? [{ id: "", name: allowEmpty }, ...options] : options;
  const items = all.map((o) => {
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
  });
  return row ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {items}
    </ScrollView>
  ) : (
    <View style={s.wrap}>{items}</View>
  );
}
/** Casilla de verificación grande y fácil de tocar. */
export function Checkbox({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={s.checkRow}
    >
      <View
        style={[
          s.checkBox,
          value && { backgroundColor: C.brand, borderColor: C.brand },
        ]}
      >
        {value && <Icon name="check" size={17} color="#fff" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.body}>{label}</Text>
        {!!hint && <Text style={s.muted}>{hint}</Text>}
      </View>
    </Pressable>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder,
  onSubmit,
  right,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={[s.input, s.searchRow]}>
      <Icon name="search" size={18} color={C.muted} />
      <TextInput
        accessibilityLabel={placeholder}
        style={{ flex: 1, fontSize: 17, color: C.ink, paddingVertical: 8 }}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        submitBehavior={onSubmit ? "submit" : undefined}
        blurOnSubmit={!onSubmit}
      />
      {!!value && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
          onPress={() => onChange("")}
          hitSlop={12}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: C.faint,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={13} color="#fff" />
          </View>
        </Pressable>
      )}
      {right}
    </View>
  );
}
/**
 * Campo para los códigos que genera el dueño (GNS / CAM / REC). El prefijo ya
 * está escrito: solo se teclean los 8 caracteres y la app pone el guion sola.
 * No se puede pegar (sin menú de copiar/pegar y se rechaza cualquier texto que
 * entre de golpe): el código se escribe a mano, letra por letra.
 */
export function CodeInput({
  prefix,
  label,
  value,
  onChange,
}: {
  prefix: "GNS" | "CAM" | "REC";
  label: string;
  value: string;
  onChange: (raw: string) => void;
}) {
  const [warn, setWarn] = useState("");
  const last = useRef(value);
  last.current = value;
  const shown =
    value.length > 4 ? `${value.slice(0, 4)}-${value.slice(4)}` : value;
  function change(text: string) {
    let raw = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (raw.startsWith(prefix) && raw.length > 8)
      raw = raw.slice(prefix.length);
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
      <View
        style={[
          s.input,
          { flexDirection: "row", alignItems: "center", paddingVertical: 0 },
        ]}
      >
        <Text
          style={{
            fontSize: 20,
            fontWeight: "800",
            color: C.muted,
            letterSpacing: 2,
          }}
        >{`${prefix}-`}</Text>
        <TextInput
          accessibilityLabel={label}
          style={{
            flex: 1,
            fontSize: 20,
            fontWeight: "800",
            color: C.ink,
            letterSpacing: 2,
            paddingVertical: 12,
          }}
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
const CATALOG_NAME_MATCHERS: [RegExp, string][] = [
  [/coffee\s*fit/i, "NS-CAF-001"],
  [/aminox|amino\s*x/i, "NS-AMI-001"],
  [/demon\s*bcaa/i, "NS-AMI-002"],
  [/killer\s*bcaa/i, "NS-AMI-003"],
  [/hardcore\s*bcaa/i, "NS-AMI-004"],
  [/amino\s*energy/i, "NS-AMI-005"],
  [/\bc4\b|cellucor/i, "NS-BEB-001"],
  [/muscle\s*sandwich/i, "NS-BAR-001"],
  [/carnigen/i, "NS-CAR-001"],
  [/glutamin/i, "NS-GLU-001"],
  [/\bmass\b.*mutant|mutant.*\bmass\b/i, "NS-GAN-001"],
  [/venom/i, "NS-PRE-001"],
  [/nitraflex/i, "NS-PRE-002"],
  [/psychotic\s*test/i, "NS-PRE-003"],
  [/psychotic\s*gold.*(muestra|1\s*serv)/i, "NS-PRE-006"],
  [/psychotic\s*gold/i, "NS-PRE-005"],
  [/psychotic/i, "NS-PRE-004"],
  [/nitro\s*test/i, "NS-PRE-007"],
  [/cbum\s*essential/i, "NS-PRE-008"],
  [/cbum\s*charged/i, "NS-PRE-009"],
  [/\bjoker\b|terror\s*labz/i, "NS-PRE-010"],
  [/iso\s*100|dymatize/i, "NS-PRO-001"],
  [/nitro[-\s]*tech\s*ripped/i, "NS-PRO-003"],
  [/nitro[-\s]*tech/i, "NS-PRO-002"],
  [/whey.*mutant|mutant.*whey/i, "NS-PRO-004"],
  [/isolate.*raw|raw.*isolate/i, "NS-PRO-005"],
  [/whey\s*isolate|\bsd\s*nutrition/i, "NS-PRO-006"],
  [/unique\s*whey|unique\s*nutrition/i, "NS-PRO-007"],
  [/whey\s*hd|\bbpi\b/i, "NS-PRO-008"],
  [/testrol\s*60/i, "NS-SOP-002"],
  [/testrol/i, "NS-SOP-001"],
  [/d3\s*\+\s*k2|evogen.*d3/i, "NS-VIT-001"],
  [/glutathione|vitamin\s*c|ghost\s*life/i, "NS-VIT-002"],
  [/vitamin\s*d3|hi[-\s]*tech/i, "NS-VIT-003"],
  [/omega.*gat|gat.*omega/i, "NS-OME-002"],
  [/omega.*ronnie|ronnie.*omega/i, "NS-OME-003"],
  [/omega|salmon\s*oil/i, "NS-OME-001"],
];

/** Caché en memoria de objetos source base64 y URIs fallidas para renderizado instantáneo sin presión de memoria ni consultas a BD. */
const THUMB_SOURCE_CACHE = new Map<string, { uri: string }>();
function getThumbSource(key: string | null | undefined): { uri: string } | null {
  if (!key) return null;
  let cached = THUMB_SOURCE_CACHE.get(key);
  if (!cached) {
    const b64 = catalogueThumbs[key];
    if (!b64) return null;
    cached = { uri: `data:image/jpeg;base64,${b64}` };
    THUMB_SOURCE_CACHE.set(key, cached);
  }
  return cached;
}
const FAILED_URIS = new Set<string>();

/** Devuelve la clave exacta o por nombre del catálogo nativo si el producto coincide con un artículo conocido. */
export function directCatalogueKey(product: Row | null | undefined): string | null {
  if (!product) return null;
  for (const raw of [product.imageKey, product.sku, product.id, product.family]) {
    const k = String(raw || "").trim();
    if (!k) continue;
    if (catalogueImages[k]?.length || catalogueThumbs[k]) return k;
    const m = /^(NS-[A-Z]{3}-\d{3})/i.exec(k);
    if (m) {
      const base = m[1].toUpperCase();
      if (catalogueImages[base]?.length || catalogueThumbs[base]) return base;
    }
  }
  const text = `${product.familyName || ""} ${product.sourceName || ""} ${product.name || ""} ${product.brand || ""} ${product.presentation || ""}`;
  if (/creatin/i.test(text)) {
    const isDragon = /dragon/i.test(text);
    const isSmall = /\b300\s*g\b/i.test(text);
    const isKg = /\b(1\s*kg|1000\s*g)\b/i.test(text);
    if (isDragon) return isKg ? "NS-CRE-002" : "NS-CRE-001";
    return isSmall ? "NS-CRE-004" : "NS-CRE-003";
  }
  for (const [rx, key] of CATALOG_NAME_MATCHERS) {
    if (rx.test(text) && (catalogueImages[key]?.length || catalogueThumbs[key])) return key;
  }
  return null;
}

/** Resuelve la clave de imagen del catálogo para cualquier producto (incluyendo sabores con sufijo o importados). */
export function resolveCatalogueKey(product: Row | null | undefined): string {
  const direct = directCatalogueKey(product);
  if (direct) return direct;
  if (!product) return "NS-PRO-001";
  const seg = saleSegment(product);
  const bySeg: Record<string, string> = {
    Creatinas: "NS-CRE-003",
    Proteínas: "NS-PRO-001",
    PWO: "NS-PRE-004",
    Aminoácidos: "NS-AMI-001",
    Vitaminas: "NS-VIT-001",
    Snacks: "NS-BAR-001",
    "Soporte hormonal": "NS-SOP-001",
    "Quemadores de Grasa": "NS-CAR-001",
    "Omega 3": "NS-OME-001",
    Glutamina: "NS-GLU-001",
    Ganadores: "NS-GAN-001",
    Energía: "NS-CAF-001",
  };
  return bySeg[seg] || "NS-PRO-001";
}

export function ProductPhoto({
  product,
  index = 0,
  highRes = false,
  style,
}: {
  product: Row;
  index?: number;
  highRes?: boolean;
  style: any;
}) {
  const [failedIndex, setFailedIndex] = useState(0);
  useEffect(
    () => setFailedIndex(0),
    [
      product?.cleanImageUri,
      product?.imageUri,
      product?.imageKey,
      product?.sku,
      product?.id,
      product?.name,
      product?.lookupCode,
    ],
  );
  const directKey = directCatalogueKey(product);
  const resolvedKey = directKey || resolveCatalogueKey(product);
  const images =
    catalogueImages[product?.imageKey] ||
    catalogueImages[product?.sku] ||
    catalogueImages[product?.id] ||
    catalogueImages[resolvedKey] ||
    [];
  const thumbSource =
    getThumbSource(product?.imageKey) ||
    getThumbSource(product?.sku) ||
    getThumbSource(product?.id) ||
    getThumbSource(resolvedKey);
  const rawUris = [
    product?.imageUri,
    product?.cleanImageUri,
    ...(Array.isArray(product?.imageUris) ? product.imageUris : []),
  ].filter(
    (uri, i, all): uri is string =>
      typeof uri === "string" && !!uri && !FAILED_URIS.has(uri) && all.indexOf(uri) === i,
  );
  const localUris = rawUris
    .filter((u) => /^(file|content|data|ph|assets-library):/i.test(u))
    .map((uri) => ({ uri }));
  const remoteUris = rawUris
    .filter((u) => /^https?:/i.test(u))
    .map((uri) => ({ uri }));
  const verified = product ? verifiedProductImage(product) : null;
  const useFullFirst = highRes || index > 0;
  const catPrimary = useFullFirst
    ? [images[index] || images[0], thumbSource]
    : [thumbSource, images[0]];
  const sources = (
    directKey
      ? [verified, ...localUris, ...catPrimary, ...remoteUris]
      : [verified, ...localUris, ...remoteUris, ...catPrimary]
  ).filter(Boolean);
  const source: any = sources[Math.min(failedIndex, Math.max(0, sources.length - 1))];
  const handleError = () => {
    if (source && typeof source === "object" && typeof source.uri === "string" && !source.uri.startsWith("data:")) {
      FAILED_URIS.add(source.uri);
    }
    setFailedIndex((value) => (value + 1 < sources.length ? value + 1 : value));
  };
  if (!source) {
    return (
      <View
        style={[
          style,
          {
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: C.paper,
            borderRadius: 10,
          },
        ]}
      >
        <Icon name="package" size={30} color={C.faint} />
      </View>
    );
  }
  if (useFullFirst && index === 0 && thumbSource && source !== thumbSource) {
    return (
      <View style={[style, { overflow: "hidden" }]}>
        <Image
          source={thumbSource}
          resizeMode="contain"
          fadeDuration={0}
          accessible={false}
          importantForAccessibility="no"
          style={StyleSheet.absoluteFill}
        />
        <Image
          source={source}
          onError={handleError}
          resizeMode="contain"
          resizeMethod="resize"
          fadeDuration={0}
          style={{ width: "100%", height: "100%" }}
          accessibilityLabel={product?.name || "Producto"}
        />
      </View>
    );
  }
  return (
    <Image
      source={source}
      onError={handleError}
      resizeMode="contain"
      resizeMethod="resize"
      fadeDuration={0}
      style={style}
      accessibilityLabel={product?.name || "Producto"}
    />
  );
}
export type GridProduct = {
  id: string;
  name: string;
  price: number;
  category?: string;
  sku?: string;
  brand?: string;
  barcode?: string;
  barcodeAliases?: string[];
  presentation?: string;
  flavor?: string;
  imageKey?: string;
  imageUri?: string;
  lookupSource?: string;
  lookupSourceUrl?: string;
  presentationUnconfirmed?: boolean;
  tag?: string;
  /** 2.8: productos del mismo artículo en distintos sabores comparten familia; al vender se elige el sabor. */
  family?: string;
  familyName?: string;
  /** 2.9: descripción para la ficha del producto. */
  description?: string;
};
/** Código escrito o leído con un lector (USB/Bluetooth): coincide exacto con el código de barras o el SKU. */
export function matchCode<
  T extends { sku?: string | null; barcode?: string | null },
>(products: T[], raw: string): T | null {
  const code = String(raw || "")
    .trim()
    .toUpperCase();
  if (!code) return null;
  return findProductByCode(products, code);
}
const fold = (x: string) =>
  x
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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
  onInventoryCode,
  onUnknownCode,
  lookupStore,
  onPhotoResolved,
  onCheckout,
  cartCount = 0,
  expiringIds,
}: {
  products: GridProduct[];
  qtyOf: (id: string) => number;
  limitOf: (id: string) => number;
  onAdd: (id: string) => void | boolean;
  onRemove: (id: string) => void;
  segment: string;
  onSegment: (s: string) => void;
  /** Búsqueda controlada desde fuera (para borrarla al terminar la venta). */
  query?: string;
  onQuery?: (q: string) => void;
  /** Dueño: código que no está en el catálogo → formulario para darlo de alta o asignarlo. */
  onInventoryCode?: (code: string) => void;
  /** Igual que onInventoryCode, para el carrito dentro de un formulario. */
  onUnknownCode?: (code: string) => void;
  /** @deprecated 2.2.5: leer un código siempre agrega una pieza (se deja para compatibilidad). */
  scanAddsToCart?: boolean;
  lookupStore?: Business;
  onPhotoResolved?: (product: GridProduct, online: OnlineProduct) => void;
  /** 2.9: «Cobrar» desde la ficha del producto (lleva directo al cobro). */
  onCheckout?: () => void;
  /** Piezas en el carrito (para mostrar «Cobrar» en la ficha). */
  cartCount?: number;
  /** 2.10.6: productos con lote próximo a caducar (prioridad FEFO). */
  expiringIds?: Set<string>;
}) {
  const [ownQuery, setOwnQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  // 2.8: familia abierta para elegir sabor. 2.9: o un producto (su ficha con la imagen en grande).
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const [openOne, setOpenOne] = useState<string | null>(null);
  // Resultado de un código escrito o leído con lector USB/Bluetooth (la cámara lo muestra en su pantalla).
  const [scanMessage, setScanMessage] = useState<{
    id: string;
    code: string;
    text: string;
    bad?: boolean;
  } | null>(null);
  // Códigos de fabricante identificados por internet en esta sesión (código → producto del catálogo).
  const resolved = useRef<Record<string, string>>({});
  const liveGrid = useRef({ products, onAdd, onRemove, qtyOf, limitOf });
  liveGrid.current = { products, onAdd, onRemove, qtyOf, limitOf };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const findCode = (code: string) => {
    const list = liveGrid.current.products;
    return (
      matchCode(list, code) ||
      list.find((p) => p.id === resolved.current[code]) ||
      null
    );
  };
  /** Código de fabricante que no está en el catálogo: se busca en internet y se compara por nombre. */
  const onlineMatch = async (code: string): Promise<GridProduct | null> => {
    if (!lookupStore) return null;
    const result = await lookupProductCode(code, lookupStore);
    if (!result.product) return null;
    const candidate = catalogCandidates(
      liveGrid.current.products,
      result.product,
    ).find((item) => item.automatic);
    const found =
      candidate &&
      liveGrid.current.products.find(
        (item) => item.id === candidate.product.id,
      );
    if (!found) return null;
    resolved.current[code] = found.id;
    onPhotoResolved?.(found, result.product);
    return found;
  };
  const addFound = (hit: GridProduct, note = "") => {
    const g = liveGrid.current;
    const before = g.qtyOf(hit.id);
    const added = before < g.limitOf(hit.id) && g.onAdd(hit.id) !== false;
    return { added, count: before + (added ? 1 : 0), note };
  };
  const unknownText = (code: string) =>
    `${code} no está en el catálogo${onInventoryCode || onUnknownCode ? "" : ". Pide al dueño que lo agregue."}`;
  const unknownAction = (code: string) => onInventoryCode || onUnknownCode;
  /** La cámara leyó un código. */
  const scanCode = (raw: string, tools: ScanTools): ScanResult => {
    const code = normalizeProductCode(raw);
    if (!code || code.length > 40)
      return { text: "Código no válido. Vuelve a leerlo.", bad: true };
    const shown = (hit: GridProduct, note = ""): ScanResult => {
      const r = addFound(hit, note);
      return {
        text: r.added
          ? `Agregado: ${hit.name}`
          : `${hit.name}: ya no hay más piezas`,
        bad: !r.added,
        detail: `${money(hit.price)} · ${r.count} en el carrito${note}`,
        actions: [
          ...(r.added
            ? [
                {
                  label: "Quitar una",
                  onPress: () => {
                    liveGrid.current.onRemove(hit.id);
                    tools.update({
                      text: `Quitada: ${hit.name}`,
                      detail: `${Math.max(0, r.count - 1)} en el carrito`,
                    });
                  },
                },
              ]
            : []),
          { label: "Listo", primary: true, onPress: () => tools.close() },
        ],
      };
    };
    const hit = findCode(code);
    if (hit) return shown(hit);
    const go = unknownAction(code);
    const missing: ScanResult = {
      text: "No está en el catálogo",
      bad: true,
      detail: unknownText(code),
      actions: [
        ...(go
          ? [
              {
                label: "Dar de alta o asignar",
                primary: true,
                onPress: () => tools.close(() => go(code)),
              },
            ]
          : []),
        {
          label: "Seguir leyendo",
          onPress: () => tools.update({ text: "Listo para leer otro código." }),
        },
      ],
    };
    if (lookupStore && isRetailCode(code)) {
      void onlineMatch(code)
        .then((match) =>
          tools.update(
            match ? shown(match, " · identificado por internet") : missing,
          ),
        )
        .catch(() => tools.update(missing));
      return { text: "Buscando el producto…", detail: `Código ${code}` };
    }
    return missing;
  };
  /** Código escrito en el buscador o leído con un lector USB/Bluetooth (termina con Enter). */
  const showCode = (raw: string) => {
    const code = normalizeProductCode(raw);
    if (!code || code.length > 40) return;
    const hit = findCode(code);
    if (hit) {
      const r = addFound(hit);
      setScanMessage({
        id: hit.id,
        code,
        text: r.added
          ? `Agregado al carrito: ${hit.name}`
          : `${hit.name}: no quedan más piezas disponibles.`,
        bad: !r.added,
      });
      return;
    }
    setScanMessage({ id: "", code, text: unknownText(code), bad: true });
    if (lookupStore && isRetailCode(code))
      void onlineMatch(code)
        .then((match) => {
          if (!alive.current || !match) return;
          const r = addFound(match);
          setScanMessage({
            id: match.id,
            code,
            text: r.added
              ? `Agregado al carrito: ${match.name} (identificado por internet)`
              : `${match.name}: no quedan más piezas disponibles.`,
            bad: !r.added,
          });
        })
        .catch(() => {});
  };
  const query = queryProp ?? ownQuery;
  const setQuery = onQuery ?? setOwnQuery;
  const [width, setWidth] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [onlyPromo, setOnlyPromo] = useState(false);
  const [priceRange, setPriceRange] = useState<"all" | "under500" | "500to900" | "over900">("all");
  const [priceSort, setPriceSort] = useState<"none" | "asc" | "desc">("none");
  const [openAcc, setOpenAcc] = useState<{ tipo: boolean; marca: boolean; precio: boolean }>({
    tipo: true,
    marca: true,
    precio: false,
  });
  const sheetAnim = useRef(Animated ? new Animated.Value(0) : null).current;
  useEffect(() => {
    if (!sheetAnim || !Animated?.timing) return;
    if (filterOpen) {
      sheetAnim.setValue(0);
      Animated.timing(sheetAnim, {
        toValue: 1,
        duration: 240,
        easing: Easing?.out ? Easing.out(Easing.cubic) : undefined,
        useNativeDriver: true,
      }).start();
    }
  }, [filterOpen, sheetAnim]);

  // Texto de búsqueda, segmento y marca de cada producto se calculan una sola vez.
  const index = useMemo(() => {
    const seg = new Map<string, string>();
    const brandMap = new Map<string, string>();
    const hay = new Map<string, string>();
    const counts = new Map<string, number>();
    const brandCounts = new Map<string, number>();
    for (const p of products) {
      const g = saleSegment(p);
      const br = productBrand(p);
      seg.set(p.id, g);
      brandMap.set(p.id, br);
      counts.set(g, (counts.get(g) ?? 0) + 1);
      if (br) brandCounts.set(br, (brandCounts.get(br) ?? 0) + 1);
      hay.set(
        p.id,
        fold(
          `${p.name} ${p.brand || ""} ${br} ${p.category || ""} ${productCodes(p).join(" ")}`,
        ),
      );
    }
    return {
      seg,
      brandMap,
      hay,
      counts,
      brandCounts,
      segments: segmentsOf(products),
      brands: brandsOf(products),
    };
  }, [products]);
  const segments = index.segments;
  const current =
    segment && segments.includes(segment) ? segment : "Todos";

  const priceRangeLabel: Record<typeof priceRange, string> = {
    all: "Cualquier precio",
    under500: "Hasta $500",
    "500to900": "$500 – $900",
    over900: "Más de $900",
  };

  // Chips de filtros activos para mostrar encima de los resultados y quitar con un toque.
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (current !== "Todos") {
      chips.push({
        key: `seg:${current}`,
        label: current,
        clear: () => onSegment("Todos"),
      });
    }
    for (const br of selectedBrands) {
      chips.push({
        key: `br:${br}`,
        label: br,
        clear: () => setSelectedBrands((prev) => prev.filter((x) => x !== br)),
      });
    }
    if (onlyAvailable) {
      chips.push({
        key: "avail",
        label: "En existencia",
        clear: () => setOnlyAvailable(false),
      });
    }
    if (onlyPromo) {
      chips.push({
        key: "promo",
        label: "En oferta",
        clear: () => setOnlyPromo(false),
      });
    }
    if (priceRange !== "all") {
      chips.push({
        key: `price:${priceRange}`,
        label: priceRangeLabel[priceRange],
        clear: () => setPriceRange("all"),
      });
    }
    if (priceSort !== "none") {
      chips.push({
        key: `sort:${priceSort}`,
        label: priceSort === "asc" ? "Menor precio" : "Mayor precio",
        clear: () => setPriceSort("none"),
      });
    }
    return chips;
  }, [current, selectedBrands, onlyAvailable, onlyPromo, priceRange, priceSort, onSegment]);

  const clearAllFilters = () => {
    onSegment("Todos");
    setSelectedBrands([]);
    setOnlyAvailable(false);
    setOnlyPromo(false);
    setPriceRange("all");
    setPriceSort("none");
  };

  const hasActiveFilter = activeChips.length > 0;
  const activeFilterLabel =
    activeChips.length > 0 ? `Filtrar (${activeChips.length})` : "Filtrar";
  const q = fold(query.trim());
  const shown = useMemo(() => {
    let base = q
      ? products.filter((p) => (index.hay.get(p.id) || "").includes(q))
      : products.filter(
          (p) => current === "Todos" || index.seg.get(p.id) === current,
        );
    if (selectedBrands.length > 0) {
      const bSet = new Set(selectedBrands);
      base = base.filter((p) => bSet.has(index.brandMap.get(p.id) || ""));
    }
    if (onlyAvailable) {
      base = base.filter((p) => limitOf(p.id) > 0 || qtyOf(p.id) > 0);
    }
    if (onlyPromo) {
      base = base.filter(
        (p) => !!p.tag || (expiringIds ? expiringIds.has(p.id) : false),
      );
    }
    if (priceRange === "under500") {
      base = base.filter((p) => p.price <= 50000);
    } else if (priceRange === "500to900") {
      base = base.filter((p) => p.price > 50000 && p.price <= 90000);
    } else if (priceRange === "over900") {
      base = base.filter((p) => p.price > 90000);
    }
    return base;
  }, [
    products,
    index,
    q,
    current,
    selectedBrands,
    onlyAvailable,
    onlyPromo,
    priceRange,
    limitOf,
    qtyOf,
    expiringIds,
  ]);
  // 2.8: los sabores de un mismo producto se muestran como una sola tarjeta.
  type Entry =
    | { kind: "one"; p: GridProduct }
    | { kind: "family"; key: string; name: string; members: GridProduct[] };
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];
    const byFamily = new Map<string, GridProduct[]>();
    for (const p of shown)
      if (p.family)
        byFamily.set(p.family, [...(byFamily.get(p.family) ?? []), p]);
    const done = new Set<string>();
    for (const p of shown) {
      const members = p.family ? byFamily.get(p.family)! : [];
      if (members.length > 1) {
        if (done.has(p.family!)) continue;
        done.add(p.family!);
        list.push({
          kind: "family",
          key: p.family!,
          name: p.familyName || p.name,
          members,
        });
      } else list.push({ kind: "one", p });
    }
    return list;
  }, [shown]);

  // Agrupación ordenada por Tipo de suplemento con su Cabecero (Creatinas, Proteínas, PWO, etc.)
  const sections = useMemo(() => {
    const entryName = (e: Entry) => (e.kind === "family" ? e.name : e.p.name);
    const entryPrice = (e: Entry) =>
      e.kind === "family"
        ? Math.min(...e.members.map((m) => m.price))
        : e.p.price;
    const entrySeg = (e: Entry) =>
      index.seg.get(e.kind === "family" ? e.members[0].id : e.p.id) || "Otros";

    const bySeg = new Map<string, Entry[]>();
    for (const e of entries) {
      const g = entrySeg(e);
      const arr = bySeg.get(g) || [];
      arr.push(e);
      bySeg.set(g, arr);
    }
    const orderedKeys = [
      ...segments.filter((g) => bySeg.has(g)),
      ...[...bySeg.keys()].filter((g) => !segments.includes(g)),
    ];
    return orderedKeys.map((segName) => {
      const items = [...(bySeg.get(segName) || [])].sort((a, b) => {
        if (priceSort === "asc") return entryPrice(a) - entryPrice(b);
        if (priceSort === "desc") return entryPrice(b) - entryPrice(a);
        return entryName(a).localeCompare(entryName(b), "es");
      });
      return { segment: segName, items };
    });
  }, [entries, index.seg, segments, priceSort]);
  const targetFamily =
    openFamily ||
    (openOne ? products.find((p) => p.id === openOne)?.family || null : null);
  const allSheetMembers =
    targetFamily && products.filter((p) => p.family === targetFamily).length > 1
      ? products.filter((p) => p.family === targetFamily)
      : openOne
        ? products.filter((p) => p.id === openOne)
        : [];
  const familyMembers =
    allSheetMembers.length > 1
      ? (() => {
          const inStock = allSheetMembers.filter(
            (p) => limitOf(p.id) > 0 || qtyOf(p.id) > 0,
          );
          const list = inStock.length ? inStock : allSheetMembers;
          return expiringIds
            ? [...list].sort(
                (a, z) =>
                  (expiringIds.has(z.id) ? 1 : 0) -
                  (expiringIds.has(a.id) ? 1 : 0),
              )
            : list;
        })()
      : allSheetMembers;
  const closeSheet = () => (setOpenFamily(null), setOpenOne(null));
  const cols =
    width >= 960
      ? 5
      : width >= 720
        ? 4
        : width >= 500
          ? 3
          : width > 0 && width < 310
            ? 1
            : 2;
  const GAP = 10;
  const tileWidth: any = width
    ? Math.floor((width - GAP * (cols - 1)) / cols)
    : "48%";
  // El lector con Enter abre la misma ficha que la cámara.
  const submit = () => {
    showCode(query);
    setQuery("");
  };
  const toggleBrand = (br: string) => {
    setSelectedBrands((prev) =>
      prev.includes(br) ? prev.filter((x) => x !== br) : [...prev, br],
    );
  };
  const filterBtnActive = filterOpen || hasActiveFilter;
  const renderEntry = (entry: Entry) => {
    if (entry.kind === "family") {
      const qty = entry.members.reduce((n, m) => n + qtyOf(m.id), 0);
      const left = entry.members.reduce(
        (n, m) => n + Math.max(0, limitOf(m.id) - qtyOf(m.id)),
        0,
      );
      const avail = entry.members.reduce(
        (n, m) => n + (Number.isFinite(limitOf(m.id)) ? limitOf(m.id) : 0),
        0,
      );
      const prices = entry.members.map((m) => m.price);
      const low = Math.min(...prices);
      const out = avail < 1 && qty < 1;
      const photo =
        entry.members.find((m) => productHasImage(m)) || entry.members[0];
      return (
        <View
          key={"fam:" + entry.key}
          style={[
            s.tile,
            { width: tileWidth },
            qty > 0 && s.tileOn,
            out && { opacity: 0.45 },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Elegir sabor de ${entry.name}`}
            disabled={out}
            onPress={() => setOpenFamily(entry.key)}
          >
            <View
              style={[
                s.tilePhoto,
                { height: 124, backgroundColor: C.paper, padding: 6 },
              ]}
            >
              <ProductPhoto
                product={photo}
                style={{ width: "100%", height: "100%" }}
              />
              {qty > 0 && (
                <View style={s.tileBadge}>
                  <Text style={s.tileBadgeText}>{qty}</Text>
                </View>
              )}
            </View>
            <Text style={s.tileName} numberOfLines={2}>
              {entry.name}
            </Text>
            <Text style={s.tilePrice}>
              {(prices.some((x) => x !== low) ? "desde " : "") + money(low)}
            </Text>
            {avail > 0 &&
              entry.members.some(
                (m) => expiringIds?.has(m.id) && limitOf(m.id) > 0,
              ) && (
                <Text
                  style={[s.tileTag, { color: C.amber }]}
                  numberOfLines={1}
                >
                  Prioridad · vence pronto
                </Text>
              )}
            <Text
              style={[
                s.tileStock,
                { color: avail < 1 ? C.red : C.muted },
              ]}
            >
              {`${entry.members.length} sabores · ${avail < 1 ? "sin existencias" : `${left} disponibles`}`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver ${entry.name}`}
            hitSlop={8}
            style={[s.tileInfo, { backgroundColor: C.brandSoft }]}
            onPress={() => setOpenFamily(entry.key)}
          >
            <Icon name="info" size={14} color={C.brand} />
          </Pressable>
        </View>
      );
    }
    const p = entry.p;
    const qty = qtyOf(p.id);
    const max = limitOf(p.id);
    const out = max < 1 && qty < 1;
    const atMax = qty >= max;
    return (
      <View
        key={p.id}
        style={[
          s.tile,
          { width: tileWidth },
          qty > 0 && s.tileOn,
          out && { opacity: 0.45 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Agregar ${p.name}`}
          accessibilityState={{ disabled: out || atMax }}
          disabled={out}
          onPress={() => onAdd(p.id)}
          onLongPress={() => setOpenOne(p.id)}
        >
          <View
            style={[
              s.tilePhoto,
              { height: 124, backgroundColor: C.paper, padding: 6 },
            ]}
          >
            <ProductPhoto
              product={p}
              style={{ width: "100%", height: "100%" }}
            />
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
          {!!p.tag ? (
            <Text style={s.tileTag} numberOfLines={1}>
              {p.tag}
            </Text>
          ) : max > 0 && expiringIds?.has(p.id) ? (
            <Text style={[s.tileTag, { color: C.amber }]} numberOfLines={1}>
              Prioridad · vence pronto
            </Text>
          ) : null}
          <Text
            style={[
              s.tileStock,
              { color: max < 1 ? C.red : max <= 2 ? C.amber : C.muted },
            ]}
          >
            {!Number.isFinite(max)
              ? ""
              : max < 1
                ? qty
                  ? "Ya no quedan más"
                  : "Sin existencias"
                : `${max} ${max === 1 ? "disponible" : "disponibles"}`}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ver ${p.name}`}
          hitSlop={8}
          style={[s.tileInfo, { backgroundColor: C.brandSoft }]}
          onPress={() => setOpenOne(p.id)}
        >
          <Icon name="info" size={14} color={C.brand} />
        </Pressable>
        {qty > 0 && (
          <View style={s.tileActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quitar una de ${p.name}`}
              style={s.tileBtn}
              onPress={() => onRemove(p.id)}
            >
              <Icon
                name={qty > 1 ? "minus" : "trash-2"}
                size={18}
                color={C.ink}
              />
            </Pressable>
            <Text style={[s.subtitle, { marginBottom: 0 }]}>{qty}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Agregar otra de ${p.name}`}
              accessibilityState={{ disabled: atMax }}
              style={[s.tileBtn, atMax && { opacity: 0.35 }]}
              onPress={() => onAdd(p.id)}
            >
              <Icon name="plus" size={18} color={C.ink} />
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  const renderCheckRow = ({
    key,
    label,
    accessibilityLabel,
    selected,
    count,
    onPress,
  }: {
    key: string;
    label: string;
    accessibilityLabel: string;
    selected: boolean;
    count?: number;
    onPress: () => void;
  }) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: selected ? C.brandSoft : C.paper,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.line,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: selected ? C.brand : C.faint,
            backgroundColor: selected ? C.brand : C.paper,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected && <Icon name="check" size={12} color="#fff" />}
        </View>
        <Text
          style={{
            fontSize: 14,
            fontWeight: selected ? "700" : "500",
            color: selected ? C.brand : C.ink,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {count !== undefined && (
        <Text style={{ fontSize: 12.5, color: C.muted, fontWeight: "600" }}>
          {String(count)}
        </Text>
      )}
    </Pressable>
  );

  const SheetBackdrop: any = sheetAnim && Animated?.View ? Animated.View : View;
  const SheetPanel: any = sheetAnim && Animated?.View ? Animated.View : View;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Buscar producto"
            onSubmit={submit}
            right={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Filtrar por"
                accessibilityState={{ expanded: filterOpen }}
                onPress={() => setFilterOpen((v) => !v)}
                hitSlop={6}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor: filterBtnActive ? C.brand : C.paper,
                  borderWidth: 1,
                  borderColor: filterBtnActive ? C.brand : C.line,
                }}
              >
                <Icon
                  name="sliders-horizontal"
                  size={13}
                  color={filterBtnActive ? "#fff" : C.ink}
                />
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: "600",
                    color: filterBtnActive ? "#fff" : C.ink,
                  }}
                  numberOfLines={1}
                >
                  {activeFilterLabel}
                </Text>
              </Pressable>
            }
          />
        </View>
        {canScan() && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Leer código con cámara"
            style={[
              s.stepper,
              { width: 42, height: 42, borderRadius: 12, marginBottom: 12 },
            ]}
            onPress={() => setScannerOpen(true)}
          >
            <Icon name="scan-barcode" size={22} color={C.ink} />
          </Pressable>
        )}
      </View>
      <CameraScanner
        visible={scannerOpen}
        continuous
        instruction="Lee el código de barras o el SKU: cada lectura agrega una pieza al carrito."
        onClose={() => setScannerOpen(false)}
        onScan={scanCode}
      />
      {!!scanMessage && (
        <Card tone={scanMessage.bad ? "warn" : "ok"}>
          <Text style={s.subtitle}>{scanMessage.text}</Text>
          <Note>
            {scanMessage.id
              ? `${qtyOf(scanMessage.id)} en el carrito · ${Math.max(0, limitOf(scanMessage.id) - qtyOf(scanMessage.id))} por agregar`
              : `Código leído: ${scanMessage.code}`}
          </Note>
          <View style={s.wrap}>
            {!scanMessage.id && !!unknownAction(scanMessage.code) && (
              <Button
                title="Dar de alta o asignar"
                small
                onPress={() => (
                  unknownAction(scanMessage.code)!(scanMessage.code),
                  setScanMessage(null)
                )}
              />
            )}
            <Button
              title="Cerrar aviso"
              secondary
              small
              onPress={() => setScanMessage(null)}
            />
          </View>
        </Card>
      )}

      {/* Chips de filtros activos en la lista de resultados: muestran qué está aplicado y se quitan con un toque */}
      {!q && activeChips.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
            marginBottom: 10,
          }}
        >
          {activeChips.map((chip) => (
            <Pressable
              key={chip.key}
              accessibilityRole="button"
              accessibilityLabel={`Quitar filtro ${chip.label}`}
              onPress={chip.clear}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingLeft: 11,
                paddingRight: 8,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: C.brandSoft,
                borderWidth: 1,
                borderColor: C.brand,
              }}
            >
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: "700",
                  color: C.brand,
                }}
              >
                {chip.label}
              </Text>
              <Icon name="x" size={12} color={C.brand} />
            </Pressable>
          ))}
          {activeChips.length > 1 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver todo el stock"
              onPress={clearAllFilters}
              style={{
                paddingHorizontal: 9,
                paddingVertical: 5,
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: C.muted }}>
                Limpiar todo
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Modal Bottom Sheet de filtrado facetado (Material BottomSheet + Apple Sheets + Acordeones de divulgación progresiva) */}
      {filterOpen && (
        <Modal
          visible
          transparent
          animationType="none"
          onRequestClose={() => setFilterOpen(false)}
        >
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <SheetBackdrop
              style={[
                {
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0,0,0,0.42)",
                },
                sheetAnim ? { opacity: sheetAnim } : null,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar panel de filtros"
                style={{ flex: 1 }}
                onPress={() => setFilterOpen(false)}
              />
            </SheetBackdrop>

            <SheetPanel
              style={[
                {
                  backgroundColor: C.paper,
                  borderTopLeftRadius: 26,
                  borderTopRightRadius: 26,
                  paddingHorizontal: 16,
                  paddingTop: 10,
                  paddingBottom: 16,
                  maxHeight: "78%",
                },
                sheetAnim
                  ? {
                      transform: [
                        {
                          translateY: sheetAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [220, 0],
                          }),
                        },
                      ],
                    }
                  : null,
              ]}
            >
              {/* Indicador superior de arrastre (Bottom Sheet drag handle) */}
              <View
                style={{
                  width: 38,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: C.line,
                  alignSelf: "center",
                  marginBottom: 10,
                }}
              />

              {/* Cabecera del Bottom Sheet con botón X */}
              <View style={[s.between, { marginBottom: 12 }]}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: C.ink }}>
                  Filtrar productos
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {hasActiveFilter && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Limpiar filtros"
                      onPress={clearAllFilters}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 999,
                        backgroundColor: C.fill,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: "700",
                          color: C.brand,
                        }}
                      >
                        Restablecer
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cerrar filtros"
                    onPress={() => setFilterOpen(false)}
                    hitSlop={8}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: C.fill,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="x" size={16} color={C.ink} />
                  </Pressable>
                </View>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* 1. Chips de filtro rápidos (Android Filter Chips para 2-4 opciones rápidas) */}
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  {[
                    {
                      key: "avail",
                      label: "En existencia",
                      active: onlyAvailable,
                      onPress: () => setOnlyAvailable((v) => !v),
                    },
                    {
                      key: "promo",
                      label: "En oferta",
                      active: onlyPromo,
                      onPress: () => setOnlyPromo((v) => !v),
                    },
                    {
                      key: "asc",
                      label: "Menor precio",
                      active: priceSort === "asc",
                      onPress: () =>
                        setPriceSort((v) => (v === "asc" ? "none" : "asc")),
                    },
                    {
                      key: "desc",
                      label: "Mayor precio",
                      active: priceSort === "desc",
                      onPress: () =>
                        setPriceSort((v) => (v === "desc" ? "none" : "desc")),
                    },
                  ].map((chip) => (
                    <Pressable
                      key={chip.key}
                      accessibilityRole="button"
                      accessibilityLabel={`Filtro rápido ${chip.label}`}
                      accessibilityState={{ selected: chip.active }}
                      onPress={chip.onPress}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 13,
                        paddingVertical: 7,
                        borderRadius: 999,
                        backgroundColor: chip.active ? C.brand : C.fill,
                        borderWidth: 1,
                        borderColor: chip.active ? C.brand : C.line,
                      }}
                    >
                      {chip.active && (
                        <Icon name="check" size={13} color="#fff" />
                      )}
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: chip.active ? "700" : "600",
                          color: chip.active ? "#fff" : C.ink,
                        }}
                      >
                        {chip.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* 2. Divulgación progresiva con grupos desplegables (Acordeones): Tipo, Marca, Precio */}
                {/* Acordeón 1: Tipo de suplemento */}
                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: C.line,
                    marginBottom: 10,
                    overflow: "hidden",
                    backgroundColor: C.paper,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Acordeón Tipo de suplemento"
                    accessibilityState={{ expanded: openAcc.tipo }}
                    onPress={() =>
                      setOpenAcc((prev) => ({ ...prev, tipo: !prev.tipo }))
                    }
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: C.paper,
                    }}
                  >
                    <Text
                      style={{ fontSize: 15, fontWeight: "700", color: C.ink }}
                    >
                      Tipo de suplemento
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: "600",
                          color: current !== "Todos" ? C.brand : C.muted,
                        }}
                      >
                        {current === "Todos" ? "Todo el stock" : current}
                      </Text>
                      <Icon
                        name="chevron-down"
                        size={16}
                        color={C.muted}
                        style={
                          openAcc.tipo
                            ? { transform: [{ rotate: "180deg" }] }
                            : undefined
                        }
                      />
                    </View>
                  </Pressable>
                  {openAcc.tipo && (
                    <View>
                      {renderCheckRow({
                        key: "Todos",
                        label: "Todo el stock",
                        accessibilityLabel: "Categoría Todos",
                        selected: current === "Todos",
                        count: products.length,
                        onPress: () => {
                          onSegment("Todos");
                          setFilterOpen(false);
                        },
                      })}
                      {segments.map((name) =>
                        renderCheckRow({
                          key: name,
                          label: name,
                          accessibilityLabel: `Categoría ${name}`,
                          selected: current === name,
                          count: index.counts.get(name) ?? 0,
                          onPress: () => {
                            onSegment(current === name ? "Todos" : name);
                            setFilterOpen(false);
                          },
                        }),
                      )}
                    </View>
                  )}
                </View>

                {/* Acordeón 2: Marca */}
                {index.brands.length > 0 && (
                  <View
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: C.line,
                      marginBottom: 10,
                      overflow: "hidden",
                      backgroundColor: C.paper,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Acordeón Marca"
                      accessibilityState={{ expanded: openAcc.marca }}
                      onPress={() =>
                        setOpenAcc((prev) => ({ ...prev, marca: !prev.marca }))
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        backgroundColor: C.paper,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "700",
                          color: C.ink,
                        }}
                      >
                        Marca
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12.5,
                            fontWeight: "600",
                            color:
                              selectedBrands.length > 0 ? C.brand : C.muted,
                          }}
                        >
                          {selectedBrands.length > 0
                            ? `${selectedBrands.length} ${selectedBrands.length === 1 ? "seleccionada" : "seleccionadas"}`
                            : "Todas"}
                        </Text>
                        <Icon
                          name="chevron-down"
                          size={16}
                          color={C.muted}
                          style={
                            openAcc.marca
                              ? { transform: [{ rotate: "180deg" }] }
                              : undefined
                          }
                        />
                      </View>
                    </Pressable>
                    {openAcc.marca && (
                      <View>
                        {index.brands.map((bName) =>
                          renderCheckRow({
                            key: bName,
                            label: bName,
                            accessibilityLabel: `Marca ${bName}`,
                            selected: selectedBrands.includes(bName),
                            count: index.brandCounts.get(bName) ?? 0,
                            onPress: () => toggleBrand(bName),
                          }),
                        )}
                      </View>
                    )}
                  </View>
                )}

                {/* Acordeón 3: Precio */}
                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: C.line,
                    marginBottom: 8,
                    overflow: "hidden",
                    backgroundColor: C.paper,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Acordeón Precio"
                    accessibilityState={{ expanded: openAcc.precio }}
                    onPress={() =>
                      setOpenAcc((prev) => ({ ...prev, precio: !prev.precio }))
                    }
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: C.paper,
                    }}
                  >
                    <Text
                      style={{ fontSize: 15, fontWeight: "700", color: C.ink }}
                    >
                      Precio
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: "600",
                          color: priceRange !== "all" ? C.brand : C.muted,
                        }}
                      >
                        {priceRangeLabel[priceRange]}
                      </Text>
                      <Icon
                        name="chevron-down"
                        size={16}
                        color={C.muted}
                        style={
                          openAcc.precio
                            ? { transform: [{ rotate: "180deg" }] }
                            : undefined
                        }
                      />
                    </View>
                  </Pressable>
                  {openAcc.precio && (
                    <View>
                      {(
                        [
                          ["all", "Cualquier precio"],
                          ["under500", "Hasta $500"],
                          ["500to900", "$500 – $900"],
                          ["over900", "Más de $900"],
                        ] as const
                      ).map(([code, lbl]) =>
                        renderCheckRow({
                          key: code,
                          label: lbl,
                          accessibilityLabel: `Precio ${lbl}`,
                          selected: priceRange === code,
                          onPress: () => setPriceRange(code),
                        }),
                      )}
                    </View>
                  )}
                </View>
              </ScrollView>

              <View style={{ height: 10 }} />
              <Button
                title={`Ver resultados (${shown.length})`}
                onPress={() => setFilterOpen(false)}
              />
            </SheetPanel>
          </View>
        </Modal>
      )}

      {!!q && (
        <Note>{`${shown.length} ${shown.length === 1 ? "resultado" : "resultados"} en todas las categorías`}</Note>
      )}

      {/* Feed agrupado por Cabecero de Tipo de suplemento y productos ordenados */}
      {sections.map((sec, idx) => (
        <View
          key={sec.segment}
          style={{ marginTop: idx === 0 ? 2 : 18, marginBottom: 4 }}
        >
          <View
            accessibilityRole="header"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
              paddingHorizontal: 4,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: C.ink,
                letterSpacing: -0.3,
              }}
            >
              {sec.segment}
            </Text>
            <View
              style={{
                backgroundColor: C.fill,
                borderRadius: 12,
                paddingHorizontal: 9,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "700", color: C.muted }}
              >
                {String(sec.items.length)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
            {sec.items.map(renderEntry)}
          </View>
        </View>
      ))}
      {!shown.length && (
        <Note>
          {q ? "No hay coincidencias." : "No hay productos en esta categoría."}
        </Note>
      )}
      {!!familyMembers.length && (
        <ProductSheet
          members={familyMembers}
          allMembers={allSheetMembers}
          family={allSheetMembers.length > 1 || !!openFamily}
          qtyOf={qtyOf}
          limitOf={limitOf}
          onAdd={onAdd}
          onRemove={onRemove}
          onClose={closeSheet}
          cartCount={cartCount}
          onCheckout={onCheckout ? () => (closeSheet(), onCheckout()) : undefined}
          expiringIds={expiringIds}
        />
      )}
    </View>
  );
}

function isRealFlavor(raw?: string | null): boolean {
  const f = String(raw || "").trim();
  if (!f) return false;
  return !/^(sin\s*sabor|por\s*confirmar|natural|n\/?a|ninguno|-)$/i.test(f);
}

function extractProductSheetInfo(p: GridProduct): {
  brand: string;
  productName: string;
  servings: string;
  flavor: string;
} {
  const rawName = String(p.familyName || p.name || "").trim();
  const parts = rawName
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  const productName = parts[0] || String(p.name || "").trim();
  const brand =
    String(p.brand || "").trim() ||
    (parts.length >= 2 &&
    !/^\d+\s*(kg|g|lb|oz|serv|cap|tab|ml|pza|barra|lata)/i.test(parts[1])
      ? parts[1]
      : "") ||
    productBrand(p);
  const rawPres = String(p.presentation || "").trim();
  const partPres =
    parts.length >= 3 ? parts[2] : parts.length === 2 && /^\d+/.test(parts[1]) ? parts[1] : "";
  const descMatch = /(\d+\s*(?:servicios?|servings?|cápsulas?|tabletas?|gomitas?|barras?|latas?|kg|g|lb|oz|ml))/i.exec(
    String(p.description || ""),
  );
  const servings =
    (rawPres && !/^por\s*confirmar$/i.test(rawPres) ? rawPres : "") ||
    (partPres && !/^por\s*confirmar$/i.test(partPres) ? partPres : "") ||
    (descMatch ? descMatch[1] : "") ||
    (rawPres || partPres || "1 pieza");
  const flavor = isRealFlavor(p.flavor) ? String(p.flavor).trim() : "";
  return { brand, productName, servings, flavor };
}

/**
 * 2.10.10 · Ficha minimalista "Acerca de" del producto:
 * - Foto informativa sobre fondo blanco uniforme (sin bordes ni franjas grises a los lados).
 * - Renglones minimalistas ordenados sobre el mismo tono blanco: Marca, Producto, Servings y Sabor (solo si tiene sabor).
 */
function ProductSheet({
  members,
  allMembers = members,
  qtyOf,
  limitOf,
  onAdd,
  onRemove,
  onClose,
  cartCount,
  onCheckout,
  expiringIds,
}: {
  members: GridProduct[];
  allMembers?: GridProduct[];
  family?: boolean;
  qtyOf: (id: string) => number;
  limitOf: (id: string) => number;
  onAdd: (id: string) => void | boolean;
  onRemove: (id: string) => void;
  onClose: () => void;
  cartCount: number;
  onCheckout?: () => void;
  expiringIds?: Set<string>;
}) {
  const { height } = useWindowDimensions();
  const [selectedId, setSelectedId] = useState<string>(members[0]?.id || "");
  useEffect(() => {
    if (!members.some((m) => m.id === selectedId)) {
      setSelectedId(members[0]?.id || "");
    }
  }, [members, selectedId]);

  const selected = members.find((m) => m.id === selectedId) || members[0];
  const photo =
    (productHasImage(selected) ? selected : null) ||
    allMembers.find((m) => productHasImage(m)) ||
    members.find((m) => productHasImage(m)) ||
    selected;

  const info = extractProductSheetInfo(selected);
  const multiFlavors = members.length > 1;
  const showFlavorRow = multiFlavors || !!info.flavor;

  const qty = qtyOf(selected.id);
  const max = limitOf(selected.id);
  const none = max < 1 && qty < 1;
  const full = none || qty >= max;
  const stockText = !Number.isFinite(max)
    ? ""
    : max < 1
      ? "Sin existencias"
      : `${max} ${max === 1 ? "disponible" : "disponibles"}`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.38)",
        }}
        onTouchStart={noteTouch}
      >
        <View
          style={{
            backgroundColor: C.paper,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 18,
            maxHeight: "92%",
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Foto informativa homologada al mismo tono blanco (C.paper), sin franjas grises a los lados */}
            <View
              style={{
                height: Math.min(270, Math.round(height * 0.32)),
                borderRadius: 20,
                backgroundColor: C.paper,
                overflow: "hidden",
                marginBottom: 12,
                padding: 6,
              }}
            >
              <ProductPhoto
                product={photo}
                highRes
                style={{ width: "100%", height: "100%" }}
              />
            </View>

            {/* Renglones simplificados, ordenados y minimalistas en el mismo tono blanco (C.paper) */}
            <View
              style={{
                backgroundColor: C.paper,
                borderRadius: 18,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: C.line,
                paddingHorizontal: 14,
                paddingVertical: 12,
                gap: 8,
                marginBottom: 14,
              }}
            >
              <View style={s.between}>
                <Text style={[s.muted, { fontSize: 13.5, fontWeight: "600" }]}>
                  Marca:
                </Text>
                <Text
                  style={[
                    s.body,
                    { fontSize: 15, fontWeight: "700", flex: 1, textAlign: "right" },
                  ]}
                  numberOfLines={1}
                >
                  {info.brand}
                </Text>
              </View>

              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line }} />

              <View style={s.between}>
                <Text style={[s.muted, { fontSize: 13.5, fontWeight: "600" }]}>
                  Producto:
                </Text>
                <Text
                  style={[
                    s.body,
                    { fontSize: 15, fontWeight: "700", flex: 1, textAlign: "right" },
                  ]}
                  numberOfLines={2}
                >
                  {info.productName}
                </Text>
              </View>

              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line }} />

              <View style={s.between}>
                <Text style={[s.muted, { fontSize: 13.5, fontWeight: "600" }]}>
                  Servings:
                </Text>
                <Text
                  style={[
                    s.body,
                    { fontSize: 15, fontWeight: "600", flex: 1, textAlign: "right" },
                  ]}
                  numberOfLines={1}
                >
                  {info.servings}
                </Text>
              </View>

              {showFlavorRow && (
                <>
                  <View
                    style={{
                      height: StyleSheet.hairlineWidth,
                      backgroundColor: C.line,
                    }}
                  />
                  {multiFlavors ? (
                    <View style={{ gap: 8, paddingTop: 2 }}>
                      <Text
                        style={[s.muted, { fontSize: 13.5, fontWeight: "600" }]}
                      >
                        Sabor:
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        {members.map((m) => {
                          const fLabel = m.flavor || m.name;
                          const isSel = m.id === selected.id;
                          const mQty = qtyOf(m.id);
                          const mMax = limitOf(m.id);
                          const mOut = mMax < 1 && mQty < 1;
                          const mFull = mOut || mQty >= mMax;
                          return (
                            <Pressable
                              key={m.id}
                              accessibilityRole="button"
                              accessibilityState={{ selected: isSel }}
                              accessibilityLabel={`Agregar sabor ${fLabel}`}
                              onPress={() => {
                                setSelectedId(m.id);
                                if (!mFull) onAdd(m.id);
                              }}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 5,
                                paddingHorizontal: 13,
                                paddingVertical: 7,
                                borderRadius: 999,
                                backgroundColor: isSel ? C.brand : C.paper,
                                borderWidth: 1,
                                borderColor: isSel ? C.brand : C.line,
                                opacity: mOut ? 0.45 : 1,
                              }}
                            >
                              {isSel && (
                                <Icon name="check" size={13} color="#fff" />
                              )}
                              <Text
                                style={{
                                  fontSize: 13.5,
                                  fontWeight: isSel ? "700" : "500",
                                  color: isSel ? "#fff" : C.ink,
                                }}
                              >
                                {fLabel}
                              </Text>
                              {mQty > 0 && (
                                <View
                                  style={{
                                    backgroundColor: isSel
                                      ? "rgba(255,255,255,0.26)"
                                      : C.brandSoft,
                                    borderRadius: 10,
                                    paddingHorizontal: 6,
                                    paddingVertical: 1,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 11.5,
                                      fontWeight: "700",
                                      color: isSel ? "#fff" : C.brand,
                                    }}
                                  >
                                    {String(mQty)}
                                  </Text>
                                </View>
                              )}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : (
                    <View style={s.between}>
                      <Text
                        style={[s.muted, { fontSize: 13.5, fontWeight: "600" }]}
                      >
                        Sabor:
                      </Text>
                      <Text
                        style={[
                          s.body,
                          {
                            fontSize: 15,
                            fontWeight: "600",
                            flex: 1,
                            textAlign: "right",
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {info.flavor}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Encabezado compacto de precio y existencias */}
            <View style={[s.between, { marginBottom: 4, paddingHorizontal: 4 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[s.price, { fontSize: 24, marginVertical: 0 }]}>
                  {money(selected.price)}
                </Text>
                {!!selected.tag && <Pill text={selected.tag} tone="ok" />}
                {max > 0 && expiringIds?.has(selected.id) && (
                  <Pill text="Prioridad · vence pronto" tone="warn" />
                )}
              </View>
              <Text
                style={[
                  s.muted,
                  {
                    fontSize: 13,
                    fontWeight: "600",
                    color: max < 1 ? C.red : C.muted,
                  },
                ]}
              >
                {stockText}
              </Text>
            </View>

            {/* Controles rápidos de cantidad cuando ya está en el carrito */}
            {qty > 0 && (
              <View
                style={[
                  s.between,
                  {
                    marginTop: 8,
                    backgroundColor: C.paper,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: C.line,
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  },
                ]}
              >
                <Text
                  style={[
                    s.body,
                    { fontSize: 14, fontWeight: "700", color: C.brand },
                  ]}
                >
                  {`En el carrito · ${qty} ${qty === 1 ? "pieza" : "piezas"}`}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar una de ${selected.flavor || selected.name}`}
                    style={s.tileBtn}
                    onPress={() => onRemove(selected.id)}
                  >
                    <Icon
                      name={qty > 1 ? "minus" : "trash-2"}
                      size={17}
                      color={C.ink}
                    />
                  </Pressable>
                  <Text
                    style={[
                      s.subtitle,
                      { marginBottom: 0, minWidth: 22, textAlign: "center" },
                    ]}
                  >
                    {String(qty)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Agregar otra de ${selected.flavor || selected.name}`}
                    accessibilityState={{ disabled: full }}
                    disabled={full}
                    style={[
                      s.tileBtn,
                      { backgroundColor: C.brand },
                      full && { opacity: 0.35 },
                    ]}
                    onPress={() => {
                      if (!full) onAdd(selected.id);
                    }}
                  >
                    <Icon name="plus" size={17} color="#fff" />
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
          <View style={{ height: 10 }} />
          {onCheckout && cartCount > 0 ? (
            <View style={[s.row, { gap: 8, marginVertical: 0 }]}>
              <Button title="Seguir" secondary flex onPress={onClose} />
              <Button
                title={`Cobrar · ${cartCount} ${cartCount === 1 ? "pieza" : "piezas"}`}
                flex
                onPress={onCheckout}
              />
            </View>
          ) : (
            <Button title="Listo" secondary onPress={onClose} />
          )}
        </View>
        <CartFlyLayer />
      </View>
    </Modal>
  );
}
export function CardFeePreview({
  value,
  bps = 406,
}: {
  value: number | null;
  bps?: number;
}) {
  if (value === null || !Number.isSafeInteger(value) || value < 0)
    return <Note>Completa el importe del cobro.</Note>;
  const fee = Math.round((value * bps) / 10000);
  return (
    <Card tone="warn">
      <Text style={s.subtitle}>Cobro con tarjeta</Text>
      <Text style={s.body}>Cobro: {money(value)}</Text>
      <Text
        style={s.body}
      >{`Comisión Mercado Pago ${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%: ${money(fee)}`}</Text>
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
  const cells: (number | null)[] = [
    ...Array((first + 6) % 7).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[s.input, s.between]}
        onPress={() => setOpen(!open)}
      >
        <Text style={{ color: value ? C.ink : C.muted, fontSize: 16 }}>
          {value ? fmtDay(value) : "Sin fecha"}
        </Text>
        <Icon name="calendar" size={20} color={C.muted} />
      </Pressable>
      <View style={[s.wrap, { marginTop: 8 }]}>
        {quick.map((q) => {
          const v = q.months
            ? addMonths(today(), q.months)
            : addDays(today(), q.days ?? 0);
          return (
            <Pressable
              key={q.label}
              accessibilityRole="button"
              style={[s.chip, value === v && s.chipOn]}
              onPress={() => onChange(v)}
            >
              <Text style={[s.chipText, value === v && s.chipTextOn]}>
                {q.label}
              </Text>
            </Pressable>
          );
        })}
        {allowEmpty && !!value && (
          <Pressable
            accessibilityRole="button"
            style={s.chip}
            onPress={() => onChange("")}
          >
            <Text style={s.chipText}>Quitar fecha</Text>
          </Pressable>
        )}
      </View>
      {open && (
        <View style={s.calendar}>
          <View style={s.between}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mes anterior"
              onPress={() => shift(-1)}
              hitSlop={10}
              style={s.calNav}
            >
              <Icon name="chevron-left" size={22} color={C.brand} />
            </Pressable>
            <Text style={s.subtitle}>
              {MONTHS_LONG[m - 1]} {y}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mes siguiente"
              onPress={() => shift(1)}
              hitSlop={10}
              style={s.calNav}
            >
              <Icon name="chevron-right" size={22} color={C.brand} />
            </Pressable>
          </View>
          <View style={s.calGrid}>
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
              <Text
                key={"h" + i}
                style={[s.calCell, { color: C.muted, fontWeight: "700" }]}
              >
                {d}
              </Text>
            ))}
            {cells.map((d, i) => {
              const v = d ? `${month}-${String(d).padStart(2, "0")}` : "";
              const on = v === value;
              const isToday = v === today();
              return d ? (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={fmtDay(v)}
                  onPress={() => pick(d)}
                  style={[
                    s.calCellBox,
                    on && { backgroundColor: C.brand },
                    isToday && !on && { borderWidth: 1, borderColor: C.brand },
                  ]}
                >
                  <Text
                    style={{
                      color: on ? "#fff" : C.ink,
                      fontWeight: isToday ? "800" : "500",
                    }}
                  >
                    {d}
                  </Text>
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

/** Botón de texto en color de acento (Cerrar, Listo, Editar…), como en las barras de iOS. */
export function TextButton({
  title,
  onPress,
  color = C.brand,
  bold = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  color?: string;
  bold?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
        (pressed || disabled) && { opacity: 0.45 },
      ]}
    >
      <Text style={{ color, fontSize: 17, fontWeight: bold ? "600" : "400" }}>
        {title}
      </Text>
    </Pressable>
  );
}
/**
 * Encabezado. Con `center` (el logo) queda centrado entre dos espacios iguales; en cada
 * pestaña, título grande; en pantallas internas, «‹ Anterior» y título centrado.
 */
export function AppHeader({
  title,
  large = false,
  center,
  leftAction,
  back,
  right,
}: {
  title: string;
  large?: boolean;
  /** Contenido centrado en lugar del título (el logo). */
  center?: React.ReactNode;
  /** Acción a la izquierda cuando hay contenido centrado. */
  leftAction?: React.ReactNode;
  back?: { label: string; onPress: () => void };
  right?: React.ReactNode;
}) {
  if (center)
    return (
      <View style={s.header}>
        <View style={{ minWidth: 88, flexDirection: "row", alignItems: "center", gap: 8 }}>{leftAction}</View>
        <View style={{ flex: 1, alignItems: "center" }}>{center}</View>
        <View style={{ minWidth: 88, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>{right}</View>
      </View>
    );
  if (large)
    return (
      <View style={[s.header, { paddingTop: 12 }]}>
        <Text style={s.headerTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>{right}</View>
      </View>
    );
  return (
    <View style={[s.header, { minHeight: 52 }]}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={back.onPress}
          style={s.backBtn}
          hitSlop={8}
        >
          <Icon name="chevron-left" size={26} color={C.brand} style={{ marginLeft: -8 }} />
          <Text style={s.backText} numberOfLines={1}>
            {back.label.length > 9 ? "Atrás" : back.label}
          </Text>
        </Pressable>
      ) : (
        <View />
      )}
      <View pointerEvents="none" style={{ position: "absolute", left: 100, right: 100, alignItems: "center" }}>
        <Text style={s.headerSmall} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>{right}</View>
    </View>
  );
}
export function TabBar({
  tabs,
  active,
  onPress,
}: {
  tabs: { name: string; icon: IconName }[];
  active: string;
  onPress: (name: string) => void;
}) {
  return (
    <View style={s.nav}>
      {tabs.map((t) => {
        const on = t.name === active;
        return (
          <Pressable
            key={t.name}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [s.navItem, pressed && { opacity: 0.6 }]}
            onPress={() => onPress(t.name)}
          >
            <View style={[s.navPill, on && s.navPillOn]}>
              <Icon name={t.icon} size={22} color={on ? C.brand : C.tab} />
            </View>
            <Text style={[s.navText, on && { color: C.ink, fontWeight: "600" }]}>
              {t.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
/** Ícono según el tipo de cuenta o forma de cobro. */
export function payIcon(kind?: string, name = ""): IconName {
  const k = `${kind || ""} ${name}`.toLowerCase();
  if (k.includes("tarjeta") || k.includes("terminal")) return "credit-card";
  if (k.includes("efectivo")) return "banknote";
  if (k.includes("banco") || k.includes("transfer")) return "landmark";
  return "wallet";
}
/**
 * Formas de cobro como botones grandes con ícono (en lugar de una fila de chips).
 * "Efectivo · por conciliar" se muestra como «Efectivo» y una nota pequeña.
 */
export function PayOptions({
  options,
  value,
  onChange,
}: {
  options: { id: string; name: string; kind?: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {options.map((o) => {
        const on = o.id === value;
        const [main, ...rest] = o.name.split(" · ");
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityLabel={o.name}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={({ pressed }) => [
              {
                flexGrow: 1,
                flexBasis: "30%",
                minHeight: 74,
                borderRadius: 20,
                paddingVertical: 12,
                paddingHorizontal: 10,
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: on ? C.brandSoft : C.paper,
                borderWidth: 2,
                borderColor: on ? C.brand : C.paper,
              },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Icon name={payIcon(o.kind, o.name)} size={22} color={on ? C.brand : C.ink} />
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: on ? C.brand : C.ink, textAlign: "center" }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {main}
            </Text>
            {!!rest.length && (
              <Text style={{ fontSize: 11.5, color: C.muted, textAlign: "center" }} numberOfLines={1}>
                {rest.join(" · ")}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
/** Selector de cantidad en forma de cápsula: − cantidad +. */
export function Stepper({
  qty,
  onMinus,
  onPlus,
  plusDisabled = false,
  minusLabel = "Quitar una",
  plusLabel = "Agregar una",
}: {
  qty: number;
  onMinus: () => void;
  onPlus: () => void;
  plusDisabled?: boolean;
  minusLabel?: string;
  plusLabel?: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.soft, borderRadius: 20, padding: 3 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={minusLabel} hitSlop={6} style={s.tileBtn} onPress={onMinus}>
        <Icon name={qty > 1 ? "minus" : "trash-2"} size={17} color={C.ink} />
      </Pressable>
      <Text testID="qty" style={{ minWidth: 30, textAlign: "center", fontSize: 16, fontWeight: "600", color: C.ink, fontVariant: ["tabular-nums"] }}>{qty}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={plusLabel}
        accessibilityState={{ disabled: plusDisabled }}
        hitSlop={6}
        style={[s.tileBtn, plusDisabled && { opacity: 0.35 }]}
        onPress={onPlus}
      >
        <Icon name="plus" size={17} color={C.ink} />
      </Pressable>
    </View>
  );
}
export type QuickAction = {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** Color del círculo (si no, gris claro). */
  tint?: string;
  disabled?: boolean;
};
/** Accesos rápidos en cuadrícula (estilo One UI): ícono en círculo y nombre corto. */
export function QuickActions({ items }: { items: QuickAction[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!it.disabled }}
          disabled={it.disabled}
          onPress={it.onPress}
          style={({ pressed }) => [s.quick, (pressed || it.disabled) && { opacity: 0.55 }]}
        >
          <View style={[s.quickIcon, !!it.tint && { backgroundColor: it.tint }]}>
            <Icon name={it.icon} size={20} color={it.tint ? "#fff" : C.ink} />
          </View>
          <Text style={s.quickText} numberOfLines={2}>
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
/** Zona inferior flotante (avisos, venta, carrito y pestañas) por encima de la barra del sistema. */
export function BottomDock({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView edges={["bottom"]} pointerEvents="box-none" style={s.dock}>
      {children}
    </SafeAreaView>
  );
}
export type MenuEntry = {
  key?: string;
  title: string;
  desc?: string;
  icon?: IconName;
  /** Color del cuadrito del ícono (TILE.*). */
  tint?: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
};
/** Lista agrupada estilo iOS: filas con ícono en cuadrito, texto y flecha. */
export function MenuList({ items }: { items: MenuEntry[] }) {
  return (
    <View style={s.list}>
      {items.map((item, i) => {
        const content = (
          <>
            {!!item.icon && (
              <View
                style={[
                  s.menuTile,
                  { backgroundColor: item.tint || TILE.graphite },
                ]}
              >
                <Icon name={item.icon} size={18} color="#fff" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  s.body,
                  { marginVertical: 0 },
                  item.danger && { color: C.red },
                ]}
              >
                {item.title}
              </Text>
              {!!item.desc && (
                <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={2}>
                  {item.desc}
                </Text>
              )}
            </View>
            {!!item.value && (
              <Text style={[s.muted, { fontSize: 15 }]}>{item.value}</Text>
            )}
            {item.right}
            {!!item.onPress && !item.right && (
              <Icon name="chevron-right" size={18} color={C.faint} />
            )}
          </>
        );
        return (
          <View key={item.key || item.title}>
            {i > 0 && (
              <View
                style={[s.separator, { marginLeft: item.icon ? 58 : 16 }]}
              />
            )}
            {item.onPress ? (
              <Pressable
                accessibilityRole="button"
                testID={"menu:" + item.title}
                onPress={item.onPress}
                style={({ pressed }) => [
                  s.menuRow,
                  { paddingHorizontal: 16 },
                  pressed && { backgroundColor: C.fill },
                ]}
              >
                {content}
              </Pressable>
            ) : (
              <View style={[s.menuRow, { paddingHorizontal: 16 }]}>
                {content}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const HAIR = StyleSheet.hairlineWidth;
/** Sombra suave para lo que flota (barra de pestañas, carrito, botón de venta). */
const FLOAT = {
  elevation: 10,
  shadowColor: "#000",
  shadowOpacity: 0.12,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
} as const;
const NUM = { fontVariant: ["tabular-nums" as const] };
// ---------------------------------------------------------------------------
// 2.10 · Animación del carrito. Al agregar un producto, un círculo con el carrito
// sale de donde tocaste y vuela al botón del carrito (junto al engrane de
// Ajustes), que rebota y muestra cuántas piezas llevas. Sin dependencias: usa
// Animated de React Native y, si no existe (pruebas), solo actualiza el contador.
type Pt = { x: number; y: number };
const cartFx: {
  touch: (Pt & { t: number }) | null;
  measure: ((done: (p: Pt | null) => void) => void) | null;
  layers: ((from: Pt, to: Pt, done: () => void) => void)[];
} = { touch: null, measure: null, layers: [] };

/** Guarda el último toque (coordenadas de pantalla) para que el vuelo salga de ahí. */
export function noteTouch(e: any) {
  const n = e?.nativeEvent;
  if (n && Number.isFinite(n.pageX) && Number.isFinite(n.pageY)) cartFx.touch = { x: n.pageX, y: n.pageY, t: Date.now() };
}

/** Lanza el vuelo hacia el carrito; `done` corre al llegar (o de inmediato si no hay animación). */
function flyToCart(done: () => void) {
  const layer = cartFx.layers[cartFx.layers.length - 1];
  if (!layer || !cartFx.measure || !Animated) return done();
  const touch = cartFx.touch && Date.now() - cartFx.touch.t < 1500 ? cartFx.touch : null;
  cartFx.measure((to) => {
    if (!to) return done();
    layer(touch ?? { x: to.x - 120, y: to.y + 260 }, to, done);
  });
}

/** Capa (sin toques) donde vuela el carrito. Va al final de la pantalla o de un Modal transparente. */
export function CartFlyLayer() {
  const ref = useRef<any>(null);
  const progress = useRef(Animated ? new Animated.Value(0) : null).current;
  const [flight, setFlight] = useState<{ from: Pt; to: Pt; key: number } | null>(null);
  useEffect(() => {
    if (!progress) return;
    const run = (from: Pt, to: Pt, done: () => void) => {
      const start = (origin: Pt) => {
        progress.stopAnimation();
        setFlight({ from: { x: from.x - origin.x, y: from.y - origin.y }, to: { x: to.x - origin.x, y: to.y - origin.y }, key: Date.now() });
        progress.setValue(0);
        Animated.timing(progress, {
          toValue: 1,
          duration: 650,
          easing: Easing?.inOut ? Easing.inOut(Easing.quad) : undefined,
          useNativeDriver: true,
        }).start(({ finished }: { finished: boolean }) => {
          if (finished) setFlight(null);
          done();
        });
      };
      if (ref.current?.measure) ref.current.measure((_x: number, _y: number, _w: number, _h: number, px: number, py: number) => start({ x: px || 0, y: py || 0 }));
      else start({ x: 0, y: 0 });
    };
    cartFx.layers.push(run);
    return () => {
      cartFx.layers = cartFx.layers.filter((f) => f !== run);
    };
  }, [progress]);
  const R = 22;
  let chip: React.ReactNode = null;
  if (flight && progress) {
    const { from, to } = flight;
    const lift = Math.min(from.y, to.y) - 70;
    chip = (
      <Animated.View
        key={flight.key}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: R * 2,
          height: R * 2,
          borderRadius: R,
          backgroundColor: C.brand,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 8,
          opacity: progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0.2] }),
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [from.x - R, to.x - R] }) },
            { translateY: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [from.y - R, lift - R, to.y - R] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0.4, 1.15, 0.8, 0.35] }) },
            { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["-20deg", "15deg"] }) },
          ],
        }}
      >
        <Icon name="shopping-cart" size={20} color="#fff" />
      </Animated.View>
    );
  }
  return (
    <View ref={ref} pointerEvents="none" style={StyleSheet.absoluteFill} collapsable={false}>
      {chip}
    </View>
  );
}

/** Botón del carrito con contador (junto al engrane). Rebota cada vez que entra una pieza. */
export function CartButton({
  count,
  total,
  seller = false,
  onPress,
}: {
  count: number;
  total?: number;
  seller?: boolean;
  onPress: () => void;
}) {
  const ref = useRef<any>(null);
  const bounce = useRef(Animated ? new Animated.Value(1) : null).current;
  const [shown, setShown] = useState(count);
  const prev = useRef(count);
  useEffect(() => {
    cartFx.measure = (done) =>
      ref.current?.measure
        ? ref.current.measure((_x: number, _y: number, w: number, h: number, px: number, py: number) => done(Number.isFinite(px) ? { x: px + w / 2, y: py + h / 2 } : null))
        : done(null);
    return () => {
      cartFx.measure = null;
    };
  }, []);
  useEffect(() => {
    const before = prev.current;
    prev.current = count;
    if (count <= before) return setShown(count);
    flyToCart(() => {
      setShown(prev.current);
      if (bounce)
        Animated.sequence([
          Animated.spring(bounce, { toValue: 1.35, speed: 40, bounciness: 14, useNativeDriver: true }),
          Animated.spring(bounce, { toValue: 1, speed: 18, bounciness: 10, useNativeDriver: true }),
        ]).start();
    });
  }, [count]);
  const summaryText =
    shown > 0
      ? `${seller ? "Ver carrito" : "Carrito"} · ${shown} ${shown === 1 ? "pieza" : "piezas"}${total !== undefined ? ` · ${money(total)}` : ""}`
      : "";
  const body = (
    <>
      <Icon name="shopping-cart" size={20} color={shown > 0 ? "#fff" : C.ink} />
      {shown > 0 && (
        <View style={s.cartBadge}>
          <Text style={s.cartBadgeText} numberOfLines={1}>
            {shown > 99 ? "99+" : String(shown)}
          </Text>
        </View>
      )}
      {shown > 0 && (
        <Text style={{ width: 0, height: 0, opacity: 0 }}>{summaryText}</Text>
      )}
    </>
  );
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={
        shown ? (seller ? "Ver carrito" : "Abrir carrito") : "Carrito vacío"
      }
      hitSlop={8}
      onPress={onPress}
      collapsable={false}
      style={({ pressed }) => [
        s.iconBtn,
        shown > 0 && { backgroundColor: C.brand },
        pressed && { opacity: 0.6 },
      ]}
    >
      {bounce ? (
        <Animated.View style={{ transform: [{ scale: bounce }], alignItems: "center", justifyContent: "center" }}>{body}</Animated.View>
      ) : (
        <View>{body}</View>
      )}
    </Pressable>
  );
}

export const s = StyleSheet.create({
  // 2.10 · Contador del botón del carrito.
  cartBadge: {
    position: "absolute",
    top: -11,
    right: -13,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: C.ink,
    borderWidth: 1.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 13 },
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.bg,
    minHeight: 60,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: "700",
    color: C.ink,
  },
  /** Título grande de cada pestaña (como iOS / One UI). */
  headerTitle: {
    fontSize: 34,
    fontWeight: "700",
    color: C.ink,
    flex: 1,
  },
  /** Título de una pantalla interna (centrado). */
  headerSmall: {
    fontSize: 17,
    fontWeight: "600",
    color: C.ink,
    textAlign: "center",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingRight: 8,
    minHeight: 44,
    maxWidth: 96,
    zIndex: 2,
  },
  backText: { color: C.brand, fontSize: 17, fontWeight: "400" },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.paper,
  },
  badge: {
    backgroundColor: C.paper,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  badgeText: { color: C.muted, fontSize: 12, fontWeight: "600" },
  content: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 140,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 4,
  },
  subtitle: { fontSize: 17, fontWeight: "600", color: C.ink, marginBottom: 6 },
  /** Encabezado de un grupo (gris, pequeño, espaciado). */
  section: {
    fontSize: 12.5,
    fontWeight: "600",
    color: C.muted,
    letterSpacing: 0.8,
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 18,
    textTransform: "uppercase",
  },
  body: { fontSize: 16, color: C.ink, lineHeight: 22, marginVertical: 2 },
  muted: { fontSize: 14, color: C.muted, lineHeight: 20 },
  card: {
    backgroundColor: C.paper,
    borderRadius: 24,
    padding: 18,
    marginBottom: 12,
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: "700",
    color: "#fff",
    marginVertical: 8,
    ...NUM,
  },
  button: {
    backgroundColor: C.brand,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 5,
    minHeight: 54,
  },
  secondary: { backgroundColor: C.fill },
  danger: { backgroundColor: C.redSoft },
  small: {
    minHeight: 40,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  /** Botón chico de acción: relleno suave del acento. */
  outline: { backgroundColor: C.brandSoft },
  buttonText: { fontSize: 17, fontWeight: "600", color: "#fff" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 4 },
  row: { flexDirection: "row", gap: 8, marginVertical: 4 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  productRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  productImage: { width: 76, height: 96 },
  price: {
    fontSize: 20,
    color: C.ink,
    fontWeight: "700",
    marginVertical: 4,
    ...NUM,
  },
  photo: { height: 200, width: "100%", marginVertical: 12 },
  field: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: C.muted,
    marginTop: 6,
    marginBottom: 7,
    marginLeft: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    backgroundColor: C.paper,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 17,
    color: C.ink,
    minHeight: 54,
    justifyContent: "center",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingVertical: 0,
    minHeight: 46,
    borderWidth: 0,
    borderRadius: 23,
    backgroundColor: C.fill,
    paddingHorizontal: 14,
  },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0 },
  nav: {
    flexDirection: "row",
    alignSelf: "center",
    width: "92%",
    maxWidth: 520,
    marginBottom: 10,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: HAIR,
    borderColor: "rgba(0,0,0,0.06)",
    ...FLOAT,
  },
  navRow: { flexDirection: "row" },
  navItem: {
    flex: 1,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  navPill: {
    width: 58,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  navPillOn: { backgroundColor: C.brandSoft },
  navOn: {},
  navIcon: { fontSize: 19 },
  navText: { fontSize: 11, color: C.tab, fontWeight: "500" },
  toast: {
    alignSelf: "center",
    maxWidth: "88%",
    marginHorizontal: 18,
    marginBottom: 10,
    backgroundColor: "rgba(28,28,30,0.92)",
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...FLOAT,
  },
  toastText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  modalHeader: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.bg,
  },
  option: {
    paddingVertical: 15,
    borderBottomWidth: HAIR,
    borderColor: C.line,
  },
  cartRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: HAIR,
    borderColor: C.line,
  },
  tile: {
    backgroundColor: C.paper,
    borderRadius: 22,
    padding: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: C.paper,
  },
  tileOn: { borderColor: C.brand },
  tilePhoto: {
    height: 116,
    borderRadius: 14,
    backgroundColor: C.paper,
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  tileInfo: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(242,242,247,0.88)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  tileBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  tileBadgeText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  tileName: {
    fontSize: 14,
    fontWeight: "500",
    color: C.ink,
    minHeight: 38,
    lineHeight: 19,
  },
  tilePrice: {
    fontSize: 17,
    fontWeight: "700",
    color: C.ink,
    marginTop: 3,
    ...NUM,
  },
  tileTag: { fontSize: 12, fontWeight: "600", color: C.brand, marginTop: 1 },
  tileStock: { fontSize: 12.5, marginTop: 1 },
  tileActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    backgroundColor: C.soft,
    borderRadius: 20,
    padding: 3,
  },
  tileBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.paper,
  },
  stepper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.fill,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.fill,
    minHeight: 38,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: C.ink },
  chipText: { color: C.ink, fontSize: 14.5, fontWeight: "500" },
  chipTextOn: { color: "#fff", fontWeight: "600" },
  pill: {
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 12, fontWeight: "600" },
  errorBox: {
    backgroundColor: C.redSoft,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  calendar: {
    backgroundColor: C.paper,
    borderRadius: 24,
    padding: 14,
    marginTop: 10,
  },
  calNav: {
    width: 44,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", textAlign: "center", paddingVertical: 6 },
  calCellBox: {
    width: "14.28%",
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: C.paper,
    marginBottom: 14,
    minHeight: 58,
  },
  checkBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: C.faint,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.paper,
  },
  payOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    zIndex: 20,
    elevation: 20,
  },
  payCard: {
    backgroundColor: C.paper,
    borderRadius: 30,
    padding: 24,
    width: "100%",
    maxWidth: 440,
    alignItems: "stretch",
  },
  /** Fila de una lista agrupada (Ajustes, menús). */
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  menuIcon: { fontSize: 22, width: 32, textAlign: "center" },
  menuTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    height: HAIR,
    backgroundColor: C.inputLine,
  },
  /** Tarjeta de lista: sin relleno; cada fila pone el suyo. */
  list: {
    backgroundColor: C.paper,
    borderRadius: 24,
    marginBottom: 12,
    overflow: "hidden",
  },
  /** Acceso rápido (cuadrícula de acciones, estilo One UI). */
  quick: {
    flex: 1,
    minWidth: 72,
    backgroundColor: C.paper,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 7,
    minHeight: 92,
    justifyContent: "flex-start",
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.soft,
  },
  quickText: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "600",
    color: C.ink,
    textAlign: "center",
  },
});
