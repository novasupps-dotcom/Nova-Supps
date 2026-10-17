import { normalizeProductCode, sameProductCode, validGtin } from "./barcodes";
import type { Business, Row } from "./business";
import { supplierProduct } from "./onlineSuppliers";
import { verifiedProduct } from "./verifiedProducts";

export type OnlineProduct = {
  code: string;
  name: string;
  brand: string;
  presentation: string;
  description: string;
  imageUri: string;
  source: string;
  sourceUrl: string;
  flavor?: string;
  actualCode?: string;
  matchedBy?: "code" | "catalog";
  imageUris?: string[];
};
export type LookupResult = {
  kind: "found" | "missing" | "internal" | "unavailable";
  product?: OnlineProduct;
  message: string;
  at: number;
};
type Store = Pick<Business, "setting" | "setSetting">;
const KEY = "barcodeLookupCache223";
const DAY = 86400000;
const memory = new Map<string, LookupResult>();
const pending = new Map<string, Promise<LookupResult>>();
const nextAllowed = { upc: 0, search: 0, food: 0, supplier: 0 };
const blockedUntil = { upc: 0, search: 0, food: 0, supplier: 0 };
const queues = new Map<string, Promise<unknown>>();
const clean = (value: unknown, limit = 220) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, limit)
    : "";
const https = (value: unknown) =>
  typeof value === "string" && /^https:\/\//i.test(value)
    ? value.slice(0, 1600)
    : "";
const canonical = (code: string) =>
  validGtin(code) ? code.padStart(14, "0") : "sku:" + code;
