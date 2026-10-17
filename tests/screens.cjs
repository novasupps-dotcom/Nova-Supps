// Recorre todas las pantallas del dueño (pestañas, Parámetros con funciones
// avanzadas, detalles y formularios principales) y revisa que ninguna se rompa.
const fs = require("fs"), Module = require("module"), ts = require("typescript"), assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { screenIssues, text } = require("./screenCheck.cjs");
global.IS_REACT_ACT_ENVIRONMENT = true;
global.__NOVA_NO_FOLLOW_ALERT = true;
for (const extension of [".ts", ".tsx"]) require.extensions[extension] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, file);
require.extensions[".jpg"] = (m, file) => (m.exports = { asset: file });
const React = require("react"), renderer = require("react-test-renderer"), { act } = renderer;
const sql = new DatabaseSync(":memory:");
const db = { execSync: (s) => sql.exec(s), runSync: (s, ...p) => sql.prepare(s).run(...p), getAllSync: (s, ...p) => sql.prepare(s).all(...p), getFirstSync: (s, ...p) => sql.prepare(s).get(...p), withTransactionSync: (f) => { sql.exec("BEGIN"); try { f(); sql.exec("COMMIT"); } catch (e) { sql.exec("ROLLBACK"); throw e; } } };
const alerts = [];
const rn = { StyleSheet: { create: (x) => x }, Platform: { OS: "android" }, Alert: { alert: (...a) => alerts.push(a) }, AppState: { addEventListener: () => ({ remove() {} }) }, BackHandler: { addEventListener: () => ({ remove() {} }), exitApp() {} }, Vibration: { vibrate() {} }, Share: { share: async () => {} }, Linking: { openURL: async () => {} }, useWindowDimensions: () => ({ width: 400, height: 800 }) };
for (const c of ["Image", "Modal", "Pressable", "ScrollView", "Switch", "Text", "TextInput", "View", "StatusBar", "KeyboardAvoidingView", "ActivityIndicator"]) rn[c] = c;
rn.FlatList = function FlatList(p) { return React.createElement("View", null, p.ListHeaderComponent, (p.data || []).map((item, index) => React.createElement(React.Fragment, { key: p.keyExtractor ? p.keyExtractor(item) : index }, p.renderItem({ item, index }))), !(p.data || []).length && p.ListEmptyComponent); };
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === "react-native") return rn;
  if (name === "react-native-safe-area-context") return { SafeAreaProvider: "SafeAreaProvider", SafeAreaView: "SafeAreaView" };
  if (name === "expo-sqlite") return { openDatabaseSync: () => db };
  if (name === "expo-local-authentication") return { hasHardwareAsync: async () => false, isEnrolledAsync: async () => false };
  if (name.startsWith("expo-")) return {};
  return original.call(this, name, ...args);
};
const App = require("../App.tsx").default;
let ui;
const issues = [];
const pressables = (pred) => ui.root.findAll((n) => n.type === "Pressable" && typeof n.props.onPress === "function" && pred(n));
async function tap(n) { await act(async () => n.props.onPress()); await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); }
async function tab(label) { let c = pressables((n) => text(n).trim().endsWith(" " + label) || text(n).trim() === label); if (!c.length) c = pressables((n) => n.props.accessibilityLabel === label); if (!c.length && label === "Ajustes") { const v = pressables((n) => n.props.accessibilityState && "selected" in n.props.accessibilityState && text(n).trim() === "Vender"); if (v.length) await act(async () => v[v.length - 1].props.onPress()); c = pressables((n) => n.props.accessibilityLabel === label); } assert(c.length, label); await tap(c[c.length - 1]); }
const check = (where) => issues.push(...screenIssues(ui, where));
const formOpen = () => ui.root.findAll((n) => n.type === "Modal").some((m) => m.props.visible);
async function closeForm() { for (let i = 0; i < 3 && formOpen(); i++) { const c = pressables((n) => ["Cerrar", "Volver", "Cancelar"].includes(text(n).trim())); if (!c.length) break; await tap(c[0]); } }

