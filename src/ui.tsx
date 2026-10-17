// Componentes compartidos. El lector se carga solo si existe su módulo nativo.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text, TextInput } from "./text";
import { SafeAreaView } from "react-native-safe-area-context";
import { catalogueImages } from "./catalogueImages";
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
  cents,
  money,
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
  tone,
}: {
  children: React.ReactNode;
  onPress?: () => void;
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
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSubmit?: () => void;
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
export function ProductPhoto({
  product,
  index = 0,
  style,
}: {
  product: Row;
  index?: number;
  style: any;
}) {
  const [failedIndex, setFailedIndex] = useState(0);
  useEffect(
    () => setFailedIndex(0),
    [
      product.cleanImageUri,
      product.imageUri,
      product.imageKey,
      product.id,
      product.lookupCode,
    ],
  );
  const images =
    catalogueImages[product.imageKey] ||
    catalogueImages[product.sku] ||
    catalogueImages[product.id] ||
    [];
  const uris = [
    product.cleanImageUri,
    ...(Array.isArray(product.imageUris) ? product.imageUris : []),
    product.imageUri,
  ]
    .filter(
      (uri, i, all) => typeof uri === "string" && uri && all.indexOf(uri) === i,
    )
    .map((uri) => ({ uri }));
  const verified = verifiedProductImage(product);
  const sources = [verified, ...uris, images[0]].filter(Boolean);
  const source = index === 0 ? sources[failedIndex] : images[index];
  return source ? (
    <Image
      source={source}
      onError={() => setFailedIndex((value) => value + 1)}
      resizeMode="contain"
      style={style}
      accessibilityLabel={product.name}
    />
  ) : (
    <View
      style={[
        style,
        {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.soft,
          borderRadius: 10,
        },
      ]}
    >
      <Icon name="package" size={30} color={C.faint} />
    </View>
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
}) {
  const [ownQuery, setOwnQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
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
  // Categoría y texto de búsqueda de cada producto se calculan una sola vez (no en cada tecla o toque).
  const index = useMemo(() => {
    const seg = new Map<string, string>();
    const hay = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const p of products) {
      const g = saleSegment(p);
      seg.set(p.id, g);
      counts.set(g, (counts.get(g) ?? 0) + 1);
      hay.set(
        p.id,
        fold(
          `${p.name} ${p.brand || ""} ${p.category || ""} ${productCodes(p).join(" ")}`,
        ),
      );
    }
    return { seg, hay, counts, segments: segmentsOf(products) };
  }, [products]);
  const segments = index.segments;
  const current =
    segments.includes(segment) || segment === "Todos"
      ? segment
      : segments[0] || "Todos";
  const q = fold(query.trim());
  const shown = products.filter((p) =>
    q
      ? (index.hay.get(p.id) || "").includes(q)
      : current === "Todos" || index.seg.get(p.id) === current,
  );
  const cols = width >= 840 ? 4 : width >= 560 ? 3 : 2;
  const GAP = 10;
  const tileWidth: any = width
    ? Math.floor((width - GAP * (cols - 1)) / cols)
    : "48%";
  const count = (name: string) => index.counts.get(name) ?? 0;
  // El lector con Enter abre la misma ficha que la cámara.
  const submit = () => {
    showCode(query);
    setQuery("");
  };
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Buscar producto"
            onSubmit={submit}
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
      {!q && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          style={{ marginBottom: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {[...segments, "Todos"].map((name) => {
            const on = name === current;
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Categoría ${name}`}
                onPress={() => onSegment(name)}
                style={[s.chip, on && s.chipOn]}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>
                  {name === "Todos"
                    ? `Todos (${products.length})`
                    : `${name} (${count(name)})`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {!!q && (
        <Note>{`${shown.length} ${shown.length === 1 ? "resultado" : "resultados"} en todas las categorías`}</Note>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
        {shown.map((p) => {
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
              >
                <View style={s.tilePhoto}>
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
                {!!p.tag && (
                  <Text style={s.tileTag} numberOfLines={1}>
                    {p.tag}
                  </Text>
                )}
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
        })}
      </View>
      {!shown.length && (
        <Note>
          {q ? "No hay coincidencias." : "No hay productos en esta categoría."}
        </Note>
      )}
    </View>
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
        <View style={{ width: 96, flexDirection: "row", gap: 8 }}>{leftAction}</View>
        <View style={{ flex: 1, alignItems: "center" }}>{center}</View>
        <View style={{ width: 96, flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>{right}</View>
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
      {right}
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
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
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
export const s = StyleSheet.create({
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
    paddingBottom: 180,
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
    marginHorizontal: 16,
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
  fab: {
    alignSelf: "flex-end",
    marginRight: 18,
    marginBottom: 12,
    backgroundColor: C.brand,
    borderRadius: 28,
    paddingHorizontal: 22,
    minHeight: 54,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    ...FLOAT,
  },
  fabText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  toast: {
    marginHorizontal: 24,
    marginBottom: 10,
    backgroundColor: "rgba(28,28,30,0.95)",
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...FLOAT,
  },
  toastText: { color: "#fff", fontSize: 15, fontWeight: "500" },
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
  cartBar: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: C.ink,
    borderRadius: 30,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: "center",
    ...FLOAT,
  },
  cartBarText: { color: "#fff", fontWeight: "600", fontSize: 16, ...NUM },
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
    height: 124,
    borderRadius: 14,
    backgroundColor: C.paper,
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center",
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