function cached(code: string, store?: Store) {
  const key = code;
  const saved =
    memory.get(key) ||
    (store?.setting(KEY, {})[key] as LookupResult | undefined);
  if (!saved || !Number.isFinite(saved.at)) return null;
  const ttl =
    saved.kind === "found"
      ? 7 * DAY
      : saved.kind === "missing"
        ? 900000
        : 30000;
  return Date.now() - saved.at < ttl ? saved : null;
}
function remember(code: string, result: LookupResult, store?: Store) {
  memory.set(code, result);
  if (memory.size > 150) memory.delete(memory.keys().next().value!);
  if (store) {
    const entries = Object.entries({
      ...store.setting(KEY, {}),
      [code]: result,
    })
      .sort(
        ([, a], [, b]) =>
          Number((b as LookupResult).at) - Number((a as LookupResult).at),
      )
      .slice(0, 150);
    store.setSetting(KEY, Object.fromEntries(entries));
  }
  return result;
}
async function doReadJson(
  url: string,
  provider: "upc" | "search" | "food" | "supplier",
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new Error("cancelled");
  if (blockedUntil[provider] > Date.now()) throw new Error("limited");
  const delay = Math.max(0, nextAllowed[provider] - Date.now());
  if (delay)
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        reject(new Error("cancelled"));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", cancel);
        resolve();
      }, delay);
      signal?.addEventListener("abort", cancel);
    });
  if (signal?.aborted) throw new Error("cancelled");
  nextAllowed[provider] =
    Date.now() +
    { upc: 10000, search: 15500, food: 4500, supplier: 500 }[provider];
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel);
  const timer = setTimeout(cancel, 5500);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent":
          "NovaNegocio/2.2.4 (https://expo.dev/@emmgamart/nova-negocio)",
      },
    });
    if (response.status === 429) {
      const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
      const retry = Number(response.headers.get("retry-after")) * 1000;
      blockedUntil[provider] = Math.max(
        Date.now() + (retry || 60000),
        Number.isFinite(reset) ? reset : 0,
      );
      throw new Error("limited");
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("unavailable");
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
function readJson(
  url: string,
  provider: "upc" | "search" | "food" | "supplier",
  signal?: AbortSignal,
): Promise<any> {
  const previous = queues.get(provider) || Promise.resolve();
  const work = previous
    .catch(() => {})
    .then(() => doReadJson(url, provider, signal));
  queues.set(provider, work);
  void work
    .finally(() => {
      if (queues.get(provider) === work) queues.delete(provider);
    })
    .catch(() => {});
  return work;
}
async function requestLookup(
  code: string,
  signal?: AbortSignal,
  hint?: Row,
): Promise<LookupResult> {
  const at = Date.now();
  let failed = false;
  const verified = verifiedProduct(code, hint);
  if (verified) {
    const product = await supplierProduct(
      code,
      (url) => readJson(url, "supplier", signal),
      hint,
    );
    if (signal?.aborted) throw new Error("cancelled");
    if (product)
      return {
        kind: "found",
        at,
        product,
        message:
          "Código y foto del producto identificados en la fuente de suplementos.",
      };
  }
  const numeric = /^\d{8,14}$/.test(code);
  try {
    const data = await readJson(
      numeric
        ? "https://api.upcitemdb.com/prod/trial/lookup?upc=" +
            encodeURIComponent(code)
        : "https://api.upcitemdb.com/prod/trial/search?s=" +
            encodeURIComponent(code),
      numeric ? "upc" : "search",
      signal,
    );
    const item = Array.isArray(data?.items)
      ? data.items.find((item: Row) =>
          [item.ean, item.upc, item.gtin].some((id) =>
            sameProductCode(id, code),
          ),
        )
      : null;
    const exact =
      item ||
      data?.items?.find(
        (value: Row) => normalizeProductCode(value.model) === code,
      );
    if (exact && clean(exact.title))
      return {
        kind: "found",
        at,
        message: "Producto identificado en línea.",
        product: {
          code,
          name: clean(exact.title),
          brand: clean(exact.brand, 80),
          presentation: clean(exact.size || exact.weight, 80),
          description: clean(exact.description, 900),
          actualCode: clean(exact.upc || exact.ean, 40),
          matchedBy: "code",
          imageUri: Array.isArray(exact.images)
            ? exact.images.map(https).find(Boolean) || ""
            : "",
          imageUris: Array.isArray(exact.images)
            ? exact.images.map(https).filter(Boolean)
            : [],
          source: "UPCitemdb",
          sourceUrl:
            "https://www.upcitemdb.com/upc/" + encodeURIComponent(code),
        },
      };
  } catch {
    failed = true;
  }
  if (signal?.aborted) throw new Error("cancelled");
  const supplier = await supplierProduct(
    code,
    (url) => readJson(url, "supplier", signal),
    hint,
  );
  if (signal?.aborted) throw new Error("cancelled");
  if (supplier)
    return {
      kind: "found",
      at,
      product: supplier,
      message: "Producto y foto encontrados en una fuente de suplementos.",
    };
  try {
    const fields =
      "code,product_name,product_name_es,brands,quantity,image_front_url,generic_name";
    const data = numeric
      ? await readJson(
          "https://world.openfoodfacts.org/api/v3.6/product/" +
            encodeURIComponent(code) +
            ".json?fields=" +
            fields,
          "food",
          signal,
        )
      : null;
    const item = data?.product;
    if (
      item &&
      sameProductCode(item.code || data.code, code) &&
      clean(item.product_name_es || item.product_name)
    )
      return {
        kind: "found",
        at,
        message: "Producto identificado en línea.",
        product: {
          code,
          name: clean(item.product_name_es || item.product_name),
          brand: clean(item.brands, 80),
          presentation: clean(item.quantity, 80),
          description: clean(item.generic_name, 900),
          imageUri: https(item.image_front_url),
          source: "Open Food Facts",
          sourceUrl:
            "https://world.openfoodfacts.org/product/" +
            encodeURIComponent(code),
        },
      };
  } catch {
    failed = true;
  }
  if (signal?.aborted) throw new Error("cancelled");
  return failed
    ? {
        kind: "unavailable",
        at,
        message:
          "La consulta en línea no está disponible ahora. Puedes buscar el producto en tu catálogo o volver a intentar.",
      }
    : {
        kind: "missing",
        at,
        message:
          "Este código no tiene una ficha en las fuentes consultadas. Puedes elegir un producto existente o crear su ficha.",
      };
}

/** Busca códigos comerciales y SKU/modelos; una ficha local también aporta nombre, marca y sabor. */
export async function lookupProductCode(
  raw: string,
  store?: Store,
  force = false,
  signal?: AbortSignal,
  hint?: Row,
): Promise<LookupResult> {
  const code = normalizeProductCode(raw);
  // Los códigos de acceso de la tienda pertenecen a cuentas, no a consultas de productos.
  if (
    /^(?:GNS|CAM|REC)-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code) ||
    /^NOVA\||^(?:EXPONENTPUSHTOKEN|EXPOPUSHTOKEN)\[/.test(code)
  )
    return {
      kind: "internal",
      at: Date.now(),
      message:
        "Este es un código de acceso o de avisos. Usa aquí el código o SKU del producto.",
    };
  const key =
    canonical(code) +
    "|" +
    [
      hint?.sourceName || String(hint?.name || "").split("·")[0],
      hint?.brand,
      hint?.flavor,
    ]
      .filter(Boolean)
      .join(" ");
  if (!force) {
    const hit = cached(key, store);
    if (hit) return hit;
    if (validGtin(code)) {
      const publicHit = cached(canonical(code) + "|", store);
      if (
        publicHit?.kind === "found" &&
        publicHit.product?.matchedBy !== "catalog"
      )
        return publicHit;
    }
  }
  // Una lectura repetida comparte la consulta; al salir se aborta la petición y no se guarda como fallo.
  if (pending.has(key)) {
    try {
      return await pending.get(key)!;
    } catch {
      if (signal?.aborted) throw new Error("cancelled");
    }
  }
  const task = requestLookup(code, signal, hint)
    .then((result) => remember(key, result, store))
    .finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}

export const identityText = (value: unknown) =>
  clean(value, 800)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const contains = (text: string, phrase: string) =>
  !!phrase && (" " + text + " ").includes(" " + phrase + " ");
export function photoMatchesCatalog(product: Row, online: OnlineProduct) {
  const brand = identityText(product.brand),
    remoteBrand = identityText(online.brand);
  if (
    brand &&
    remoteBrand &&
    brand !== remoteBrand &&
    !(" " + remoteBrand + " ").includes(" " + brand + " ")
  )
    return false;
  const core = identityText(
    String(product.sourceName || product.name || "").split("·")[0],
  );
  const remote = identityText(
    [online.name, online.brand, online.flavor, online.presentation].join(" "),
  );
  const flavor = identityText(product.flavor);
  if (flavor && online.flavor && identityText(online.flavor) !== flavor)
    return false;
  return (
    !!core &&
    (remote.includes(core) ||
      sameProductCode(online.actualCode || online.code, product.barcode) ||
      sameProductCode(online.actualCode || online.code, product.sku))
  );
}
function measures(value: string): string[] {
  const text = clean(value, 800)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1.")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\b(servicios|servings|porciones)\b/g, "serv")
    .replace(/\b(capsules|capsulas|caps)\b/g, "caps")
    .replace(/\b(tablets|tabletas|tabs)\b/g, "tabs")
    .replace(/\b(grams|gramos|gr)\b/g, "g")
    .replace(/\b(pounds|libras|lbs)\b/g, "lb");
  return Array.from(
    text.matchAll(/\b(\d+(?:\.\d+)?)\s*(serv|caps|tabs|g|kg|lb|oz|ml|l)\b/g),
    (match) => Number(match[1]) + match[2],
  );
}
export function catalogCandidates(
  products: readonly Row[],
  online: OnlineProduct,
): { product: Row; automatic: boolean; score: number }[] {
  const name = identityText(online.name);
  const brand = identityText(online.brand);
  const full = identityText(
    [online.name, online.brand, online.presentation, online.flavor].join(" "),
  );
  const remoteMeasures = measures([online.name, online.presentation].join(" "));
  const packagingUnclear = /^[1-9]\d{13}$/.test(online.code);
  const list = products
    .flatMap((product) => {
      const core = identityText(
        product.sourceName || String(product.name).split("·")[0],
      );
      const ownBrand = identityText(product.brand);
      const flavor = identityText(product.flavor);
      if (flavor && online.flavor && identityText(online.flavor) !== flavor)
        return [];
      const ownMeasures = measures(
        String(product.presentation || product.name),
      );
      const sizeUncertain =
        product.presentationUnconfirmed === true ||
        /confirmar.*(presentaci[oó]n|contenido)|por confirmar/i.test(
          String(product.notes || "") +
            " " +
            String(product.presentation || ""),
        );
      const tokens = core.split(" ").filter((token) => token.length > 2);
      const matched = tokens.filter((token) => contains(name, token)).length;
      const ratio = tokens.length ? matched / tokens.length : 0;
      const nameExact = contains(name, core) && core.length >= 5;
      const brandExact =
        !!ownBrand && (ownBrand === brand || contains(full, ownBrand));
      const measureConflict = ownMeasures.some(
        (m) =>
          remoteMeasures.some(
            (r) => r.replace(/^[\d.]+/, "") === m.replace(/^[\d.]+/, ""),
          ) && !remoteMeasures.includes(m),
      );
      if (
        (measureConflict && !sizeUncertain) ||
        ratio < 0.65 ||
        (!!ownBrand && !!brand && !brandExact)
      )
        return [];
      const variantKnown =
        (!flavor || contains(full, flavor)) &&
        (sizeUncertain || ownMeasures.every((m) => remoteMeasures.includes(m)));
      const expected = new Set(
        identityText(
          [
            core,
            ownBrand,
            flavor,
            product.presentation,
            sizeUncertain ? online.presentation : "",
          ].join(" "),
        ).split(" "),
      );
      const generic = new Set([
        "pre",
        "workout",
        "preworkout",
        "supplement",
        "supplements",
        "dietary",
        "nutrition",
        "nutricion",
        "suplemento",
        "suplementos",
        "preentreno",
        "powder",
        "polvo",
        "serv",
        "servings",
        "servicios",
        "porciones",
        "capsules",
        "caps",
        "capsulas",
        "g",
        "grams",
        "gramos",
        "kg",
        "lb",
        "lbs",
        "pounds",
        "oz",
        "ml",
        "l",
        "flavor",
        "sabor",
        "by",
        "de",
        "the",
        "with",
        "con",
      ]);
      const extraQualifier = name
        .split(" ")
        .some((token) => !expected.has(token) && !generic.has(token));
      return [
        {
          product,
          automatic:
            nameExact &&
            brandExact &&
            variantKnown &&
            !extraQualifier &&
            online.matchedBy !== "catalog" &&
            !packagingUnclear,
          score:
            ratio * 5 +
            Number(brandExact) * 2 +
            Number(variantKnown) +
            Number(nameExact),
        },
      ];
    })
    .sort((a, b) => b.score - a.score);
  // No se asigna si más de una ficha puede representar el mismo producto.
  const certain = list.filter((item) => item.automatic);
  return list.slice(0, 5).map((item) => ({
    ...item,
    automatic:
      item.automatic &&
      certain.length === 1 &&
      !list.some(
        (other) =>
          other.product.id !== item.product.id && other.score >= item.score - 1,
      ),
  }));
}
