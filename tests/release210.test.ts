// 2.10 · Resumen ejecutivo del Excel de ventas, un renglón por producto de cada
// folio y reporte de stock.
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Business } from "../src/business.ts";
import { salesSheets } from "../src/salesExcel.ts";
import { stockSheets, stockStatus, stockWorkbook } from "../src/stockExcel.ts";
import { buildXlsx } from "../src/xlsx.ts";

function db() {
  const sql = new DatabaseSync(":memory:");
  return {
    execSync: (s: string) => sql.exec(s),
    runSync: (s: string, ...p: any[]) => sql.prepare(s).run(...p),
    getAllSync: (s: string, ...p: any[]) => sql.prepare(s).all(...p) as any,
    getFirstSync: (s: string, ...p: any[]) => sql.prepare(s).get(...p) as any,
    withTransactionSync: (f: () => void) => {
      sql.exec("BEGIN");
      try {
        f();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
function fresh() {
  const b = new Business(db());
  const cash = b.addAccount("Caja", "Efectivo", 100000);
  const p = b.addProduct("A-1", "Proteína", "Prot", 50000, 1);
  const q = b.addProduct("B-1", "Creatina", "Crea", 30000, 3);
  const r = b.addProduct("C-1", "Vitamina C", "Vita", 10000, 2);
  b.receive(p, "L1", "2030-01-01", 10, 20000, null);
  b.receive(q, "L2", "2030-01-01", 4, 15000, null);
  return { b, cash, p, q, r };
}
const ALL = { from: null, to: null };

test("Ventas: un renglón por producto del mismo folio y totales que cuadran", () => {
  const { b, cash, p, q } = fresh();
  b.sell([{ productId: p, qty: 2 }, { productId: q, qty: 1 }], 130000, 130000, cash, null, null, "Mostrador");
  b.sell([{ productId: q, qty: 1 }], 30000, 30000, cash, null, null, "Mostrador");
  const ventas = salesSheets(b, ALL).sheets.find((s) => s.name === "Ventas")!;
  const col = (h: string) => ventas.columns.findIndex((c) => c.header === h);
  assert.equal(ventas.rows.length, 3, "2 productos + 1 producto");
  const multi = ventas.rows.filter((r) => r[col("Renglón")] !== "1 de 1");
  assert.deepEqual(multi.map((r) => r[col("Renglón")]), ["1 de 2", "2 de 2"]);
  assert.equal(multi[0][col("Folio")], multi[1][col("Folio")], "mismo folio");
  assert.deepEqual(multi.map((r) => r[col("Producto")]).sort(), ["Creatina", "Proteína"]);
  // El total del folio solo en el primer renglón; el importe por producto en cada uno.
  assert.equal(multi[0][col("Total venta")], 1300);
  assert.equal(multi[1][col("Total venta")], null);
  const sum = (h: string) => ventas.rows.reduce((n, r) => n + (Number(r[col(h)]) || 0), 0);
  assert.equal(sum("Total venta"), 1600);
  assert.equal(sum("Importe del producto"), 1600, "la suma por producto cuadra con el total");
  assert.equal(sum("Piezas"), 4);
});

test("Resumen ejecutivo: indicadores, estado de resultados y top productos", () => {
  const { b, cash, p, q } = fresh();
  b.sell([{ productId: p, qty: 2 }, { productId: q, qty: 1 }], 130000, 130000, cash, null, null, "Mostrador");
  const { sheets } = salesSheets(b, ALL, "Todo");
  assert.deepEqual(sheets.map((s) => s.name), ["Resumen", "Ventas", "Cobros y comisiones", "Por producto", "Por vendedor"]);
  const res = sheets[0];
  assert.equal(res.report, true);
  const labels = res.rows.map((r) => String(r[0] ?? ""));
  for (const t of ["INDICADORES CLAVE", "ESTADO DE RESULTADOS", "FLUJO DE DINERO", "TOP 5 PRODUCTOS", "POR FORMA DE COBRO", "POR VENDEDOR", "POR CATEGORÍA"]) assert(labels.includes(t), t);
  const row = (l: string) => res.rows.find((r) => r[0] === l)!;
  assert.equal(row("Ventas (a tu precio)")[2], 1300);
  assert.equal(row("Ticket promedio")[2], 1300);
  // Costo: 2×200 + 1×150 = 550 → utilidad 750, margen 750/1300.
  assert.equal(row("(−) Costo de la mercancía")[2], -550);
  assert.equal(row("(=) Utilidad")[2], 750);
  assert.equal(Math.round(Number(row("(=) Utilidad")[3]) * 1000), Math.round((750 / 1300) * 1000));
  assert.equal(res.rowStyles!.length, res.rows.length);
  // 2.10: "Por producto" en pesos (antes en centavos).
  const pp = sheets.find((s) => s.name === "Por producto")!;
  assert.equal(pp.rows[0][4], 1000, "Proteína 2 × $500");
  // El libro se arma sin errores.
  assert(buildXlsx(sheets).length > 1000);
  if (process.env.NOVA_XLSX_OUT) writeFileSync(process.env.NOVA_XLSX_OUT + "/ventas.xlsx", buildXlsx(sheets));
});

test("Reporte de stock: valor, alertas, reabastecer y lotes", () => {
  const { b, cash, p, q, r } = fresh();
  b.sell([{ productId: q, qty: 2 }], 60000, 60000, cash, null, null, "Mostrador");
  const { sheets, count } = stockSheets(b);
  assert.equal(count, 3);
  assert.deepEqual(sheets.map((s) => s.name), ["Resumen", "Stock", "Por reabastecer", "Lotes"]);
  const stock = sheets[1];
  const col = (h: string) => stock.columns.findIndex((c) => c.header === h);
  const byName = (n: string) => stock.rows.find((x) => x[col("Producto")] === n)!;
  assert.equal(byName("Proteína")[col("Valor a costo")], 2000, "10 × $200");
  assert.equal(byName("Proteína")[col("Valor a precio")], 5000);
  assert.equal(byName("Proteína")[col("Estado")], "OK");
  assert.equal(byName("Creatina")[col("Disponibles")], 2);
  assert.equal(byName("Creatina")[col("Estado")], "Bajo mínimo");
  assert.equal(byName("Creatina")[col("Vendidas 30 días")], 2);
  assert.equal(byName("Creatina")[col("Días de inventario")], 30, "2 disponibles ÷ (2/30 por día)");
  const restock = sheets[2].rows.map((x) => x[1]);
  assert(restock.includes("Creatina"));
  assert(!restock.includes("Proteína"));
  const res = sheets[0];
  const row = (l: string) => res.rows.find((x) => x[0] === l)!;
  assert.equal(row("Productos activos")[1], 3);
  assert.equal(row("Valor del inventario a costo")[2], 2000 + 2 * 150);
  assert.equal(stockStatus({ inventoryKnown: true, available: 0, minimum: 1 }), "Sin stock");
  assert.equal(stockStatus({ inventoryKnown: false, available: 0, minimum: 1 }), "Por confirmar");
  // Archivados no cuentan.
  b.setProductArchived(r, true);
  assert.equal(stockSheets(b).count, 2);
  const wb = stockWorkbook(b, new Date(2026, 10, 6, 9, 5));
  assert.equal(wb.fileName, "Stock_Nova_2026-11-06_0905.xlsx");
  if (process.env.NOVA_XLSX_OUT) writeFileSync(process.env.NOVA_XLSX_OUT + "/stock.xlsx", wb.bytes);
});
