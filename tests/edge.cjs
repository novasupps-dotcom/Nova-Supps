// Ejecuta en Node las pruebas existentes de Deno con sus datos sintéticos.
const cases = [];
globalThis.Deno = { test: (name, run) => cases.push({ name, run }) };
(async () => {
  await import("../supabase/functions/cobro-terminal/index_test.ts");
  for (const { name, run } of cases) { await run(); console.log("  ✓ Función: " + name); }
  console.log("Función cobro-terminal: " + cases.length + " pruebas correctas.");
})().catch(error => { console.error(error); process.exitCode = 1; });
