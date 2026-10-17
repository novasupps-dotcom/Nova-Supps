// 2.2.5 · Reconocimiento de códigos: lo que lee la cámara contra lo que guarda el catálogo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findProductByCode, isRetailCode, normalizeProductCode, sameProductCode, upcEToA, validGtin } from "../src/barcodes.ts";

test("formas equivalentes del mismo código de fabricante", () => {
  assert.equal(sameProductCode("042100005264", "0042100005264"), true, "UPC-A = EAN-13 con cero");
  assert.equal(sameProductCode("00042100005264", "042100005264"), true, "GTIN-14");
  assert.equal(upcEToA("04252614"), "042100005264");
  assert.equal(sameProductCode("04252614", "042100005264"), true, "UPC-E comprimido");
  assert.equal(sameProductCode("(01)07501234567893(17)251231", "7501234567893"), true, "GS1 con datos extra");
  assert.equal(normalizeProductCode("0107501234567893172512311"), "07501234567893");
  assert.equal(normalizeProductCode(" 7 501234 567893 "), "7501234567893", "dígitos con espacios");
  assert.equal(normalizeProductCode("]E07501234567893"), "7501234567893", "prefijo del lector");
  assert.equal(normalizeProductCode("*NS-VIT-001*"), "NS-VIT-001", "Code 39 con asteriscos");
  assert.equal(normalizeProductCode("ns-vit-001\u001d"), "NS-VIT-001", "caracteres de control");
  assert.equal(sameProductCode("7501234567893", "7501234567890"), false, "otro producto");
  assert.equal(validGtin("7501234567893"), true);
  assert.equal(isRetailCode("NS-VIT-001"), false);
  assert.equal(isRetailCode("04252614"), true);
});

test("buscar en el catálogo: código, SKU, código extra y SKU sin guiones", () => {
  const products = [
    { id: "a", sku: "NS-VIT-001", barcode: "042100005264" },
    { id: "b", sku: "NS-PRO-002", barcode: "", barcodeAliases: ["7501234567893"] },
    { id: "c", sku: "NS1-A" },
    { id: "d", sku: "NS-1A" },
  ];
  assert.equal(findProductByCode(products, "04252614")?.id, "a");
  assert.equal(findProductByCode(products, "ns-vit-001")?.id, "a");
  assert.equal(findProductByCode(products, "NSVIT001")?.id, "a", "SKU sin guiones");
  assert.equal(findProductByCode(products, "07501234567893")?.id, "b", "código extra");
  assert.equal(findProductByCode(products, "NS1A"), null, "sin guiones ambiguo: no adivina");
  assert.equal(findProductByCode(products, "NS1-A")?.id, "c", "exacto gana");
  assert.equal(findProductByCode(products, ""), null);
});
