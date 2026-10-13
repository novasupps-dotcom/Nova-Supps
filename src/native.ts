// 2.2 · Funciones nativas opcionales: cámara (lector de códigos), avisos, almacenamiento
// seguro y actualizaciones sin reinstalar. El mismo JS corre en el APK anterior (que no
// trae estos módulos) y en la compilación nueva: cada módulo se carga solo si el teléfono
// lo tiene, y nunca al importar este archivo.
import type * as NotificationsT from "expo-notifications";
import type * as SecureStoreT from "expo-secure-store";
import type * as UpdatesT from "expo-updates";
import type * as CameraT from "expo-camera";

const cache = new Map<string, boolean>();
/** ¿El teléfono trae este módulo nativo? (las pruebas lo fijan con globalThis.__NOVA_NATIVE). */
export function hasNative(name: string): boolean {
  const forced = (globalThis as any).__NOVA_NATIVE;
  if (forced && name in forced) return !!forced[name];
  if (!cache.has(name)) {
    let ok = false;
    try {
      const core = require("expo-modules-core");
      ok = typeof core?.requireOptionalNativeModule === "function" && !!core.requireOptionalNativeModule(name);
    } catch {}
    cache.set(name, ok);
  }
  return cache.get(name)!;
}

export const canScan = () => hasNative("ExpoCamera");
export const canNotify = () => hasNative("ExpoNotificationScheduler") && hasNative("ExpoNotificationPermissionsModule");
export const canPush = () => canNotify() && hasNative("ExpoPushTokenManager");
export const canSecure = () => hasNative("ExpoSecureStore");
export const canUpdate = () => hasNative("ExpoUpdates");

function load<T>(ok: boolean, get: () => T): T | null {
  if (!ok) return null;
  try {
    return get() ?? null;
  } catch {
    return null;
  }
}
export const notifications = () => load<typeof NotificationsT>(canNotify(), () => require("expo-notifications"));
export const secureStoreModule = () => load<typeof SecureStoreT>(canSecure(), () => require("expo-secure-store"));
export const updatesModule = () => load<typeof UpdatesT>(canUpdate(), () => require("expo-updates"));
export const cameraModule = () => load<typeof CameraT>(canScan(), () => require("expo-camera"));

/** Proyecto de EAS (lo agrega `eas init` a app.json). Sin él no hay avisos push ni actualizaciones. */
export function projectId(): string | null {
  try {
    const C = require("expo-constants");
    const c = C?.default ?? C;
    const id = c?.expoConfig?.extra?.eas?.projectId ?? c?.easConfig?.projectId ?? null;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}
