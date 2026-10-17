const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const expo = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo;
const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
const errors = [];
const pid = expo.extra?.eas?.projectId;
if (!pid || !/^[0-9a-f-]{36}$/i.test(pid)) errors.push("Falta vincular el proyecto de Expo: ejecuta eas init con tu cuenta.");
if (!expo.updates?.url || expo.updates.url !== "https://u.expo.dev/" + pid) errors.push("Falta configurar las actualizaciones: ejecuta eas update:configure.");
if (expo.updates?.checkAutomatically !== "NEVER") errors.push("updates.checkAutomatically debe ser NEVER para controlar el aviso de reinicio.");
// 2.5.3 · En GitHub (CI) no está google-services.json (es privado y no se sube): solo hace falta
// para compilar el APK nativo, no para las actualizaciones por internet (eas update).
const ota = !!process.env.CI || process.argv.includes("--ota");
const services = path.resolve(root, expo.android?.googleServicesFile || "google-services.json");
if (!fs.existsSync(services)) {
  if (!ota) errors.push("Falta google-services.json de tu app Android en Firebase.");
} else {
  try {
    const firebase = JSON.parse(fs.readFileSync(services, "utf8"));
    if (!(firebase.client || []).some(c => c.client_info?.android_client_info?.package_name === "com.novasupps.negocio")) errors.push("google-services.json corresponde a otra app; Firebase debe usar com.novasupps.negocio.");
    if (!firebase.project_info?.project_number) errors.push("google-services.json está incompleto.");
  } catch { errors.push("No se puede leer google-services.json."); }
}
// La versión es la misma en app.json, package.json y la que muestra la app (Ajustes).
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const shown = (fs.readFileSync(path.join(root, "src/screens/ownerShared.ts"), "utf8").match(/export const VERSION = "([^"]+)"/) || [])[1];
if (!/^\d+\.\d+\.\d+$/.test(expo.version || "")) errors.push("app.json debe tener una versión como 2.5.3.");
if (pkg.version !== expo.version || shown !== expo.version) errors.push(`La versión no coincide: app.json ${expo.version}, package.json ${pkg.version}, app ${shown}.`);
if (!Number.isInteger(expo.android?.versionCode) || expo.android.versionCode < 50) errors.push("android.versionCode debe ser un número entero mayor o igual a 50.");
// 2.2.5 en adelante son solo JavaScript (e imágenes de marca) sobre el APK nativo 2.2.4: las actualizaciones (eas update) deben apuntar a ese runtime.
// Al hacer otra compilación nativa, cambia runtimeVersion a la versión nueva.
if (expo.runtimeVersion !== "2.2.4") errors.push("runtimeVersion debe ser \"2.2.4\" (el APK nativo instalado) mientras no haya otra compilación nativa.");
if (eas.cli?.appVersionSource !== "local" || eas.build?.preview?.channel !== "preview") errors.push("eas.json debe usar versiones locales y el canal preview.");
if (errors.length) { errors.forEach(e => console.error("• " + e)); process.exitCode = 1; }
else console.log(ota ? `Configuración lista para publicar ${expo.version} (runtime ${expo.runtimeVersion}, canal preview).` : "Configuración local lista. Verifica también la clave FCM V1 en eas credentials antes de compilar.");
