// Un mismo comando para PowerShell, cmd y Linux.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const unit = fs.readdirSync(path.join(root, "tests")).filter(f => f.endsWith(".test.ts")).map(f => path.join("tests", f));
const suites = ["ui", "forms", "team", "lock", "charge", "cloud", "photos", "receipt", "v17", "screens", "iosphoto", "terminalnormal", "v21", "secure", "v22", "sql22"];
const runs = [["--experimental-strip-types", "--test", ...unit], ...suites.map(s => ["tests/" + s + ".cjs"])];
for (const args of runs) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
}
const python = process.env.NOVA_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3");
const edge = spawnSync(process.execPath, ["--experimental-strip-types", "tests/edge.cjs"], { cwd: root, stdio: "inherit" });
if (edge.error) { console.error(edge.error.message); process.exit(1); }
if (edge.status !== 0) process.exit(edge.status || 1);
const signing = spawnSync(python, ["tests/resign_apk.py"], { cwd: root, stdio: "inherit" });
if (signing.error) { console.error(signing.error.message); process.exit(1); }
if (signing.status !== 0) process.exit(signing.status || 1);
console.log("Todas las pruebas terminaron correctamente.");
