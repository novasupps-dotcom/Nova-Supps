// Identificador de este teléfono para la base en línea: cada cuenta queda ligada
// a un solo teléfono. Se crea una vez por instalación y no viaja en los respaldos.
import type { Business } from "./business";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function deviceId(b: Business): string {
  const saved = b.setting("deviceId", null) as string | null;
  if (saved && /^[A-Za-z0-9_-]{16,80}$/.test(saved)) return saved;
  const c: any = (globalThis as any).crypto;
  const bytes = new Uint8Array(24);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const id = "and-" + Date.now().toString(36) + "-" + Array.from(bytes, (x) => ALPHA[x % ALPHA.length]).join("");
  b.setSetting("deviceId", id);
  return id;
}
