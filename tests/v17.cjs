// 1.7–1.9: Excel de ventas, avisos de seguimiento 5 días antes, venta por
// categoría con fotos, carrito y (1.9) comisión que paga el cliente sobre el
// precio original con cualquier forma de pago.
const fs = require("fs"), path = require("path"), os = require("os"), Module = require("module"), ts = require("typescript"), assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
global.IS_REACT_ACT_ENVIRONMENT = true;
for (const extension of [".ts", ".tsx"]) require.extensions[extension] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, file);
require.extensions[".jpg"] = (m, file) => (m.exports = { asset: file });
const React = require("react"), renderer = require("react-test-renderer"), { act } = renderer;
const sql = new DatabaseSync(":memory:");
const db = { execSync: (s) => sql.exec(s), runSync: (s, ...p) => sql.prepare(s).run(...p), getAllSync: (s, ...p) => sql.prepare(s).all(...p), getFirstSync: (s, ...p) => sql.prepare(s).get(...p), withTransactionSync: (f) => { sql.exec("BEGIN"); try { f(); sql.exec("COMMIT"); } catch (e) { sql.exec("ROLLBACK"); throw e; } } };
const callbacks = {}, alerts = [], written = {}, shared = [];
const rn = { StyleSheet: { create: (x) => x }, Platform: { OS: "android" }, Alert: { alert: (...a) => alerts.push(a) }, AppState: { addEventListener: (e, f) => { (callbacks.state = callbacks.state || []).push(f); return { remove() {} }; } }, BackHandler: { addEventListener: (e, f) => ({ remove() {} }), exitApp() {} }, Vibration: { vibrate() {} }, Share: { share: async () => {} }, Linking: { openURL: async () => {} }, useWindowDimensions: () => ({ width: 400, height: 800 }) };
for (const c of ["Image", "Modal", "Pressable", "ScrollView", "Switch", "Text", "TextInput", "View", "StatusBar", "KeyboardAvoidingView", "ActivityIndicator"]) rn[c] = c;
rn.FlatList = function FlatList(p) { return React.createElement("View", null, p.ListHeaderComponent, (p.data || []).map((item, index) => React.createElement(React.Fragment, { key: p.keyExtractor ? p.keyExtractor(item) : index }, p.renderItem({ item, index }))), !(p.data || []).length && p.ListEmptyComponent); };
const fsMock = { documentDirectory: "file:///doc/", EncodingType: { Base64: "base64" }, writeAsStringAsync: async (u, v, o) => { written[u] = { v, o }; }, readDirectoryAsync: async () => Object.keys(written).map((u) => u.replace("file:///doc/", "")), deleteAsync: async (u) => { delete written[u]; }, getInfoAsync: async () => ({ exists: false }), readAsStringAsync: async () => "" };
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === "react-native") return rn;
  if (name === "react-native-safe-area-context") return { SafeAreaProvider: "SafeAreaProvider", SafeAreaView: "SafeAreaView" };
  if (name === "expo-sqlite") return { openDatabaseSync: () => db };
  if (name === "expo-local-authentication") return { hasHardwareAsync: async () => false, isEnrolledAsync: async () => false };
  if (name === "expo-file-system/legacy") return fsMock;
  if (name === "expo-sharing") return { isAvailableAsync: async () => true, shareAsync: async (u, o) => shared.push({ u, o }) };
  if (name.startsWith("expo-")) return {};
  return original.call(this, name, ...args);
};
const App = require("../App.tsx").default;
const { Business, upliftPrice, saleSegment, grossUp, chargeFor, money } = require("../src/business.ts");
const { addDays } = require("../src/ui.tsx");
let ui;
const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(" "));
const all = () => text(ui.root);
const pressables = (pred) => ui.root.findAll((n) => n.type === "Pressable" && typeof n.props.onPress === "function" && pred(n));
async function press(label) { const c = pressables((n) => text(n).includes(label)); assert(c.length, label); await act(async () => c[c.length - 1].props.onPress()); }
async function pressExact(label) { const c = pressables((n) => text(n).trim() === label && !n.props.disabled); assert(c.length, label); await act(async () => c[0].props.onPress()); }
async function tab(label) { const c = pressables((n) => text(n).trim().endsWith(" " + label) || text(n).trim() === label); assert(c.length, label); await act(async () => c[c.length - 1].props.onPress()); }
async function pressLabel(label) { const c = pressables((n) => n.props.accessibilityLabel === label); assert(c.length, label); await act(async () => c[0].props.onPress()); }
const tiles = () => ui.root.findAll((n) => n.type === "Pressable" && /^Agregar /.test(n.props.accessibilityLabel || "") && !/^Agregar otra/.test(n.props.accessibilityLabel)).map((n) => n.props.accessibilityLabel.slice(8));
const flush = async (ms = 50) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const day = (n) => addDays(require("../src/business.ts").today(), n);

