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
  if (name === "expo-document-picker") return { getDocumentAsync: async (o) => { assert(o.type.includes("application/pdf")); return picked; } };
  if (name.startsWith("expo-")) return {};
  return original.call(this, name, ...args);
};
const { Business, grossUp, money } = require("../src/business.ts");
const { OrderImportPage, MarginProjectionCard } = require("../src/screens/OrderImport.tsx");
const { ProductGrid } = require("../src/ui.tsx");
const { sampleOrder } = require("./fixtures/orderPdf.cjs");
let ui;
const all = () => text(ui.root);
const pressables = (pred) => ui.root.findAll((n) => n.type === "Pressable" && typeof n.props.onPress === "function" && pred(n));
async function press(label) { const c = pressables((n) => text(n).trim() === label && !n.props.disabled); assert(c.length, label + " en: " + all().slice(0, 400)); await act(async () => c[0].props.onPress()); await act(async () => { await new Promise((r) => setTimeout(r, 40)); }); }

(async () => {
  const b = new Business(db);
  const bank = b.addAccount("Banco", "Banco", 1000000);
  const crea = b.quickProduct({ sku: "NS-CRE-003", name: "Creatine · GAT Sport · 1 kg", category: "Creatina", brand: "GAT Sport", flavor: "Sin Sabor", presentation: "1 kg", price: 64000, qty: 1, cost: 48000 });
  b.quickProduct({ sku: "NS-PRE-005", name: "Psychotic Gold · Insane Labz · Por confirmar", category: "Preentreno", brand: "Insane Labz", flavor: "Fruit Punch", presentation: "Por confirmar", price: 45000 });
  let changed = 0;
  const notes = [];
  await act(async () => { ui = renderer.create(React.createElement(OrderImportPage, { b, notify: (t) => notes.push(t), onChanged: () => changed++ })); });
  const issues = screenIssues(ui, "inicio");
  files["file:///cache/pedido.pdf"] = Buffer.from(sampleOrder()).toString("base64");
  picked = { canceled: false, assets: [{ uri: "file:///cache/pedido.pdf", name: "Pedido 0700001.pdf" }] };
  await press("Elegir PDF del pedido");
  issues.push(...screenIssues(ui, "vista previa"));
  const t = all();
  assert(t.includes("Pedido #0700001 · Suplementos GYM"), t);
  assert(t.includes("7 piezas") && t.includes("3 nuevos") && t.includes("1 ya existen"), t);
  assert(t.includes("pagado $3,002.06"), t);
  assert(t.includes("Ya existe: Creatine · GAT Sport · 1 kg · existencias 1 → 4"), t);
  assert(t.includes("Nuevo: NS-PRE-006-GRA · Preentreno"), t);
  assert(t.includes("Sabores: Grape (2), Fruit Punch (1) · al vender se elige el sabor"), t);
  assert(t.includes("¿Es «Psychotic Gold · Insane Labz · Por confirmar»?"), t);
  assert(t.includes("Costo real $519.13 por pieza (PDF $523.34)"), t);
  // Calculadora: 30% por omisión; con 40% cambia el sugerido.
  const pct = ui.root.findAll((n) => n.type === "TextInput" && n.props.accessibilityLabel === "Porcentaje de ganancia")[0];
  await act(async () => pct.props.onChangeText("40"));
  const { priceCalc } = require("../src/supplierOrder.ts");
  const black = priceCalc(40996, 40, 406);
  assert(all().includes(`Costo $409.96 + 40% = ${money(black.target)}`), all());
  assert(all().includes(`→ ${money(black.client)} sugerido`), all());
  // Creatina existente: por omisión conserva su precio.
  assert(all().includes(`Mantener ${money(grossUp(64000))}`), all());
  // Psychotic Gold: el dueño dice que sí es el existente.
  await press("¿Es «Psychotic Gold · Insane Labz · Por confirmar»? (presentación por confirmar) · usar este");
  assert(all().includes("2 ya existen"), all());
  // Sin cuenta elegida no deja cargar.
  const btn = pressables((n) => text(n).trim() === "Cargar 7 piezas al inventario")[0];
  assert(btn.props.disabled, "pide la cuenta");
  await press("No registrar pago");
  await press("Cargar 7 piezas al inventario");
  const [title, body, buttons] = alerts.at(-1);
  assert.equal(title, "Cargar pedido");
  assert(body.includes("7 piezas · 2 productos nuevos · 2 ya existían"), body);
  await act(async () => buttons.find((x) => x.text === "Cargar").onPress());
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  assert.equal(b.stock().find((p) => p.id === crea).stock, 4);
  assert.equal(changed, 1);
  assert.equal(notes.at(-1), "Pedido cargado · 7 piezas · 2 nuevos · 2 con más piezas");
  assert.equal(b.balance(bank), 1000000, "sin registrar pago");
  assert(Object.keys(written).some((u) => /Nova-antes-de-pedido-\d+\.json$/.test(u)), "copia previa");
  assert.equal(b.setting("orderMarkupPct", 0), 40);
  issues.push(...screenIssues(ui, "cargado"));
  await act(async () => ui.unmount());

  // Margen y proyección (Resumen de ventas).
  await act(async () => { ui = renderer.create(React.createElement(MarginProjectionCard, { b })); });
  assert(all().includes("Margen por producto y proyección") && all().includes("Ganancia proyectada"), all());
  issues.push(...screenIssues(ui, "margen"));
  await act(async () => ui.unmount());

  // Vender: los sabores salen en una sola tarjeta y se elige el sabor.
  const grid = b.stock().filter((p) => !p.archived);
  const cart = {};
  const props = () => ({ products: grid, qtyOf: (id) => cart[id] || 0, limitOf: (id) => grid.find((p) => p.id === id).available, onAdd: (id) => { cart[id] = (cart[id] || 0) + 1; }, onRemove: (id) => { cart[id]--; }, segment: "Todos", onSegment: () => {} });
  await act(async () => { ui = renderer.create(React.createElement(ProductGrid, props())); });
  const fam = pressables((n) => n.props.accessibilityLabel === "Elegir sabor de Psychotic Black · Insane Labz · 60 Servicios");
  assert.equal(fam.length, 1, "una sola tarjeta para los sabores");
  assert(!pressables((n) => n.props.accessibilityLabel === "Agregar Psychotic Black · Insane Labz · 60 Servicios · Grape").length);
  await act(async () => fam[0].props.onPress());
  await act(async () => ui.update(React.createElement(ProductGrid, props())));
  const modal = ui.root.findAll((n) => n.type === "Modal")[0];
  assert.equal(modal.props.visible, true);
  await act(async () => pressables((n) => n.props.accessibilityLabel === "Agregar sabor Grape")[0].props.onPress());
  const grapeId = grid.find((p) => p.flavor === "Grape").id;
  assert.equal(cart[grapeId], 1);
  issues.push(...screenIssues(ui, "sabores"));
  await act(async () => ui.unmount());

  if (issues.length) throw new Error(issues.join("\n"));
  console.log("CARGAR PEDIDO: OK (PDF, existentes y nuevos, calculadora, confirmar producto, cuenta obligatoria, carga, margen y elegir sabor al vender)");
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
