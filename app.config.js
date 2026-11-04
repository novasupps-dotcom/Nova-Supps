// 2.6.0 · Firma y archivos privados administrados por Expo (EAS).
// app.json sigue siendo la configuración; aquí solo se toma google-services.json de la
// variable de archivo GOOGLE_SERVICES_JSON de EAS cuando se compila en la nube (el
// archivo es privado y no está en GitHub). En tu PC se sigue usando ./google-services.json.
// 2.7.1 · Al publicar una actualización desde GitHub el archivo no existe: se omite para que
// Expo pueda leer la configuración y la actualización lleve su número de versión.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const file = process.env.GOOGLE_SERVICES_JSON || config.android?.googleServicesFile;
  const android = { ...config.android };
  if (file && fs.existsSync(path.resolve(__dirname, file))) android.googleServicesFile = file;
  else delete android.googleServicesFile;
  return { ...config, android };
};
