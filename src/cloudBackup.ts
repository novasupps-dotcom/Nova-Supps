// 2.1 · Respaldo automático en la nube (solo el dueño, desde su teléfono registrado).
// Una copia comprimida (gzip) del respaldo completo —con fotos—, partida en pedazos
// en la base en línea. Se verifica con SHA-256 al restaurar. Se conservan las últimas.
import { gzipSync, gunzipSync, strFromU8, strToU8 } from "fflate";
import type { Business } from "./business";
import type { Cloud } from "./cloud";
import { base64ToBytes, bytesToBase64, inlinePhotos } from "./photos";
import { sha256Hex } from "./sha256";

export const PART_CHARS = 600_000;
export const KEEP_BACKUPS = 10;
const DAY_MS = 20 * 3600_000;
export type CloudBackup = { id: string; created_at: string; bytes: number; parts: number; sha256: string; app_version: string; device: string };

/** Base en línea sin las tablas del respaldo (schema anterior a 2.1): mensaje claro. */
export const NEEDS_SCHEMA = "Tu base en línea aún no tiene el respaldo en la nube: en Supabase vuelve a ejecutar supabase/schema.sql (2.1).";
const explain = (e: unknown): unknown => {
  const err = e as { status?: number; code?: string; message?: string };
  return err?.status === 404 || err?.code === "PGRST205" || err?.code === "42P01" || /owner_backup/.test(String(err?.message || "")) ? new Error(NEEDS_SCHEMA) : e;
};
/** Si el último intento falló, se reintenta después de unas horas (no en cada sincronización). */
const RETRY_MS = 3 * 3600_000;

const uuid = () => {
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${"89ab"[Math.floor(Math.random() * 4)]}${s.slice(17, 20)}-${s.slice(20, 32)}`;
};

/** Sube un respaldo nuevo y borra los más viejos. Devuelve el respaldo creado. */
export async function uploadBackup(b: Business, cloud: Cloud, appVersion: string, device = ""): Promise<CloudBackup> {
  const json = await inlinePhotos(b.backup());
  const gz = gzipSync(strToU8(json), { level: 6 });
  const b64 = bytesToBase64(gz);
  const parts: string[] = [];
  for (let i = 0; i < b64.length; i += PART_CHARS) parts.push(b64.slice(i, i + PART_CHARS));
  const row: CloudBackup = { id: uuid(), created_at: new Date().toISOString(), bytes: gz.length, parts: parts.length, sha256: sha256Hex(gz), app_version: appVersion, device: device.slice(0, 80) };
  try {
    await cloud.insert("owner_backups", { id: row.id, bytes: row.bytes, parts: row.parts, sha256: row.sha256, app_version: row.app_version, device: row.device, complete: false });
  } catch (e) {
    throw explain(e);
  }
  for (let i = 0; i < parts.length; i++) await cloud.insert("owner_backup_parts", { backup_id: row.id, part: i, data: parts[i] }, false, true);
  await cloud.update("owner_backups", `id=eq.${row.id}`, { complete: true });
  try {
    await cloud.rpc("prune_owner_backups", { p_keep: KEEP_BACKUPS });
  } catch {}
  b.setSetting("cloudBackupLast", { at: row.created_at, bytes: row.bytes, id: row.id });
  return row;
}

/** Respaldos completos, del más reciente al más antiguo. */
export async function listBackups(cloud: Cloud): Promise<CloudBackup[]> {
  let rows: unknown;
  try {
    rows = await cloud.select("owner_backups", "select=id,created_at,bytes,parts,sha256,app_version,device&complete=eq.true&order=created_at.desc");
  } catch (e) {
    throw explain(e);
  }
  return Array.isArray(rows) ? (rows as CloudBackup[]) : [];
}

/** Descarga y verifica un respaldo; devuelve el texto JSON listo para `restore`. */
export async function downloadBackup(cloud: Cloud, backup: CloudBackup): Promise<string> {
  const rows = await cloud.select("owner_backup_parts", `select=part,data&backup_id=eq.${backup.id}&order=part.asc`);
  const list: { part: number; data: string }[] = Array.isArray(rows) ? rows : [];
  if (list.length !== backup.parts || list.some((r, i) => r.part !== i)) throw new Error("El respaldo en la nube está incompleto. Elige otro.");
  const gz = base64ToBytes(list.map((r) => r.data).join(""));
  if (sha256Hex(gz) !== backup.sha256) throw new Error("El respaldo en la nube no pasó la verificación (está dañado). Elige otro.");
  return strFromU8(gunzipSync(gz));
}

/** ¿Toca respaldar? (activado y sin respaldo en las últimas ~20 horas). */
export function backupDue(b: Business, now = Date.now()): boolean {
  if (b.setting("cloudBackupAuto", true) === false) return false;
  const failed = b.setting("cloudBackupError", null) as { at?: string } | null;
  const failedAt = failed?.at ? Date.parse(failed.at) : NaN;
  if (Number.isFinite(failedAt) && now - failedAt < RETRY_MS) return false;
  const last = b.setting("cloudBackupLast", null) as { at?: string } | null;
  const at = last?.at ? Date.parse(last.at) : 0;
  return !Number.isFinite(at) || now - at > DAY_MS;
}
