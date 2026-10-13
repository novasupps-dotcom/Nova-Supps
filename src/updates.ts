import type { Business } from "./business";
import { updatesModule } from "./native";

export const UPDATE_INTERVAL = 6 * 3600_000;
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
