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
  // Paso 1: elegir el PDF.
  assert(all().includes("1. PDF") && all().includes("2. Revisar") && all().includes("3. Cargar"));
  await press("Elegir PDF");
  issues.push(...screenIssues(ui, "paso 2"));
  // Paso 2: un renglón por producto, con su precio.
  const t = all();
  assert(t.includes("#0700001 · 7 piezas") && t.includes("$3,002.06"), t);
  assert(t.includes("Creatine · GAT Sport · 1 kg") && t.includes("Tienes 1 · +3 pzas"), t);
  assert(t.includes("Psychotic Black · Insane Labz · 60 Servicios") && t.includes("3 pzas · nuevo · 2 sabores"), t);
  assert(t.includes("¿Es tu «Psychotic Gold · Insane Labz · Por confirmar»?"), t);
  assert(t.length < 1400, "pantalla breve: " + t.length);
  const { priceCalc } = require("../src/supplierOrder.ts");
  const pct = ui.root.findAll((n) => n.type === "TextInput" && n.props.accessibilityLabel === "Porcentaje de ganancia")[0];
  await act(async () => pct.props.onChangeText("40"));
  const black = priceCalc(40996, 40, 406);
  const priceInput = ui.root.findAll((n) => n.type === "TextInput" && n.props.accessibilityLabel === "Precio de Psychotic Black · Insane Labz · 60 Servicios")[0];
  assert.equal(priceInput.props.value, (black.client / 100).toFixed(2));
  assert(all().includes(`Ganas ${money(black.profit)} c/u`), all());
  // Existente: por omisión conserva su precio actual.
  assert(all().includes(`Actual ${money(grossUp(64000))}`), all());
  // Detalle (calculadora) detrás de un toque.
  assert(!all().includes("te queda"));
  await act(async () => pressables((n) => n.props.accessibilityLabel === "Detalle de Psychotic Black · Insane Labz · 60 Servicios")[0].props.onPress());
  assert(all().includes(`Costo $409.96 · terminal ${money(black.fee)} · te queda ${money(black.net)}`), all());
  assert(all().includes("Grape · NS-PRE-006-GRA"), all());
  // 2.8.4: la cantidad se puede cambiar antes de cargar (Grape 2 → 1).
  const grapeQty = ui.root.findAll((n) => n.type === "TextInput" && n.props.accessibilityLabel === "Piezas de Grape")[0];
  assert.equal(grapeQty.props.value, "2");
  await act(async () => grapeQty.props.onChangeText("1"));
  assert(all().includes("Grape · NS-PRE-006-GRA · PDF 2"), all());
  assert(all().includes("#0700001 · 6 piezas"), all());
  // Psychotic Gold: sí es el que ya tenía.
  await press("¿Es tu «Psychotic Gold · Insane Labz · Por confirmar»?");
  assert(all().includes("Tienes 0 · +1 pzas"), all());
  await press("Continuar");
  // Paso 3: con qué se pagó y cargar.
  issues.push(...screenIssues(ui, "paso 3"));
  assert(all().includes("6 piezas") && all().includes("2 nuevos · 2 ya los tenías"), all());
  assert(all().includes("¿Con qué pagaste $3,002.06?"), all());
  assert(pressables((n) => text(n).trim() === "Cargar inventario")[0].props.disabled, "pide la cuenta");
  await press("No registrar");
  await press("Cargar inventario");
  assert.equal(b.stock().find((p) => p.id === crea).stock, 4);
  assert.equal(changed, 1);
  assert.equal(notes.at(-1), "Pedido cargado · 6 piezas");
  assert.equal(b.stock().find((p) => p.flavor === "Grape").stock, 1, "cargó la cantidad corregida");
  assert(all().includes("Elegir PDF"), "regresa al paso 1");
  assert.equal(b.balance(bank), 1000000, "sin registrar pago");
  assert(Object.keys(written).some((u) => /Nova-antes-de-pedido-\d+\.json$/.test(u)), "copia previa");
  assert.equal(b.setting("orderMarkupPct", 0), 40);
  issues.push(...screenIssues(ui, "cargado"));
  // 2.8.2 · Punto de control: el mismo pedido otra vez → primero se confirma.
  await press("Elegir PDF");
  issues.push(...screenIssues(ui, "ya se cargó"));
  assert(all().includes("Este pedido ya se cargó"), all());
  assert(all().includes("Actualmente tienes 7 piezas y vas a agregar 7 piezas más del Pedido #0700001 (Pedido 0700001.pdf)."), all());
  assert(!all().includes("Ganancia"), "nada más hasta confirmar");
  await press("Confirmar");
  assert(all().includes("Tienes 4 · +3 pzas"), all());
  await press("Cancelar");
  assert(all().includes("Elegir PDF"), all());
  await act(async () => ui.unmount());

  // Margen y proyección (Resumen de ventas).
  await act(async () => { ui = renderer.create(React.createElement(MarginProjectionCard, { b })); });
  assert(all().includes("Margen y proyección") && all().includes("Solo tú lo ves") && all().includes("Ganancia"), all());
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
  assert(text(modal).includes("Marca:") && text(modal).includes("Insane Labz"), text(modal));
  assert(text(modal).includes("Producto:") && text(modal).includes("Psychotic Black"), text(modal));
  assert(text(modal).includes("Servings:") && text(modal).includes("60 Servicios"), text(modal));
  assert(text(modal).includes("Sabor:"), "tiene sabores → muestra Sabor:");
  assert(!text(modal).includes("Apriétame"), "sin botón Apriétame");
  await act(async () => pressables((n) => n.props.accessibilityLabel === "Agregar sabor Grape")[0].props.onPress());
  const grapeId = grid.find((p) => p.flavor === "Grape").id;
  assert.equal(cart[grapeId], 1);
  issues.push(...screenIssues(ui, "sabores"));
  await act(async () => ui.unmount());

  // 2.9 / 2.10.10 · Ficha minimalista "Acerca de": Marca, Producto, Servings (sin Sabor cuando es Sin Sabor), sin botón Apriétame y filtro en lista compacta.
  b.quickProduct({ id: crea, sku: "NS-CRE-003", name: "Creatine · GAT Sport · 1 kg", category: "Creatina", brand: "GAT Sport", flavor: "Sin Sabor", presentation: "1 kg", price: 64000, description: "Monohidrato de creatina micronizada." });
  const grid2 = b.stock().filter((p) => !p.archived);
  let checkout = 0;
  const props2 = () => ({ ...props(), products: grid2, limitOf: (id) => grid2.find((p) => p.id === id).available, cartCount: Object.values(cart).reduce((n, q) => n + q, 0), onCheckout: () => checkout++ });
  await act(async () => { ui = renderer.create(React.createElement(ProductGrid, props2())); });
  assert(!all().includes("Elegir de la lista"), "sin botón antiguo de filtro vertical");
  assert(pressables((n) => n.props.accessibilityLabel === "Filtrar por").length === 1, "botón Filtrar por embebido en Buscar producto");
  assert(pressables((n) => /^Categoría /.test(n.props.accessibilityLabel || "")).length === 0, "sin barra horizontal de chips afuera de Filtrar");
  await act(async () => pressables((n) => n.props.accessibilityLabel === "Filtrar por")[0].props.onPress());
  assert(pressables((n) => n.props.accessibilityLabel === "Categoría Todos").length === 1, "opción Todo el stock en lista de Filtrar");
  assert(pressables((n) => /^Marca /.test(n.props.accessibilityLabel || "")).length > 0, "listado ordenado de Marca en Filtrar");
  await act(async () => pressables((n) => n.props.accessibilityLabel === "Filtrar por")[0].props.onPress());
  assert(!ui.root.findAll((n) => n.type === "Modal").length, "sin ficha abierta");
  await act(async () => pressables((n) => n.props.accessibilityLabel === "Agregar Creatine · GAT Sport · 1 kg")[0].props.onPress());
  assert.equal(cart[crea], 1, "+ agrega sin abrir la ficha");
  assert(!ui.root.findAll((n) => n.type === "Modal").length);
  await act(async () => pressables((n) => n.props.accessibilityLabel === "Ver Creatine · GAT Sport · 1 kg")[0].props.onPress());
  await act(async () => ui.update(React.createElement(ProductGrid, props2())));
  const sheet = ui.root.findAll((n) => n.type === "Modal")[0];
  assert(text(sheet).includes("Marca:") && text(sheet).includes("GAT Sport"), text(sheet));
  assert(text(sheet).includes("Producto:") && text(sheet).includes("Creatine"), text(sheet));
  assert(text(sheet).includes("Servings:") && text(sheet).includes("1 kg"), text(sheet));
  assert(!text(sheet).includes("Sabor:"), "Sin Sabor no debe indicar renglón de Sabor");
  assert(!text(sheet).includes("Apriétame"), "sin botón Apriétame");
  assert(text(sheet).includes("En el carrito"), text(sheet));
  issues.push(...screenIssues(ui, "ficha"));
  await act(async () => pressables((n) => n.props.accessibilityLabel === "Agregar otra de Sin Sabor")[0].props.onPress());
  assert.equal(cart[crea], 2);
  await act(async () => ui.update(React.createElement(ProductGrid, props2())));
  await press("Cobrar · 3 piezas");
  assert.equal(checkout, 1, "Cobrar lleva al cobro");
  assert(!ui.root.findAll((n) => n.type === "Modal").length, "la ficha se cierra");
  await act(async () => ui.unmount());

  if (issues.length) throw new Error(issues.join("\n"));
  console.log("CARGAR PEDIDO: OK (PDF, existentes y nuevos, calculadora, confirmar producto, cuenta obligatoria, carga, punto de control, margen, elegir sabor y ficha del producto al vender)");
})().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