(async () => {
  global.__NOVA_SKIP_LOCK = true;
  const b = require("./seed.cjs")(db);
  b.setSetting("appRole", "owner");
  // ---------- 1. 1.9 · Precios de regreso al original (un teléfono 1.7/1.8 los traía +4.06%) ----------
  b.run("DELETE FROM settings WHERE key='pricing'");
  const before = new Map(b.all("SELECT id,price FROM products").map((p) => [p.id, p.price]));
  const bundlesBefore = new Map(b.all("SELECT id,price FROM bundles").map((p) => [p.id, p.price]));
  for (const [id, price] of before) b.run("UPDATE products SET price=? WHERE id=?", upliftPrice(price), id);
  for (const [id, price] of bundlesBefore) b.run("UPDATE bundles SET price=? WHERE id=?", upliftPrice(price), id);
  b.setSetting("catalogUplift", { bps: 406, at: "2026-10-01T00:00:00.000Z", products: Object.fromEntries(before), bundles: Object.fromEntries(bundlesBefore) });
  // Seguimientos: uno en 3 días, uno vencido y uno lejano (no avisa).
  const ana = b.saveCustomer({ name: "Ana Seguimiento", phone: "5511112222", nextDate: day(3) });
  const beto = b.saveCustomer({ name: "Beto Vencido", phone: "", nextDate: day(-2) });
  b.saveCustomer({ name: "Carla Lejana", phone: "", nextDate: day(20) });
  await act(async () => { ui = renderer.create(React.createElement(App)); });
  await flush(1400);
  for (const [id, price] of before) assert.equal(b.one("SELECT price FROM products WHERE id=?", id).price, price, "precio original");
  for (const [id, price] of bundlesBefore) assert.equal(b.one("SELECT price FROM bundles WHERE id=?", id).price, price, "paquete al precio original");
  assert.equal(Object.keys(b.setting("pricing").changed.products).length, before.size, "guarda qué cambió");
  assert(all().includes("Precios originales restaurados"), "avisa del cambio de precios");
  assert.ok(b.all("SELECT * FROM audit WHERE action='catalog.restore'").length === 1);
  assert.equal(b.restoreBasePrices(), 0, "una sola vez");
  console.log("  ✓ 1.9: el catálogo regresa al precio original una sola vez (productos y paquetes, con registro)");

  // ---------- 2. Aviso de seguimientos ----------
  const followAlerts = alerts.filter((a) => /seguimiento/i.test(a[0]));
  assert.equal(followAlerts.length, 1, JSON.stringify(alerts));
  assert.match(followAlerts[0][1], /Ana Seguimiento: En 3 días/);
  assert.match(followAlerts[0][1], /Beto Vencido: Vencido hace 2 días/);
  assert.doesNotMatch(followAlerts[0][1], /Carla/);
  assert(all().includes("2 seguimientos próximos"), "aviso arriba de Vender");
  await act(async () => followAlerts[0][2][1].onPress());
  assert(all().includes("Próximos 5 días") && all().includes("Ana Seguimiento") && !all().includes("Carla Lejana"), "filtro de clientes");
  // Volver a la app el mismo día no repite el aviso…
  await act(async () => callbacks.state.forEach((f) => f("active")));
  assert.equal(alerts.filter((a) => /seguimiento/i.test(a[0])).length, 1, "no se repite el mismo día");
  // …pero sí avisa si entra uno nuevo a la ventana de 5 días.
  b.saveCustomer({ id: b.one("SELECT id FROM customers WHERE name='Carla Lejana'").id, name: "Carla Lejana", phone: "", nextDate: day(5) });
  await act(async () => callbacks.state.forEach((f) => f("active")));
  const again = alerts.filter((a) => /seguimiento/i.test(a[0]));
  assert.equal(again.length, 2);
  assert.match(again[1][1], /Carla Lejana: En 5 días/);
  alerts.length = 0;
  console.log("  ✓ aviso de seguimientos 5 días antes (y vencidos), una vez por día, aviso en Vender y filtro en Clientes");

  // ---------- 3. Venta por categoría con fotos ----------
  await tab("Vender");
  const cats = ui.root.findAll((n) => n.type === "Pressable" && /^Categoría /.test(n.props.accessibilityLabel || "")).map((n) => n.props.accessibilityLabel.slice(10));
  assert.deepEqual(cats.slice(0, 3), ["Creatinas", "Proteínas", "PWO"].filter((c) => cats.includes(c)).slice(0, 3), "orden: Creatinas, Proteínas, PWO…");
  assert(cats.includes("Snacks") && cats.includes("Vitaminas") && cats.at(-1) === "Todos", JSON.stringify(cats));
  const prods = b.stock().filter((p) => !p.archived);
  const creat = prods.filter((p) => saleSegment(p) === "Creatinas").map((p) => p.name).sort();
  assert.deepEqual(tiles().sort(), creat, "primero muestra Creatinas con fotos");
  await pressLabel("Categoría PWO");
  const pwo = prods.filter((p) => saleSegment(p) === "PWO");
  assert.deepEqual(tiles().sort(), pwo.map((p) => p.name).sort(), "PWO");
  const pick = pwo.find((p) => p.available > 1);
  await pressLabel("Agregar " + pick.name);
  await pressLabel("Agregar otra de " + pick.name);
  assert(all().includes("🛒 Carrito · 2 piezas"), "la barra del carrito muestra lo agregado");
  assert.equal(ui.root.findAll((n) => n.type === "Text" && n.props.style && n.props.style.backgroundColor === undefined && text(n).trim() === "2").length > 0, true, "la foto muestra 2 en la venta");
  await pressLabel("Quitar una de " + pick.name);
  assert(all().includes(`${pick.name}`));
  // Buscar atraviesa categorías.
  const snack = prods.find((p) => saleSegment(p) === "Snacks");
  const box = ui.root.findAll((n) => n.type === "TextInput" && n.props.accessibilityLabel === "Buscar producto")[0];
  await act(async () => box.props.onChangeText(snack.name.split(" ")[0]));
  assert(tiles().includes(snack.name), "la búsqueda encuentra en todas las categorías");
  // El carrito: productos, cliente, forma de cobro y desglose en una sola pantalla.
  await pressLabel("Abrir carrito");
  assert(all().includes("🛒 Tu carrito · 1 pieza") && all().includes("Solo lo ves tú") && all().includes("Total a cobrar"), "carrito con desglose del dueño");
  assert(!ui.root.findAll((n) => /^Categoría /.test(n.props.accessibilityLabel || "")).length, "el carrito no repite el catálogo");
  await pressExact("Cerrar");
  assert(ui.root.findAll((n) => n.props.accessibilityLabel === "Abrir carrito").length, "cerrar no vacía el carrito");
  await pressExact("🗑 Vaciar carrito");
  console.log("  ✓ venta por categoría (Creatinas, Proteínas, PWO, Snacks, Vitaminas…) con fotos, sin lista");

  // ---------- 4. Excel de ventas ----------
  const card = b.all("SELECT id FROM accounts WHERE kind='Tarjeta'")[0].id;
  const p = b.stock().find((x) => x.available > 0);
  const pTotal = grossUp(p.price);
  b.sell([{ productId: p.id, qty: 1 }], pTotal, pTotal, card, null, null, "Mostrador", false, null, { amount: pTotal - p.price, bps: 406 });
  await tab("Ventas");
  await press("📥 Descargar Excel de ventas");
  await pressExact("Todo");
  await press("Descargar Excel · Todo");
  for (let i = 0; i < 5; i++) await flush(30);
  const files = Object.keys(written).filter((u) => /Ventas_Nova_Todo_.*\.xlsx$/.test(u));
  assert.equal(files.length, 1, Object.keys(written).join(","));
  assert.equal(written[files[0]].o.encoding, "base64");
  assert.equal(shared.at(-1).o.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const tmp = path.join(os.tmpdir(), "nova-v17-" + process.pid + ".xlsx");
  fs.writeFileSync(tmp, Buffer.from(written[files[0]].v, "base64"));
  const out = JSON.parse(execFileSync(process.env.NOVA_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-I", "-c", `
import json,sys,openpyxl
wb=openpyxl.load_workbook(sys.argv[1])
v=wb['Ventas'];hdr=[c.value for c in v[1]]
rows=[[c.value for c in r] for r in v.iter_rows(min_row=2,max_row=v.max_row-1)]
print(json.dumps({'sheets':wb.sheetnames,'hdr':hdr,'n':len(rows),'last':[str(x) if x is not None else None for x in rows[-1]],'prod':wb['Productos vendidos'].max_row,'cobros':wb['Cobros y comisiones'].max_row,'res':[[str(c) for c in r] for r in wb['Resumen'].iter_rows(min_row=1,max_row=20,values_only=True)]}))
`, tmp]).toString());
  fs.unlinkSync(tmp);
  assert.deepEqual(out.sheets, ["Resumen", "Ventas", "Productos vendidos", "Cobros y comisiones", "Por producto", "Por vendedor"]);
  assert.equal(out.n, b.sales().length, "una fila por venta");
  for (const h of ["Fecha", "Folio", "Cliente", "Productos", "Tu precio", "Comisión absorbida por el cliente", "Total venta", "Forma de cobro", "¿Comisión Mercado Pago?", "Comisión Mercado Pago", "Neto recibido", "Utilidad"]) assert(out.hdr.includes(h), h);
  const last = Object.fromEntries(out.hdr.map((h, i) => [h, out.last[i]]));
  assert.equal(last["Forma de cobro"], "Tarjeta (terminal)");
  assert.equal(last["¿Comisión Mercado Pago?"], "Sí");
  assert.equal(Number(last["Tu precio"]), p.price / 100, "precio de catálogo");
  assert.equal(Number(last["Comisión absorbida por el cliente"]), (pTotal - p.price) / 100, "comisión que absorbió el cliente");
  assert.equal(Number(last["Total venta"]), pTotal / 100, "lo que pagó el cliente");
  assert.equal(Number(last["Comisión Mercado Pago"]), Math.round((pTotal * 406) / 10000) / 100);
  assert.equal(Number(last["Neto recibido"]), p.price / 100, "2.0: recibes tu precio exacto");
  assert(out.res.some((r) => /Comisión absorbida por clientes/.test(r[0])) && out.res.some((r) => /Comisión Mercado Pago/.test(r[0])), JSON.stringify(out.res));
  assert(all().includes("Excel listo"));
  console.log("  ✓ Excel de ventas: resumen, cada venta (precio, comisión del cliente, comisión Mercado Pago, neto, utilidad), productos y movimientos");

  // ---------- 5. 1.8 · Carrito de compras ----------
  await tab("Stock");
  const inCart = () => pressables((n) => text(n).trim() === "🛒 Al carrito" && !n.props.disabled);
  const s0 = b.sales().length;
  await act(async () => inCart()[0].props.onPress());
  await act(async () => inCart()[0].props.onPress());
  assert(all().includes("🛒 Carrito · 2 piezas"), "Stock manda al carrito sin abrir la venta");
  assert(!ui.root.findAll((n) => n.type === "Modal").some((m) => m.props.visible), "no obliga a llenar la venta");
  assert(all().includes("🛒 En el carrito: 1"));
  await pressLabel("Abrir carrito");
  const cardName = b.all("SELECT name FROM accounts WHERE kind='Tarjeta'")[0].name;
  await pressExact(cardName);
  assert(all().includes("Mercado Pago descuenta 4.06%") && all().includes("Recibes"), "desglose con tarjeta");
  const cash = b.all("SELECT name FROM accounts WHERE kind='Efectivo'")[0].name;
  await pressExact(cash);
  assert(all().includes("Comisión que absorbe el cliente"), "efectivo: también la absorbe el cliente");
  await pressExact("Cobrar y confirmar venta");
  for (let i = 0; i < 3; i++) await flush(20);
  assert.equal(b.sales().length, s0 + 1, "venta registrada desde el carrito");
  assert(!ui.root.findAll((n) => n.props.accessibilityLabel === "Abrir carrito").length, "el carrito queda vacío después de cobrar");
  {
    const v = b.saleDetail(b.sales()[0].id);
    const goods = v.lines.reduce((n, l) => n + l.total, 0);
    const c = chargeFor(v.lines.map((l) => ({ qty: l.qty, price: l.unitPrice })));
    assert.equal(v.total, c.total, "2.0: efectivo también: el cliente absorbe la comisión");
    assert.equal(v.commission, c.total - goods);
    assert.equal(b.all("SELECT SUM(amount) n FROM ledger WHERE ref=?", v.id)[0].n, v.total, "efectivo entra completo");
    const receipt = require("../src/receipt.ts").saleReceiptText(v);
    assert(!/Comisi[oó]n/.test(receipt) && receipt.includes(`Subtotal: ${money(c.subtotal)}`) && receipt.includes(`Total: ${money(v.total)}`), "comprobante sin comisión: " + receipt);
    for (const l of v.lines) assert(receipt.includes(`${l.qty} × ${l.name}  ${money(l.qty * grossUp(l.unitPrice))}`), "precio al cliente por producto: " + receipt);
  }
  console.log("  ✓ carrito: Stock y Vender mandan al carrito; ahí se elige cliente, forma de cobro y se ve el desglose");

  // ---------- 5b. 2.0 · Vaciar el carrito desde el cobro ----------
  await tab("Stock");
  await act(async () => inCart()[0].props.onPress());
  const barText = text(pressables((n) => n.props.accessibilityLabel === "Abrir carrito")[0]);
  const one = b.stock().find((x) => all().includes("🛒 En el carrito: 1") && x.available > 0 && barText.includes(money(grossUp(x.price))));
  assert(one, "la barra del carrito muestra el precio al cliente: " + barText);
  await pressLabel("Abrir carrito");
  const bank = b.all("SELECT name FROM accounts WHERE kind='Banco'")[0].name;
  await pressExact(bank);
  assert(all().includes("Comisión que absorbe el cliente"), "transferencia también");
  assert(!ui.root.findAll((n) => n.type === "Switch" && n.props.accessibilityLabel === "Sumar comisión").length, "2.0: sin interruptor");
  const s1 = b.sales().length;
  await pressExact("🗑 Vaciar carrito");
  assert(!ui.root.findAll((n) => n.type === "Modal").some((m) => m.props.visible), "cierra el cobro");
  assert(!ui.root.findAll((n) => n.props.accessibilityLabel === "Abrir carrito").length, "carrito vacío");
  assert.equal(b.sales().length, s1, "no registra nada");
  assert.ok(b.periodSummary(null).commissions > 0, "resumen: comisión absorbida por clientes");
  console.log("  ✓ 2.0: el cliente absorbe la comisión con cualquier forma de pago; vaciar carrito desde el cobro");

  // ---------- 6. Módulo de comisión ----------
  await tab("Parámetros");
  assert(all().includes("Comisión que absorbe el cliente") && all().includes("El cliente paga") && all().includes("$1,042.32") && all().includes("Recibes"));
  await pressExact("Cambiar porcentaje");
  const rate = ui.root.findAll((n) => n.type === "TextInput" && n.props.accessibilityLabel === "Comisión (%) *")[0];
  await act(async () => rate.props.onChangeText("3.8"));
  const prices0 = b.all("SELECT id,price FROM products ORDER BY id");
  await pressExact("Guardar");
  assert.equal(b.feeBps(), 380);
  assert(all().includes("3.8%") && all().includes(money(grossUp(100000, 380))), "el ejemplo usa el nuevo porcentaje");
  assert(!all().includes("Ajustar precios"), "los precios no se tocan");
  assert.deepEqual(b.all("SELECT id,price FROM products ORDER BY id"), prices0, "cambiar la comisión no cambia precios");
  b.setFeeBps(406);
  console.log("  ✓ Parámetros → comisión: porcentaje configurable (la absorbe el cliente) sin tocar los precios");

  assert.equal(alerts.length, 0, JSON.stringify(alerts));
  await act(async () => ui.unmount());
  console.log("1.7 – 2.0: OK");
})().then(() => process.exit(process.exitCode || 0)).catch((e) => { console.error(e); process.exit(1); });
