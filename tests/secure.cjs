const fs = require("node:fs"),
  ts = require("typescript"),
  assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
require.extensions[".ts"] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    f,
  );
const { chunkedStore, secretChunks } = require("../src/secure.ts"),
  { Business } = require("../src/business.ts");
const data = new Map();
let failAt = Infinity,
  writes = 0;
const storage = {
  getItem: (k) => data.get(k) ?? null,
  setItem: (k, v) => {
    if (++writes === failAt) throw Error("synthetic failure");
    data.set(k, v);
  },
  deleteItemAsync: async (k) => {
    data.delete(k);
  },
};
const store = chunkedStore(storage);
const large = "á🔔東京".repeat(1300);
assert.ok(
  secretChunks(large).every((s) => Buffer.byteLength(s, "utf8") <= 1800),
);
store.set("session", large);
assert.equal(store.get("session"), large);
for (const n of [1, 2, 3, secretChunks(large + large).length + 1]) {
  writes = 0;
  failAt = n;
  assert.throws(() => store.set("session", large + large), /synthetic failure/);
  assert.equal(
    store.get("session"),
    large,
    "escritura parcial conserva credencial anterior",
  );
}
failAt = Infinity;
store.set("session", "small");
assert.equal(store.get("session"), "small");
store.set("session", null);
assert.equal(store.get("session"), null);
data.set("nova.legacy.n", "2");
data.set("nova.legacy.0", "old");
data.set("nova.legacy.1", "-value");
assert.equal(store.get("legacy"), "old-value");
store.set("legacy", "new");
assert.equal(store.get("legacy"), "new");
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
const b = new Business(db);
b.setSetting("cloudSession", {
  user: { id: "synthetic" },
  access_token: "test-session",
});
b.setSetting("mpConfig", { token: "test-mp", terminalId: "test-terminal" });
b.secrets = store;
b.migrateSecrets();
assert.equal(b.setting("cloudSession").access_token, "test-session");
assert.equal(b.setting("mpConfig").terminalId, "test-terminal");
assert.equal(
  db.getFirstSync(
    "select count(*) n from settings where key in ('cloudSession','mpConfig')",
  ).n,
  0,
);
b.setSetting("pushToken", { token: "test-push" });
b.setSetting("pushOff", true);
b.setSetting("pushAsked", true);
const backup = b.backup();
assert.ok(
  !backup.includes("test-session") &&
    !backup.includes("test-mp") &&
    !backup.includes("test-push"),
);
b.restore(backup);
assert.equal(b.setting("pushToken").token, "test-push");
assert.equal(b.setting("cloudSession").access_token, "test-session");
writes = 0;
failAt = 1;
assert.throws(
  () => b.setSetting("mpConfig", { token: "should-not-save" }),
  /synthetic failure/,
);
assert.equal(b.setting("mpConfig").token, "test-mp");
assert.equal(
  db.getFirstSync("select count(*) n from settings where key='mpConfig'").n,
  0,
);
failAt = Infinity;
b.setSetting("cloudSession", null);
assert.equal(b.setting("cloudSession"), null);
sql.close();
console.log(
  "  ✓ SecureStore: Unicode, escritura atómica, migración sin perder credenciales, cierre de sesión y respaldo sin secretos ni tokens",
);
