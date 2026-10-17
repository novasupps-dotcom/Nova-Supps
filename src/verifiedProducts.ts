import { normalizeProductCode, sameProductCode } from "./barcodes";
import type { Row } from "./business";

// Relación publicada por el proveedor y comprobada el 12-oct-2026. No contiene precios del negocio.
export const infernoSource = {
  code: "850066022962",
  name: "Venom Inferno",
  brand: "Dragon Pharma",
  flavor: "Dragon Lychee",
  presentation: "40/20 porciones",
  description:
    "Pre-entreno Venom Inferno de Dragon Pharma, sabor Dragon Lychee.",
  imageUri:
    "https://cdn.shopify.com/s/files/1/0083/6399/9279/files/DD3AB47E-9DF1-4BE1-B521-199A3D36E9BF.webp?v=1765396246",
  source: "Suplementos Mty",
  sourceUrl:
    "https://suplementosmty.com/products/venom-inferno-40-20-porciones",
};
export function verifiedProduct(raw: string, hint?: Row) {
  if (sameProductCode(raw, infernoSource.code))
    return {
      ...infernoSource,
      actualCode: infernoSource.code,
      matchedBy: "code" as const,
    };
  const name = String(hint?.sourceName || hint?.name || "").toLowerCase();
  if (
    name.includes("venom inferno") &&
    String(hint?.brand || "").toLowerCase() === "dragon pharma" &&
    String(hint?.flavor || "").toLowerCase() === "dragon lychee"
  )
    return {
      ...infernoSource,
      code: normalizeProductCode(raw),
      actualCode: infernoSource.code,
      matchedBy: "catalog" as const,
    };
  return null;
}
export function verifiedProductImage(product: Row) {
  return [
    product.code,
    product.lookupCode,
    product.barcode,
    product.sku,
    ...(Array.isArray(product.barcodeAliases) ? product.barcodeAliases : []),
  ].some((code) => sameProductCode(code, infernoSource.code))
    ? require("../assets/products/verified/850066022962.webp")
    : null;
}
