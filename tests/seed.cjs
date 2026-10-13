// Datos de prueba: la app 1.2 ya NO trae datos del negocio dentro del APK.
// Las pruebas de pantalla cargan aquí los mismos datos que antes traía el APK.
const fs = require("fs"), path = require("path");
module.exports = function seed(db) {
  const { Business } = require("../src/business.ts");
  const { applyRelease08 } = require("./fixtures/releaseUpdate.ts");
  const { initialize, mergeCatalogueUpdate } = require("./fixtures/legacyImport.ts");
  const b = new Business(db);
  const read = (f) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
  if (!initialize(b, read("initialData.json"))) mergeCatalogueUpdate(b, read("updateData.json"));
  applyRelease08(b, JSON.parse(read("release08.json")));
  // Los datos de prueba ya traen precios sin comisión (1.9): no hay nada que restaurar.
  b.setSetting("pricing", { mode: "precio+comisión", at: "2026-10-07T00:00:00.000Z", changed: { products: {}, bundles: {} } });
  return b;
};
