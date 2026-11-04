// 2.6 · Actualizar catálogo desde Excel o CSV.
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { Business } from "../src/business.ts";
import { applyCatalogImport, catalogWorkbook, planCatalogImport, readCatalogFile, readCsv, readXlsx } from "../src/catalogImport.ts";

function empty() {
  const sql = new DatabaseSync(":memory:");
  return new Business({
    execSync: (s) => sql.exec(s),
    runSync: (s, ...p) => sql.prepare(s).run(...p),
    getAllSync: (s, ...p) => sql.prepare(s).all(...p) as any,
    getFirstSync: (s, ...p) => sql.prepare(s).get(...p) as any,
    withTransactionSync: (f) => {
      sql.exec("BEGIN");
      try {
        f();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  } as any);
}
function shop() {
  const b = empty();
  const cash = b.addAccount("Caja", "Efectivo", 0);
  const a = b.quickProduct({ sku: "NS-PRO-001", name: "Proteína Vainilla", category: "Proteínas", price: 89900, qty: 5, cost: 50000, barcode: "7501234567893", brand: "Nova" });
  const c = b.quickProduct({ sku: "NS-CRE-001", name: "Creatina 300 g", category: "Creatinas", price: 49900, qty: 3, cost: 25000 });
  b.sell([{ productId: a, qty: 1 }], 89900, 89900, cash, null, null, "Mostrador", true);
  return { b, a, c, cash };
}

test("Excel propio: descargar el catálogo y volver a leerlo sin cambios", () => {
  const { b } = shop();
  const wb = catalogWorkbook(b, new Date(2026, 10, 4));
  assert.equal(wb.count, 2);
  assert.match(wb.fileName, /^Catalogo_Nova_2026-11-04\.xlsx$/);
  const table = readXlsx(wb.bytes);
  assert.equal(table[0][0], "SKU");
  const plan = planCatalogImport(b, table);
  assert.deepEqual(plan.counts, { new: 0, update: 0, same: 2, error: 0 });
});

test("cambios de precio, nombre, código, activo, alta nueva y piezas; ventas intactas", () => {
  const { b, a, c } = shop();
  const salesBefore = JSON.stringify(b.all("SELECT * FROM sales")) + JSON.stringify(b.all("SELECT * FROM sale_lines"));
  const csv = [
    "SKU;Nombre;Categoría;Precio;Código de barras;Marca;Activo;Agregar piezas;Costo unitario;Caducidad",
    'NS-PRO-001;Proteína Vainilla 2 lb;;"$1,050.50";;-;;4;;31/12/2027',
    "nscre001;;;;;;No;;;",
    ";Barra de proteína;Snacks;45;012345678905;;;10;20;",
    ";Sin precio;Snacks;;;;;;;",
    "NS-XYZ-9;Otra;Snacks;abc;;;;;;",
  ].join("\r\n");
  const plan = planCatalogImport(b, readCsv(csv));
  assert.deepEqual(plan.counts, { new: 1, update: 2, same: 0, error: 2 }, JSON.stringify(plan.rows, null, 1));
  const errors = plan.rows.filter((r) => r.kind === "error").map((r) => r.line + ": " + r.error);
  assert.match(errors[0], /^5: Producto nuevo: falta el Precio/);
  assert.match(errors[1], /^6: Precio: "abc"/);
  const pro = plan.rows.find((r) => r.productId === a)!;
  assert.deepEqual(pro.changes.map((x) => x.label), ["Nombre", "Precio", "Marca", "Piezas"]);
  const r = applyCatalogImport(b, plan);
  assert.deepEqual(r, { created: 1, updated: 2, units: 14, skipped: 2 });
  const stock = b.stock();
  const p = stock.find((x) => x.id === a)!;
  assert.equal(p.price, 105050);
  assert.equal(p.name, "Proteína Vainilla 2 lb");
  assert.equal(p.brand, "");
  assert.equal(p.barcode, "7501234567893");
  assert.equal(p.stock, 4 + 4);
  // Sin costo en el archivo: toma el del último lote.
  assert.equal(b.one("SELECT cost,expires FROM lots WHERE productId=? ORDER BY rowid DESC", a).cost, 50000);
  assert.equal(b.one("SELECT cost,expires FROM lots WHERE productId=? ORDER BY rowid DESC", a).expires, "2027-12-31");
  assert.equal(stock.find((x) => x.id === c)!.archived, true);
  assert.equal(stock.find((x) => x.id === c)!.sku, "NS-CRE-001");
  const bar = stock.find((x) => x.name === "Barra de proteína")!;
  assert.equal(bar.price, 4500);
  assert.equal(bar.category, "Snacks");
  assert.equal(bar.barcode, "012345678905");
  assert.equal(bar.stock, 10);
  assert.match(bar.sku, /^NS-AUTO-/);
  // Ventas, renglones y dinero no cambian.
  assert.equal(JSON.stringify(b.all("SELECT * FROM sales")) + JSON.stringify(b.all("SELECT * FROM sale_lines")), salesBefore);
  assert.equal(b.one("SELECT COUNT(*) n FROM ledger WHERE kind='purchase'").n, 0);
  // Volver a cargar el mismo archivo no duplica nada: el alta ya existe por código de barras.
  const again = planCatalogImport(b, readCsv(csv.replace(";Barra de proteína;Snacks;45;012345678905;;;10;20;", ";Barra de proteína;Snacks;45;012345678905;;;;;")));
  assert.equal(again.rows.find((x) => x.name === "Barra de proteína")!.kind, "same");
});

test("errores: duplicados, código de otro producto, encabezados ausentes, .xls viejo", () => {
  const { b } = shop();
  const plan = planCatalogImport(b, [
    ["SKU", "Precio", "Código de barras"],
    ["NS-PRO-001", 100, null],
    ["NS-PRO-001", 200, null],
    ["NS-CRE-001", null, "7501234567893"],
  ]);
  assert.equal(plan.rows[1].error, "Repetido: el mismo producto ya viene en el renglón 2");
  assert.match(plan.rows[2].error!, /^Código de barras: ya es de Proteína Vainilla/);
  assert.throws(() => planCatalogImport(b, [["Hola", "Mundo"], ["a", "b"]]), /No encontré los encabezados/);
  // CSV guardado por Excel en Windows (no UTF-8): los acentos se conservan.
  const latin = Uint8Array.from([..."Nombre;Categor\xeda;Precio\nT\xe9 verde;Bebidas;30\n"].map((c) => c.charCodeAt(0)));
  assert.deepEqual(readCatalogFile(latin)[1], ["Té verde", "Bebidas", "30"]);
  assert.equal(planCatalogImport(b, readCatalogFile(latin)).rows[0].values.category, "Bebidas");
  assert.throws(() => readCatalogFile(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])), /Excel antiguo/);
  // Un renglón con error no impide aplicar los demás, y nada queda a medias si algo falla.
  const ok = applyCatalogImport(b, plan);
  assert.equal(ok.updated, 1);
  assert.equal(b.stock().find((p) => p.sku === "NS-PRO-001")!.price, 10000);
});

