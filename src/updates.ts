import type { Business } from "./business";
import { updatesModule } from "./native";

// 2.5.3 · Las versiones nuevas llegan solas (EAS Update, canal "preview") y se aplican solas.
/** Cada cuánto se pregunta si hay versión nueva (al abrir la app o al volver a ella). */
export const UPDATE_INTERVAL = 30 * 60_000;
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
let ready = false;
let inflight: Promise<boolean> | null = null;
export function updateIsReady() {
  return ready;
}
export async function checkForUpdates(
  b: Business,
  now = Date.now(),
): Promise<boolean> {
  if (ready) return true;
  const U = updatesModule();
  if (!U?.isEnabled || (typeof __DEV__ !== "undefined" && __DEV__))
    return false;
  if (inflight) return inflight;
  const last = Number(b.setting("updateCheckedAt", 0));
  if (Number.isFinite(last) && now >= last && now - last < UPDATE_INTERVAL)
    return false;
  b.setSetting("updateCheckedAt", now);
  inflight = (async () => {
    try {
      if ((await U.checkForUpdateAsync()).isAvailable)
        ready = (await U.fetchUpdateAsync()).isNew === true;
    } catch {
      /* Sin conexión: se conserva la versión instalada. */
    }
    return ready;
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