(async () => {
  global.__NOVA_SKIP_LOCK = true;
  const b = require("./seed.cjs")(db);
  b.setSetting("appRole", "owner");
  b.saveCustomer({ name: "Cliente Seguimiento", phone: "5512345678", nextDate: require("../src/business.ts").today() });
  await act(async () => { ui = renderer.create(React.createElement(App)); });
  let pages = 0;
  for (const t of ["Vender", "Ventas", "Clientes", "Stock", "Ajustes"]) {
    await tab(t);
    check(t);
    pages++;
  }
  // Detalles
  await tab("Ventas");
  const saleCard = pressables((n) => /VNS\d+|V-/.test(text(n)) && text(n).includes("$"))[0];
  if (saleCard) { await tap(saleCard); check("Detalle venta"); pages++; }
  await tab("Stock");
  const prodCard = pressables((n) => text(n).includes("disponibles") && text(n).includes("Cliente paga"))[0];
  if (prodCard) { await tap(prodCard); check("Detalle producto"); pages++; }
  // Parámetros (con las funciones avanzadas encendidas para recorrerlas todas)
  await tab("Ajustes");
  const sw = ui.root.findAll((n) => n.type === "Switch" && n.props.accessibilityLabel === "Funciones avanzadas")[0];
  assert(sw, "interruptor de funciones avanzadas");
  await act(async () => sw.props.onValueChange(true));
  // 2.3: cada fila de Ajustes es un botón con testID "menu:<título>".
  const rows = [...new Set(pressables((n) => String(n.props.testID || "").startsWith("menu:")).map((n) => n.props.testID))];
  assert(rows.length >= 12, "Ajustes + avanzadas: " + rows.length);
  for (const r of rows) {
    await tab("Ajustes");
    const row = pressables((n) => n.props.testID === r)[0];
    if (!row) continue;
    await tap(row);
    check("Ajustes → " + r.slice(5));
    pages++;
  }
  for (const [t, label] of [["Ventas", "Corte de caja"], ["Ventas", "Resumen"]]) {
    await tab(t);
    await tap(pressables((n) => text(n).trim() === label)[0]);
    check(`${t} → ${label}`);
    pages++;
  }
  // Formularios principales
  const forms = [["Vender", "＋ Producto nuevo"], ["Stock", "Nuevo producto"], ["Clientes", "Nuevo cliente"], ["Stock", "Nueva entrada"], ["Ventas", "Nuevo gasto"], ["Ventas", "Excel"]];
  for (const [t, label] of forms) {
    await tab(t);
    const btn = pressables((n) => text(n).trim() === label)[0] || pressables((n) => n.props.accessibilityLabel === label)[0];
    assert(btn, label);
    await tap(btn);
    check(`${t} → ${label}`);
    pages++;
    await closeForm();
  }
  // Carrito (1.8): agregar desde Stock y abrir el carrito.
  await tab("Stock");
  const add = pressables((n) => text(n).trim() === "Al carrito" && !n.props.disabled)[0];
  if (add) {
    await tap(add);
    check("Stock con carrito");
    const bar = pressables((n) => n.props.accessibilityLabel === "Abrir carrito")[0];
    assert(bar, "barra del carrito");
    await tap(bar);
    check("Carrito");
    pages += 2;
    await closeForm();
  }
  // En pantalla ancha (tableta) también.
  rn.useWindowDimensions = () => ({ width: 1100, height: 800 });
  await act(async () => ui.update(React.createElement(App)));
  for (const t of ["Vender", "Ventas", "Stock"]) { await tab(t); check("Ancha · " + t); pages++; }
  await act(async () => ui.unmount());
  if (issues.length) {
    console.error("PROBLEMAS EN PANTALLAS:\n- " + [...new Set(issues)].join("\n- "));
    process.exitCode = 1;
  } else console.log(`PANTALLAS: OK (${pages} pantallas y formularios revisados sin textos sueltos, valores rotos ni avisos de React)`);
})().then(() => process.exit(process.exitCode || 0)).catch((e) => { console.error(e); process.exit(1); });
