#!/usr/bin/env node
// 2.10.7 · Generador de respaldo ejecutable de Base de Datos + Configuración Realtime (respaldo_bd_realtime.json)
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");

for (const ext of [".ts", ".tsx"]) {
  require.extensions[ext] = (m, file) =>
    m._compile(
      ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      file,
    );
}

const { Business, productBrand } = require("../src/business.ts");

function createMemoryDb() {
  const sql = new DatabaseSync(":memory:");
  return {
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
}

const b = require("../tests/seed.cjs")(createMemoryDb());

// Aseguramos que cada producto tenga su marca explícita registrada en su ficha para filtros por marca
for (const p of b.stock()) {
  const br = productBrand(p);
  if (br) {
    const prev = b.setting("product:" + p.id, {});
    if (!prev.brand) b.setSetting("product:" + p.id, { ...prev, brand: br });
  }
}

// Registramos metadatos de sincronización Realtime en settings
const nowIso = new Date().toISOString();
b.setSetting("lastBackupAt", nowIso);
b.setSetting("realtimeBackupMeta", {
  version: "2.10.7",
  generatedAt: nowIso,
  engine: "gauss-jordan-rref",
  publication: "supabase_realtime",
  tables: ["catalog", "sales", "customers", "config", "seller_closings", "members", "realtime_backups"],
  rpc: "save_realtime_snapshot",
});

const rawBackup = b.backup();
const parsed = JSON.parse(rawBackup);
parsed.realtime = {
  publication: "supabase_realtime",
  tables: ["catalog", "sales", "customers", "config", "seller_closings", "members", "realtime_backups"],
  sqlFile: "supabase/realtime_y_respaldo.sql",
  rpc: "public.save_realtime_snapshot(p_payload, p_version)",
  generatedAt: nowIso,
  version: "2.10.7",
};

const finalJson = JSON.stringify(parsed, null, 2);

// Verificamos que el respaldo sea 100% restaurable por Business.restore()
const verifyDb = new Business(createMemoryDb());
verifyDb.restore(finalJson);

const outPath = path.join(__dirname, "../respaldo_bd_realtime.json");
fs.writeFileSync(outPath, finalJson.replace(/\n/g, "\r\n"), "utf8");
console.log(
  `✓ Respaldo BD + Realtime generado y verificado en: respaldo_bd_realtime.json (${verifyDb.stock().length} productos, ${verifyDb.accounts().length} cuentas)`,
);
