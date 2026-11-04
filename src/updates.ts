import type { Business } from "./business";
import { updatesModule } from "./native";

// 2.5.3 · Las versiones nuevas llegan solas (EAS Update, canal "preview") y se aplican solas.
// 2.7.1 · Se buscan más seguido (al abrir, al volver y cada 10 min con la app abierta), se
// avisa con una ventana emergente y una notificación del teléfono, y en Ajustes se puede
// buscar a mano y ver el estado (canal, runtime, versión instalada y último resultado).

/** Mínimo entre dos consultas automáticas (al abrir la app o al volver a ella). */
export const UPDATE_INTERVAL = 5 * 60_000;
/** Con la app abierta, se vuelve a preguntar cada… */
export const POLL_INTERVAL = 10 * 60_000;
/** Si la app estuvo en segundo plano al menos este tiempo, al volver se aplica la versión nueva. */
export const AUTO_APPLY_AFTER_MS = 15 * 60_000;
/** ¿Se aplica ya? Solo con la versión descargada, tras un rato fuera de la app y sin venta ni cobro abiertos. */
export function shouldAutoApply(
  isReady: boolean,
  backgroundSince: number | null,
  now: number,
  canRestart: () => boolean,
): boolean {
  return (
    isReady &&
    backgroundSince !== null &&
    now - backgroundSince >= AUTO_APPLY_AFTER_MS &&
    canRestart()
  );
}

export type ReadyUpdate = { id: string; version: string };
export type UpdateStatus = {
  at: number;
  result: "nueva" | "al-dia" | "error" | "desactivadas";
  detail?: string;
};

let ready: ReadyUpdate | null = null;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(u: ReadyUpdate) => void>();

export function updateIsReady() {
  return ready !== null;
}
export function readyUpdate() {
  return ready;
}
/** Avisa cuando se termina de descargar una versión nueva (para la ventana emergente). */
export function onUpdateReady(cb: (u: ReadyUpdate) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Versión (app.json) que trae una actualización descargada, si la incluye. */
function versionOf(manifest: any): string {
  const v =
    manifest?.extra?.expoClient?.version ??
    manifest?.extra?.expoConfig?.version ??
    manifest?.version ??
    "";
  return typeof v === "string" ? v : "";
}

export async function checkForUpdates(
  b: Business,
  now = Date.now(),
  force = false,
): Promise<boolean> {
  if (ready) return true;
  const U = updatesModule();
  if (!U?.isEnabled || (typeof __DEV__ !== "undefined" && __DEV__)) {
    if (force)
      b.setSetting("updateStatus", {
        at: now,
        result: "desactivadas",
        detail: U ? "Las actualizaciones están apagadas en esta instalación." : "Esta instalación no trae el módulo de actualizaciones.",
      } satisfies UpdateStatus);
    return false;
  }
  if (inflight) return inflight;
  const last = Number(b.setting("updateCheckedAt", 0));
  if (!force && Number.isFinite(last) && now >= last && now - last < UPDATE_INTERVAL)
    return false;
  b.setSetting("updateCheckedAt", now);
  inflight = (async () => {
    let status: UpdateStatus = { at: now, result: "al-dia" };
    try {
      const check = await U.checkForUpdateAsync();
      if (check.isAvailable) {
        const fetched: any = await U.fetchUpdateAsync();
        if (fetched?.isNew === true) {
          const manifest = fetched.manifest ?? (check as any).manifest;
          ready = { id: String(manifest?.id ?? "nueva"), version: versionOf(manifest) };
          status = { at: now, result: "nueva", detail: ready.version };
        }
      }
    } catch (e) {
      // Sin conexión u otro problema: se conserva la versión instalada y se intenta después.
      status = { at: now, result: "error", detail: e instanceof Error ? e.message : String(e) };
    }
    try {
      b.setSetting("updateStatus", status);
    } catch {}
    if (ready) for (const cb of [...listeners]) cb(ready);
    return ready !== null;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function restartForUpdate(
  canRestart: () => boolean,
  beforeRestart?: () => void,
): Promise<boolean> {
  const U = updatesModule();
  if (!ready || !U?.isEnabled || !canRestart()) return false;
  beforeRestart?.();
  if (!canRestart()) return false;
  await U.reloadAsync();
  return true;
}

/** Datos para Ajustes → Actualizaciones (y para diagnosticar si una versión no llega). */
export function updateDiagnostics(): {
  enabled: boolean;
  channel: string;
  runtime: string;
  updateId: string;
  embedded: boolean;
  createdAt: string;
} {
  const U: any = updatesModule();
  const created = U?.createdAt instanceof Date ? U.createdAt : null;
  return {
    enabled: !!U?.isEnabled,
    channel: String(U?.channel ?? ""),
    runtime: String(U?.runtimeVersion ?? ""),
    updateId: String(U?.updateId ?? ""),
    embedded: !!U?.isEmbeddedLaunch,
    createdAt: created && !isNaN(created.getTime()) ? created.toISOString() : "",
  };
}