test("Excel hecho en Excel: textos compartidos, celdas vacías, números y fechas", () => {
  const xml = (s: string) => strToU8('<?xml version="1.0" encoding="UTF-8"?>' + s);
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const bytes = zipSync({
    "xl/workbook.xml": xml(`<workbook ${ns}><sheets><sheet name="Lista" sheetId="3" r:id="rId7"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="x" Target="worksheets/hoja.xml"/></Relationships>`),
    "xl/sharedStrings.xml": xml(`<sst ${ns}><si><t>Nombre</t></si><si><r><t>Pre</t></r><r><t>cio</t></r></si><si><t>Caducidad</t></si><si><t>Té &amp; café</t></si><si><t>Agregar piezas</t></si><si><t>Costo</t></si></sst>`),
    "xl/worksheets/hoja.xml": xml(
      `<worksheet ${ns}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c></row><row r="2"/><row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>129.9</v></c><c r="C3" s="1"/><c r="D3"><v>47118</v></c><c r="E3"><v>2</v></c><c r="F3"><v>60</v></c></row></sheetData></worksheet>`,
    ),
  });
  const table = readCatalogFile(bytes);
  assert.deepEqual(table[0], ["Nombre", "Precio", null, "Caducidad", "Agregar piezas", "Costo"]);
  assert.deepEqual(table[1], []);
  assert.deepEqual(table[2], ["Té & café", 129.9, null, 47118, 2, 60]);
  const b = empty();
  const plan = planCatalogImport(b, table);
  assert.equal(plan.rows[0].line, 3);
  assert.equal(plan.rows[0].values.price, 12990);
  assert.equal(plan.rows[0].values.expires, "2028-12-31");
  applyCatalogImport(b, plan);
  assert.equal(b.stock()[0].name, "Té & café");
  assert.equal(b.stock()[0].stock, 2);
});

test("el Excel descargado lo abre otra herramienta (openpyxl) y uno guardado por ella se vuelve a leer", (t) => {
  const python = process.env.NOVA_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3");
  try {
    execFileSync(python, ["-I", "-c", "import openpyxl"], { stdio: "ignore" });
  } catch {
    t.skip("openpyxl no instalado");
    return;
  }
  const { b } = shop();
  const dir = mkdtempSync(join(tmpdir(), "nova-cat-"));
  try {
    const src = join(dir, "a.xlsx"), out = join(dir, "b.xlsx");
    writeFileSync(src, catalogWorkbook(b).bytes);
    execFileSync(python, ["-I", "-c", "import sys,openpyxl\nwb=openpyxl.load_workbook(sys.argv[1])\nws=wb['Catálogo']\nws['D2']=999.5\nws.append(['NS-NEW-1','Nuevo de Excel','Snacks',35])\nwb.save(sys.argv[2])", src, out]);
    const plan = planCatalogImport(b, readXlsx(new Uint8Array(readFileSync(out))));
    assert.equal(plan.counts.new, 1);
    assert.equal(plan.counts.update, 1);
    assert.equal(plan.rows.find((r) => r.kind === "update")!.values.price, 99950);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
