// 2.6.0 · Firma y archivos privados administrados por Expo (EAS).
// app.json sigue siendo la configuración; aquí solo se toma google-services.json de la
// variable de archivo GOOGLE_SERVICES_JSON de EAS cuando se compila en la nube (el
// archivo es privado y no está en GitHub). En tu PC se sigue usando ./google-services.json.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || config.android.googleServicesFile,
  },
});
