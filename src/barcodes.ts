// Códigos de producto: lo que lee la cámara o un lector USB/Bluetooth y lo que guarda el catálogo.
// Un mismo producto puede llegar escrito de varias formas (UPC-A o EAN-13 con cero inicial,
// UPC-E comprimido, GTIN-14, GS1 con datos extra, Code 39 con asteriscos, dígitos con espacios
// o un SKU con o sin guiones). Aquí se reconocen como el mismo código.

/** Texto limpio del código: sin espacios, caracteres de control ni prefijos del lector. */
export function normalizeProductCode(value: unknown): string {
  let code = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .toUpperCase();
  // Prefijo de simbología que agregan algunos lectores (]E0, ]C1, ]Q3…).
  code = code.replace(/^\][A-Z][0-9A-Z]/, "").trim();
  // Code 39 impreso con asteriscos de inicio y fin.
  if (/^\*[^*]+\*$/.test(code)) code = code.slice(1, -1).trim();
  // Dígitos escritos como se ven debajo de las barras: "7 501234 567893".
  if (/^\d[\d\s-]*\d$/.test(code) && /[\s-]/.test(code)) code = code.replace(/[\s-]/g, "");
  return gs1Gtin(code) || code.replace(/\s+/g, " ");
}

/** Dígito verificador correcto de un GTIN-8, UPC-A (12), EAN-13 o GTIN-14. */
export function validGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  return checkDigit(code.slice(0, -1)) === Number(code.at(-1));
}
function checkDigit(body: string): number {
  let total = 0;
  for (let i = body.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) total += Number(body[i]) * weight;
  return (10 - (total % 10)) % 10;
}

/** GS1 (código con datos extra): "(01)07501234567893(17)…" o "0107501234567893…" → el GTIN. */
function gs1Gtin(code: string): string | null {
  const m = /^\(01\)(\d{14})/.exec(code) || (code.length > 16 && /^01(\d{14})/.exec(code));
  return m && validGtin(m[1]) ? m[1] : null;
}

/** UPC-E (8 dígitos, empieza con 0 o 1) → UPC-A de 12 dígitos. */
export function upcEToA(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [ns, digits, check] = [code[0], code.slice(1, 7), code[7]];
  const last = digits[5];
  const body =
    last <= "2"
      ? digits.slice(0, 2) + last + "0000" + digits.slice(2, 5)
      : last === "3"
        ? digits.slice(0, 3) + "00000" + digits.slice(3, 5)
        : last === "4"
          ? digits.slice(0, 4) + "00000" + digits[4]
          : digits.slice(0, 5) + "0000" + last;
  const upcA = ns + body + check;
  return validGtin(upcA) ? upcA : null;
}

/** Formas equivalentes de un código (para comparar). */
function codeKeys(value: unknown): string[] {
  const code = normalizeProductCode(value);
  if (!code) return [];
  const keys = [code];
  if (validGtin(code)) keys.push(code.padStart(14, "0"));
  // UPC-E comprimido: también vale su forma UPC-A (la que suele estar guardada).
  const upcA = upcEToA(code);
  if (upcA) keys.push(upcA.padStart(14, "0"));
  return keys;
}
/** Para SKU: sin guiones, espacios ni puntos ("NS-VIT-001" = "NSVIT001"). */
const looseKey = (value: unknown) => {
  const code = normalizeProductCode(value);
  return /[A-Z]/.test(code) ? code.replace(/[^A-Z0-9]/g, "") : "";
};

export function sameProductCode(left: unknown, right: unknown): boolean {
  const a = codeKeys(left);
  if (!a.length) return false;
  const b = codeKeys(right);
  return a.some((key) => b.includes(key));
}

type CodedProduct = { barcode?: unknown; sku?: unknown; barcodeAliases?: unknown };
export function productCodes(product: CodedProduct): string[] {
  const aliases = Array.isArray(product.barcodeAliases) ? product.barcodeAliases : [];
  return [product.barcode, product.sku, ...aliases].map(normalizeProductCode).filter(Boolean);
}

/**
 * El producto con ese código (de barras, SKU o código extra). Si no hay coincidencia exacta,
 * se acepta un SKU escrito sin guiones o espacios, solo si corresponde a un único producto.
 */
export function findProductByCode<T extends CodedProduct>(products: readonly T[], raw: unknown): T | null {
  if (!normalizeProductCode(raw)) return null;
  const exact = products.find((product) => productCodes(product).some((code) => sameProductCode(code, raw)));
  if (exact) return exact;
  const loose = looseKey(raw);
  if (loose.length < 3) return null;
  const matches = products.filter((product) => productCodes(product).some((code) => looseKey(code) === loose));
  return matches.length === 1 ? matches[0] : null;
}

/** ¿Es un código de fabricante con verificador (EAN/UPC/GTIN o UPC-E)? */
export const isRetailCode = (raw: unknown) => {
  const code = normalizeProductCode(raw);
  return validGtin(code) || !!upcEToA(code);
};
