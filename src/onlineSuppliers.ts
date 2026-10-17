import { normalizeProductCode, sameProductCode } from "./barcodes";
import type { Row } from "./business";
import type { OnlineProduct } from "./productLookup";
import { verifiedProduct } from "./verifiedProducts";

type Read = (url: string) => Promise<any>;
const text = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 220) : "";
const fold = (value: unknown) =>
  text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const imageUrl = (value: unknown) =>
  typeof value === "string"
    ? /^\/\//.test(value)
      ? "https:" + value
      : /^https:\/\//.test(value)
        ? value
        : ""
    : "";
function fromProduct(
  product: Row,
  raw: string,
  base: string,
  hint?: Row,
): OnlineProduct | null {
  if (!Array.isArray(product?.variants) || !product.title) return null;
  const variants: Row[] = product.variants;
  let variant = variants.find(
    (v) =>
      sameProductCode(v.barcode, raw) || normalizeProductCode(v.sku) === raw,
  );
  let matchedBy: "code" | "catalog" = "code";
  if (!variant && hint) {
    const core = fold(hint.sourceName || String(hint.name).split("·")[0]);
    const title = fold(product.title);
    const brand = fold(hint.brand);
    const flavor = fold(hint.flavor);
    if (
      !core ||
      !title.includes(core) ||
      !brand ||
      fold(product.vendor) !== brand ||
      !flavor
    )
      return null;
    const matching = variants.filter((v) => fold(v.title) === flavor);
    if (matching.length !== 1) return null;
    variant = matching[0];
    matchedBy = "catalog";
  }
  if (!variant) return null;
  const ownImage =
    variant.featured_image?.src ||
    product.images?.find((img: any) => img.id === variant!.image_id)?.src;
  const images = [
    ownImage,
    product.featured_image,
    ...(product.images || []).map((img: any) =>
      typeof img === "string" ? img : img.src,
    ),
  ]
    .map(imageUrl)
    .filter(Boolean);
  const flavor =
    text(variant.title) === "Default Title" ? "" : text(variant.title);
  return {
    code: raw,
    actualCode: text(variant.barcode),
    name: text(product.title),
    brand: text(product.vendor),
    flavor,
    presentation:
      text(product.title).match(
        /\d+(?:[./]\d+)?\s*(?:porciones|servicios|servings|capsules|cápsulas|kg|lbs?|g)\b/i,
      )?.[0] || "",
    description: "",
    imageUri: images[0] || "",
    imageUris: images,
    source:
      base === "https://suplementosmty.com" ? "Suplementos Mty" : "NutriCartel",
    sourceUrl: base + "/products/" + encodeURIComponent(product.handle),
    matchedBy,
  };
}
export async function supplierProduct(
  raw: string,
  read: Read,
  hint?: Row,
): Promise<OnlineProduct | null> {
  const verified = verifiedProduct(raw, hint);
  if (verified) {
    const url = verified.sourceUrl + ".js";
    try {
      const product = await read(url);
      const found = fromProduct(
        product,
        raw,
        "https://suplementosmty.com",
        hint,
      );
      if (found) return found;
    } catch {}
    // La relación y la foto verificadas siguen disponibles si la tienda no responde.
    return verified;
  }
  for (const base of [
    "https://suplementosmty.com",
    "https://nutricartel.com",
  ]) {
    const query = hint
      ? [
          hint.sourceName || String(hint.name).split("·")[0],
          hint.brand,
          hint.flavor,
        ]
          .filter(Boolean)
          .join(" ")
      : raw;
    try {
      const suggestions = await read(
        base +
          "/search/suggest.json?q=" +
          encodeURIComponent(query) +
          "&resources%5Btype%5D=product&resources%5Blimit%5D=3&resources%5Boptions%5D%5Bunavailable_products%5D=show",
      );
      const products = suggestions?.resources?.results?.products;
      if (!Array.isArray(products)) continue;
      for (const item of products.slice(0, 3)) {
        if (!/^[a-z0-9][a-z0-9-]{0,180}$/.test(item.handle || "")) continue;
        const details = await read(base + "/products/" + item.handle + ".js");
        const found = fromProduct(details, raw, base, hint);
        if (found) return found;
      }
    } catch {
      /* Un bloqueo de la tienda se respeta; no se reintenta ni se intenta pasar su verificación. */
    }
  }
  return null;
}
