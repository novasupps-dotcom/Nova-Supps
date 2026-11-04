// 2.6 · Ajustes → Actualizar catálogo: descargar Excel, elegir archivo, ver cambios y aplicar.
const fs = require("fs"), Module = require("module"), ts = require("typescript"), assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { screenIssues, text } = require("./screenCheck.cjs");
global.IS_REACT_ACT_ENVIRONMENT = true;
for (const extension of [".ts", ".tsx"]) require.extensions[extension] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, file);
require.extensions[".jpg"] = (m, file) => (m.exports = { asset: file });
const React = require("react"), renderer = require("react-test-renderer"), { act } = renderer;
const sql = new DatabaseSync(":memory:");
const db = { execSync: (s) => sql.exec(s), runSync: (s, ...p) => sql.prepare(s).run(...p), getAllSync: (s, ...p) => sql.prepare(s).all(...p), getFirstSync: (s, ...p) => sql.prepare(s).get(...p), withTransactionSync: (f) => { sql.exec("BEGIN"); try { f(); sql.exec("COMMIT"); } catch (e) { sql.exec("ROLLBACK"); throw e; } } };
const alerts = [], written = {}, shared = [], files = {};
let picked = null;
const rn = { StyleSheet: { create: (x) => x }, Platform: { OS: "android" }, Alert: { alert: (...a) => alerts.push(a) }, useWindowDimensions: () => ({ width: 400, height: 800 }) };
for (const c of ["Image", "Modal", "Pressable", "ScrollView", "Switch", "Text", "TextInput", "View", "ActivityIndicator"]) rn[c] = c;
const fsMock = {
  documentDirectory: "file:///doc/",
  EncodingType: { Base64: "base64" },
  writeAsStringAsync: async (u, v, o) => { written[u] = { v, o }; },
  readDirectoryAsync: async () => Object.keys(written).map((u) => u.replace("file:///doc/", "")),
  deleteAsync: async (u) => { delete written[u]; },
  readAsStringAsync: async (u, o) => { assert.equal(o?.encoding, "base64"); return files[u]; },
};
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === "react-native") return rn;
  if (name === "react-native-safe-area-context") return { SafeAreaProvider: "SafeAreaProvider", SafeAreaView: "SafeAreaView", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
  if (name === "expo-file-system/legacy") return fsMock;
  if (name === "expo-sharing") return { isAvailableAsync: async () => true, shareAsync: async (u, o) => shared.push({ u, o }) };
  if (name === "expo-document-picker") return { getDocumentAsync: async (o) => { assert(o.type.includes("text/csv")); return picked; } };
  if (name.startsWith("expo-")) return {};
  return original.call(this, name, ...args);
};
const { Business, grossUp, money } = require("../src/business.ts");
const { CatalogImportPage } = require("../src/screens/CatalogImport.tsx");
let ui;
const all = () => text(ui.root);
const pressables = (pred) => ui.root.findAll((n) => n.type === "Pressable" && typeof n.props.onPress === "function" && pred(n));
async function press(label) { const c = pressables((n) => text(n).trim() === label && !n.props.disabled); assert(c.length, label + " en: " + all().slice(0, 400)); await act(async () => c[0].props.onPress()); await act(async () => { await new Promise((r) => setTimeout(r, 40)); }); }

