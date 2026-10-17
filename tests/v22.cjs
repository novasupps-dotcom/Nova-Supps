const fs = require("node:fs"),
  Module = require("node:module"),
  ts = require("typescript"),
  assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
global.IS_REACT_ACT_ENVIRONMENT = true;
global.__NOVA_NO_FOLLOW_ALERT = true;
global.__NOVA_SKIP_LOCK = true;
global.__OWNER_SYNC_MS = global.__SELLER_SYNC_MS = 10 ** 8;
const names = [
  "ExpoCamera",
  "ExpoNotificationScheduler",
  "ExpoNotificationPermissionsModule",
  "ExpoPushTokenManager",
  "ExpoSecureStore",
  "ExpoUpdates",
  "ExponentImagePicker",
  "ExpoImageManipulator",
];
global.__NOVA_NATIVE = Object.fromEntries(names.map((n) => [n, true]));
for (const ext of [".ts", ".tsx"])
  require.extensions[ext] = (m, f) =>
    m._compile(
      ts.transpileModule(fs.readFileSync(f, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText,
      f,
    );
for (const ext of [".png", ".jpg"])
  require.extensions[ext] = (m, f) => {
    m.exports = { asset: f };
  };
const React = require("react"),
  renderer = require("react-test-renderer"),
  { act } = renderer;
let permission = { granted: true, canAskAgain: true },
  cameraPermission = { granted: true, canAskAgain: true };
let requests = 0,
  tokenRequests = 0,
  cameraRequests = 0,
  receivers = {},
  handler,
  pid = "10000000-0000-4000-8000-000000000022";
let scheduled = [],
  lastResponse = null,
  reloaded = 0,
  updateChecks = 0,
  updateFetches = 0,
  updateAvailable = false,
  failRpc = false,
  deferToken = null;
const channels = [],
  calls = [],
  secureData = new Map();
const N = {
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  setNotificationHandler: (h) => {
    handler = h;
  },
  setNotificationChannelAsync: async (id, c) => {
    channels.push(id);
  },
  getPermissionsAsync: async () => permission,
  requestPermissionsAsync: async () => {
    requests++;
    permission = { granted: true };
    return permission;
  },
  getExpoPushTokenAsync: async () => {
    tokenRequests++;
    if (deferToken) await deferToken;
    return { data: "ExponentPushToken[synthetic_token_phone]" };
  },
  addNotificationReceivedListener: (f) => {
    receivers.receive = f;
    return {
      remove: () => {
        delete receivers.receive;
      },
    };
  },
  addNotificationResponseReceivedListener: (f) => {
    receivers.tap = f;
    return {
      remove: () => {
        delete receivers.tap;
      },
    };
  },
  getLastNotificationResponseAsync: async () => lastResponse,
  clearLastNotificationResponseAsync: async () => {
    lastResponse = null;
  },
  getAllScheduledNotificationsAsync: async () => [...scheduled],
  cancelScheduledNotificationAsync: async (id) => {
    scheduled = scheduled.filter((n) => n.identifier !== id);
  },
  scheduleNotificationAsync: async (n) => {
    scheduled.push(n);
    return n.identifier;
  },
};
const U = {
  isEnabled: false,
  checkForUpdateAsync: async () => {
    updateChecks++;
    return { isAvailable: updateAvailable };
  },
  fetchUpdateAsync: async () => {
    updateFetches++;
    return { isNew: true };
  },
  reloadAsync: async () => {
    reloaded++;
  },
};
const camera = {
  CameraView: "CameraView",
  Camera: {
    getCameraPermissionsAsync: async () => cameraPermission,
    requestCameraPermissionsAsync: async () => {
      cameraRequests++;
      cameraPermission = { granted: true };
      return cameraPermission;
    },
  },
};
const callbacks = {},
  alerts = [];
const rn = {
  StyleSheet: { create: (x) => x },
  Platform: { OS: "android" },
  AppState: {
    currentState: "active",
    addEventListener: (k, f) => {
      const id = Math.random();
      callbacks[id] = f;
      return {
        remove: () => {
          delete callbacks[id];
        },
      };
    },
  },
  Alert: { alert: (...a) => alerts.push(a) },
  Linking: { openSettings: async () => {}, openURL: async () => {} },
  BackHandler: { addEventListener: () => ({ remove() {} }), exitApp() {} },
  Vibration: { vibrate() {} },
  Share: { share: async () => {} },
  useWindowDimensions: () => ({ width: 400, height: 800 }),
};
for (const name of [
  "Text",
  "View",
  "Pressable",
  "Image",
  "ScrollView",
  "Modal",
  "Switch",
  "TextInput",
  "StatusBar",
  "KeyboardAvoidingView",
  "ActivityIndicator",
])
  rn[name] = name;
rn.FlatList = (p) =>
  React.createElement(
    "View",
    null,
    p.ListHeaderComponent,
    (p.data || []).map((item, index) =>
      React.createElement(
        React.Fragment,
        { key: index },
        p.renderItem({ item, index }),
      ),
    ),
    !(p.data || []).length && p.ListEmptyComponent,
  );
const sql = new DatabaseSync(":memory:");
const db = {
  execSync: (s) => sql.exec(s),
  runSync: (s, ...p) => sql.prepare(s).run(...p),
  getAllSync: (s, ...p) => sql.prepare(s).all(...p),
  getFirstSync: (s, ...p) => sql.prepare(s).get(...p),
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
};
const original = Module._load;
Module._load = function (name, ...args) {
  if (name === "react-native") return rn;
  if (name === "react-native-safe-area-context")
    return {
      SafeAreaView: "SafeAreaView",
      SafeAreaProvider: "SafeAreaProvider",
    };
  if (name === "expo-notifications") return N;
  if (name === "expo-camera") return camera;
  if (name === "expo-secure-store")
    return {
      getItem: (k) => secureData.get(k) ?? null,
      setItem: (k, v) => secureData.set(k, v),
      deleteItemAsync: async (k) => {
        secureData.delete(k);
      },
    };
  if (name === "expo-updates") return U;
  if (name === "expo-constants")
    return { default: { expoConfig: { extra: { eas: { projectId: pid } } } } };
  if (name === "expo-modules-core")
    return { requireOptionalNativeModule: () => null };
  if (name === "expo-sqlite") return { openDatabaseSync: () => db };
  if (name === "expo-local-authentication")
    return {
      hasHardwareAsync: async () => false,
      isEnrolledAsync: async () => false,
    };
  if (name.startsWith("expo-"))
    return {
      documentDirectory: "file:///doc/",
      cacheDirectory: "file:///cache/",
    };
  return original.call(this, name, ...args);
};
const { Business } = require("../src/business.ts"),
  push = require("../src/push.ts"),
  native = require("../src/native.ts");
const b = new Business(db);
const cloud = {
  userId: "synthetic-user",
  session: { user: { id: "synthetic-user" } },
  cfg: { url: "https://synthetic.invalid" },
  rpc: async (name, args) => {
    calls.push({ name, args });
    if (failRpc) throw { status: 404, code: "PGRST202" };
  },
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = (n) =>
  typeof n === "string" ? n : (n.children || []).map(text).join(" ");
async function mount(element) {
  let ui;
  await act(async () => {
    ui = renderer.create(element);
    await flush();
  });
  return ui;
}
async function dispose(ui) {
  await act(async () => ui.unmount());
}

(async () => {
  assert.equal(native.canScan(), true);
  assert.equal(native.canSecure(), true);
  permission = { granted: false, canAskAgain: true };
  assert.equal(await push.registerPush(b, cloud), "denied");
  assert.equal(requests, 0);
  assert.equal(await push.registerPush(b, cloud, true), "ok");
  assert.equal(requests, 1);
  assert.equal(calls[0].name, "save_push_token");
  assert.ok(channels.includes("ventas"));
  const before = tokenRequests;
  assert.equal(await push.registerPush(b, cloud), "ok");
  assert.equal(tokenRequests, before, "registro fresco no solicita otro token");
  failRpc = true;
  await assert.rejects(push.unregisterPush(b, cloud));
  assert.ok(
    b.setting("pushToken").token,
    "no pierde el token si falla la desactivación",
  );
  failRpc = false;
  await push.unregisterPush(b, cloud);
  assert.equal(b.setting("pushToken"), null);
  assert.equal(await push.autoRegisterPush(b, cloud), "off");
  assert.equal(await push.registerPush(b, cloud, true), "ok");
  await push.detachPush(b, cloud);
  assert.equal(b.setting("pushOff", false), null);
  assert.equal(b.setting("pushAsked"), null);
  failRpc = true;
  assert.equal(await push.registerPush(b, cloud, true), "schema_missing");
  failRpc = false;
  pid = null;
  assert.equal(await push.registerPush(b, cloud, true), "no_project");
  pid = "10000000-0000-4000-8000-000000000022";
  let release;
  deferToken = new Promise((r) => {
    release = r;
  });
  const registration = push.registerPush(b, cloud, true);
  await flush();
  const disabling = push.unregisterPush(b, cloud);
  release();
  await registration;
  await disabling;
  deferToken = null;
  assert.equal(b.setting("pushOff"), true);
  assert.equal(
    b.setting("pushToken"),
    null,
    "desactivar durante registro no vuelve a activarlo",
  );
  console.log(
    "  ✓ Push: permiso explícito, canal Android, registro, caché, retiro, cambio de cuenta y desactivación concurrente",
  );
  b.setSetting("pushOff", null);
  lastResponse = {
    notification: {
      request: {
        identifier: "cold-start",
        content: { data: { kind: "sale" } },
      },
    },
  };
  let taps = 0,
    receives = 0;
  const stop = push.setupNotifications(
    () => taps++,
    () => receives++,
  );
  await flush();
  assert.equal(taps, 1);
  receivers.receive({ request: { content: { data: { kind: "sale" } } } });
  assert.equal(receives, 1);
  stop();
  assert.equal(Object.keys(receivers).length, 0);
  const disabledHandler = push.setupNotifications(null, null, () => false);
  assert.equal((await handler.handleNotification()).shouldShowBanner, false);
  disabledHandler();
  scheduled = [
    { identifier: "other", content: {} },
    { identifier: "seguimiento-old", content: { data: { kind: "followup" } } },
  ];
  const now = new Date(2026, 9, 12, 8);
  const clients = [
    { id: "one", name: "Cliente", nextDate: "2026-10-12" },
    { id: "one", name: "Duplicado", nextDate: "2026-10-12" },
    { id: "bad", name: "Inválido", nextDate: "2026-02-31" },
    {
      id: "archived",
      name: "Archivado",
      nextDate: "2026-10-13",
      archived: true,
    },
    { id: "later", name: "Después", nextDate: "2026-11-20" },
  ];
  assert.equal(await push.scheduleFollowUps(clients, now), 1);
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].trigger.date.getHours(), 9);
  await Promise.all([
    push.scheduleFollowUps(clients, now),
    push.scheduleFollowUps(clients, now),
  ]);
  assert.equal(scheduled.length, 2);
  await push.scheduleFollowUps([], now, false);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].identifier, "other");
  console.log(
    "  ✓ Avisos: arranque desde notificación, listeners y seguimientos sin duplicados ni fechas inválidas",
  );
  const updates = require("../src/updates.ts");
  const time = 100000000;
  assert.equal(await updates.checkForUpdates(b, time), false);
  assert.equal(updateChecks, 0);
  U.isEnabled = true;
  await Promise.all([
    updates.checkForUpdates(b, time),
    updates.checkForUpdates(b, time),
  ]);
  assert.equal(updateChecks, 1);
  await updates.checkForUpdates(b, time + updates.UPDATE_INTERVAL - 1);
  assert.equal(updateChecks, 1);
  updateAvailable = true;
  assert.equal(
    await updates.checkForUpdates(b, time + updates.UPDATE_INTERVAL),
    true,
  );
  assert.equal(updateFetches, 1);
  assert.equal(await updates.restartForUpdate(() => false), false);
  assert.equal(reloaded, 0);
  let safe = true;
  assert.equal(
    await updates.restartForUpdate(
      () => safe,
      () => {
        safe = false;
      },
    ),
    false,
  );
  assert.equal(reloaded, 0);
  assert.equal(await updates.restartForUpdate(() => true), true);
  assert.equal(reloaded, 1);
  console.log(
    "  ✓ Updates: una consulta cada 6 h, descarga única y reinicio impedido durante cobro",
  );
  const {
    CameraScanner,
    createScanGate,
    SCAN_TYPES,
  } = require("../src/scanner.tsx");
  let ticks = 0;
  const gate = createScanGate(() => ticks);
  // EAN-13 con verificador: basta una lectura; mientras sigue frente a la cámara no se repite.
  assert.equal(gate.feed("7501234567893"), "7501234567893");
  ticks = 300;
  assert.equal(gate.feed("7501234567893"), "");
  ticks = 1200;
  assert.equal(gate.feed("07501234567893"), "", "UPC/EAN equivalente no cuenta doble");
  ticks = 3000; // salió del cuadro más de 1.5 s y volvió: otra pieza
  assert.equal(gate.feed("7501234567893"), "7501234567893");
  // SKU sin verificador: dos lecturas iguales seguidas.
  assert.equal(gate.feed("NS-VIT-001"), "");
  ticks = 3200;
  assert.equal(gate.feed("NS-VIT-001"), "NS-VIT-001");
  ticks = 3300;
  assert.equal(gate.feed("NS-PRO-002"), "");
  ticks = 4500;
  assert.equal(gate.feed("NS-PRO-002"), "", "lecturas demasiado separadas no confirman");
  ticks = 4700;
  assert.equal(gate.feed("NS-PRO-002"), "NS-PRO-002");
  gate.again();
  ticks = 4800;
  assert.equal(gate.feed("NS-PRO-002"), "", "otra vez: vuelve a pedir confirmación");
  ticks = 4900;
  assert.equal(gate.feed("NS-PRO-002"), "NS-PRO-002");
  assert.equal(SCAN_TYPES.length, 7);
  let scans = 0,
    closed = 0;
  cameraPermission = { granted: false, canAskAgain: true };
  let ui = await mount(
    React.createElement(CameraScanner, {
      visible: true,
      onClose: () => closed++,
      onScan: (code) => {
        scans++;
        return { text: "Agregado " + code };
      },
    }),
  );
  assert.equal(ui.root.findAllByType("CameraView").length, 0);
  await act(async () => {
    ui.root
      .findByProps({ accessibilityLabel: "Permitir cámara" })
      .props.onPress();
    await flush();
  });
  assert.equal(cameraRequests, 1);
  const view = ui.root.findByType("CameraView");
  await act(async () => {
    await view.props.onBarcodeScanned({ data: "7501234567893" });
    await view.props.onBarcodeScanned({ data: "7501234567893" });
    await flush();
  });
  assert.equal(scans, 1, "una lectura inmediata, sin esperar 2.5 s");
  assert.ok(text(ui.toJSON()).includes("Agregado 7501234567893"), "el resultado se ve en el lector");
  await dispose(ui);
  const { ProductGrid } = require("../src/ui.tsx");
  let qty = 0;
  const unknown = [];
  ui = await mount(
    React.createElement(ProductGrid, {
      products: [
        {
          id: "p",
          sku: "GNS-001",
          barcode: "042100005264",
          name: "Proteína",
          price: 50000,
        },
      ],
      qtyOf: () => qty,
      limitOf: () => 2,
      onAdd: () => qty++,
      onRemove: () => qty--,
      onInventoryCode: (code) => unknown.push(code),
      segment: "Todos",
      onSegment: () => {},
    }),
  );
  await act(async () => {
    ui.root
      .findByProps({ accessibilityLabel: "Leer código con cámara" })
      .props.onPress();
    await flush();
  });
  const scanner = ui.root.findByType(CameraScanner);
  const tools = { closed: 0, after: null, updates: [], close(after) { this.closed++; this.after = after; }, update(r) { this.updates.push(r); } };
  const miss = scanner.props.onScan("ABC-999", tools);
  assert.equal(miss.bad, true);
  assert.ok(miss.actions.some((a) => a.label === "Dar de alta o asignar"));
  miss.actions.find((a) => a.label === "Dar de alta o asignar").onPress();
  assert.equal(tools.closed, 1);
  tools.after();
  assert.deepEqual(unknown, ["ABC-999"], "dar de alta abre el formulario después de cerrar el lector");
  // UPC-E leído por la cámara = UPC-A guardado; SKU sin guiones también.
  assert.equal(scanner.props.onScan("04252614", tools).bad, false);
  assert.equal(qty, 1);
  assert.equal(scanner.props.onScan("gns001", tools).text, "Agregado: Proteína");
  assert.equal(qty, 2);
  const full = scanner.props.onScan("042100005264", tools);
  assert.equal(full.bad, true, "sin más existencias no agrega");
  assert.equal(qty, 2);
  await dispose(ui);
  console.log(
    "  ✓ Cámara: lectura inmediata, sin repetir, SKU confirmado, UPC-E/EAN/SKU sin guiones, alta sin encimar ventanas y límite de existencias",
  );
  U.isEnabled = false;
  b.setSetting("appRole", "owner");
  b.setSetting("cloudConfig", null);
  b.setSetting("cloudSession", null);
  b.setSetting("uiSession", { version: 1, page: "Parámetros" });
  const App = require("../App.tsx").default;
  ui = await mount(React.createElement(App));
  assert.ok(text(ui.toJSON()).includes("Avisos en este teléfono"));
  assert.ok(text(ui.toJSON()).includes("Nova Negocio " + require("../src/screens/ownerShared.ts").VERSION));
  await dispose(ui);
  for (const name of names) global.__NOVA_NATIVE[name] = false;
  assert.equal(native.canScan(), false);
  assert.equal(require("../src/secure.ts").secureStore(), null);
  assert.equal(await push.registerPush(b, cloud, true), "unavailable");
  ui = await mount(React.createElement(App));
  assert.ok(text(ui.toJSON()).includes("Ajustes"));
  await dispose(ui);
  console.log(
    "  ✓ Pantalla del dueño, versión 2.2 y compatibilidad con runtime anterior sin módulos nativos",
  );
  sql.close();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