(async () => {
  const b = new Business(db);
  const cash = b.addAccount("Caja", "Efectivo", 0);
  const p = b.quickProduct({ sku: "NS-PRO-001", name: "Proteína", category: "Proteínas", price: 89900, qty: 2, cost: 50000 });
  b.sell([{ productId: p, qty: 1 }], 89900, 89900, cash, null, null, "Mostrador", true);
  let changed = 0;
  const notes = [];
  await act(async () => { ui = renderer.create(React.createElement(CatalogImportPage, { b, notify: (t) => notes.push(t), onChanged: () => changed++ })); });
  const issues = screenIssues(ui, "inicio");

  // 1. Descargar
  await press("Descargar catálogo en Excel");
  const xlsx = Object.keys(written).find((u) => /Catalogo_Nova_\d{4}-\d{2}-\d{2}\.xlsx$/.test(u));
  assert(xlsx, Object.keys(written).join(","));
  assert.equal(written[xlsx].o.encoding, "base64");
  assert.equal(shared.at(-1).o.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(notes.at(-1), "Catálogo en Excel · 1 productos");

  // 2. Archivo editado: un cambio, un alta, un producto repetido por sabor y un renglón sin precio.
  files["file:///cache/precios.csv"] = Buffer.from(
    "SKU,Nombre,Precio,Sabor,Existencias,Agregar piezas,Costo unitario\n" +
      "NS-PRO-001,,950,,5,,\n" +
      ",Barra,45,,,6,20\n" +
      "NS-ISO-1,Iso 2 lb,899,Chocolate,4,,300\n" +
      "NS-ISO-1,Iso 2 lb,899,Vainilla,3,,300\n" +
      "NS-X,Sin precio,,,,,\n",
    "utf8",
  ).toString("base64");
  picked = { canceled: false, assets: [{ uri: "file:///cache/precios.csv", name: "precios.csv" }] };
  await press("Elegir archivo");
  issues.push(...screenIssues(ui, "vista previa"));
  assert(all().includes("precios.csv"));
  assert(all().includes("2 con error"), all());
  // Abre en Errores: cada renglón se puede unificar, modificar o quitar.
  assert(all().includes("Renglón 5: Repetido: el mismo producto ya viene en el renglón 4"), all());
  assert(all().includes("Renglón 6: Producto nuevo: falta el Precio"), all());
  await press("Unificar con renglón 4");
  assert(all().includes("1 con error") && !all().includes("Renglón 5:"), all());
  // Modificar: escribir el precio que faltaba.
  const editBtns = pressables((n) => text(n).trim() === "Modificar");
  await act(async () => editBtns[editBtns.length - 1].props.onPress());
  const priceInput = ui.root.findAll((n) => n.type === "TextInput" && n.props.accessibilityLabel === "Precio del renglón 6")[0];
  assert(priceInput, "campo Precio del renglón 6");
  await act(async () => priceInput.props.onChangeText("30"));
  await press("Guardar renglón");
  assert(all().includes("0 con error") || !all().includes("con error"), all());
  // Deshacer y mejor quitarlo.
  await press("Deshacer último cambio (2)");
  assert(all().includes("Renglón 6: Producto nuevo: falta el Precio"), all());
  await press("Quitar");
  assert(!all().includes("con error"), all());
  await press("Cambios");
  issues.push(...screenIssues(ui, "arreglado"));
  // Comisión: activada por omisión, con ejemplo; se puede apagar para ver los precios tal cual.
  assert(all().includes("Sumar la comisión de la terminal (4.06%) a los precios"), all());
  assert(all().includes(`Precio: $899.00 → ${money(grossUp(95000))}`), all());
  const sw = ui.root.findAll((n) => n.type === "Switch" && n.props.accessibilityLabel === "Sumar la comisión de la terminal a los precios")[0];
  await act(async () => sw.props.onValueChange(false));
  assert(all().includes("Precio: $899.00 → $950.00"), all());
  await act(async () => sw.props.onValueChange(true));
  assert(all().includes("Existencias: 1 → 5"), all());
  assert(all().includes("Nuevo: Barra"));
  assert.equal(b.stock().find((x) => x.id === p).price, 89900, "nada se guarda antes de aplicar");

  // 3. Aplicar: pregunta si suma la comisión → guarda copia, aplica, avisa y publica.
  await press("Aplicar 3 cambios");
  const [title, body, buttons] = alerts.at(-1);
  assert.equal(title, "¿Sumar la comisión de la terminal (4.06%)?");
  assert(body.includes("al cobrar no se suma otra vez"), body);
  assert.deepEqual(buttons.map((x) => x.text), ["Cancelar", "No sumar", "Sí, sumar y cargar"]);
  await act(async () => buttons.find((x) => x.text === "Sí, sumar y cargar").onPress());
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  assert.equal(b.stock().find((x) => x.id === p).price, grossUp(95000));
  assert.equal(b.feeInPrice(), true);
  assert.equal(b.stock().find((x) => x.name === "Barra").stock, 6);
  assert.equal(b.stock().find((x) => x.id === p).stock, 5);
  const iso = b.stock().find((x) => x.sku === "NS-ISO-1");
  assert.equal(iso.stock, 7);
  assert.equal(iso.flavor, "Chocolate, Vainilla");
  assert(!b.stock().some((x) => x.name === "Sin precio"));
  assert.equal(changed, 1);
  assert.equal(notes.at(-1), "Catálogo actualizado · 2 nuevos · 1 con cambios · existencias de 2 · +6 piezas · precios + 4.06%");
  assert(Object.keys(written).some((u) => /Nova-antes-de-catalogo-\d+\.json$/.test(u)), "copia previa");
  assert(!all().includes("precios.csv"), "la vista previa se cierra");
  issues.push(...screenIssues(ui, "aplicado"));

  // 4. Archivo inválido: mensaje claro, nada cambia.
  files["file:///cache/viejo.xls"] = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).toString("base64");
  picked = { canceled: false, assets: [{ uri: "file:///cache/viejo.xls", name: "viejo.xls" }] };
  await press("Elegir archivo");
  assert(all().includes("Excel antiguo (.xls)"), all());
  picked = { canceled: true, assets: null };
  await press("Elegir archivo");

  await act(async () => ui.unmount());
  if (issues.length) throw new Error(issues.join("\n"));
  console.log("ACTUALIZAR CATÁLOGO: OK (descargar Excel, unificar repetidos, modificar, deshacer, quitar, comisión con confirmación, copia previa, aplicar y publicar)");
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
