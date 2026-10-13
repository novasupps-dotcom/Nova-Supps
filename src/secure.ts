// Cada escritura usa piezas nuevas y publica un índice al terminar: una falla
// conserva el valor anterior en Android Keystore / llavero de iOS.
import type { SecretStore } from "./business";
import { secureStoreModule } from "./native";

const CHUNK_BYTES = 1800;
const safe = (key: string) => "nova." + key.replace(/[^A-Za-z0-9._-]/g, "_");
type Storage = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  deleteItemAsync?(k: string): Promise<void>;
};
type Index = { generation: string; count: number };
let sequence = 0;

export function secretChunks(value: string): string[] {
  const result: string[] = [];
  let chunk = "",
    bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    const size = code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    if (bytes + size > CHUNK_BYTES) {
      result.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += char;
    bytes += size;
  }
  result.push(chunk);
  return result;
}

/** Envuelve un almacén con API síncrona getItem/setItem (expo-secure-store o uno de prueba). */
export function chunkedStore(S: Storage): SecretStore {
  const index = (key: string): Index | null => {
    const raw = S.getItem(safe(key) + ".index");
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (
      !/^[A-Za-z0-9_-]+$/.test(parsed.generation) ||
      !Number.isInteger(parsed.count) ||
      parsed.count < 0 ||
      parsed.count > 1000
    )
      throw new Error("El almacén seguro contiene un índice inválido.");
    return parsed;
  };
  const legacyCount = (key: string) => {
    const n = Number(S.getItem(safe(key) + ".n") || 0);
    return Number.isInteger(n) && n > 0 && n <= 1000 ? n : 0;
  };
  const remove = (key: string) => {
    void S.deleteItemAsync?.(key)?.catch(() => {});
  };
  return {
    get(key) {
      const current = index(key);
      const n = current ? current.count : legacyCount(key);
      if (!n) return null;
      let out = "";
      for (let i = 0; i < n; i++) {
        const part = S.getItem(
          current
            ? `${safe(key)}.${current.generation}.${i}`
            : `${safe(key)}.${i}`,
        );
        if (part == null)
          throw new Error(
            "No se pudo leer la sesión del almacén seguro. Vuelve a abrir la app.",
          );
        out += part;
      }
      return out;
    },
    set(key, value) {
      const previous = index(key);
      const old = previous ? previous.count : legacyCount(key);
      const parts = value == null ? [] : secretChunks(value);
      if (parts.length > 1000) throw new Error("Credencial demasiado grande.");
      const generation = `${Date.now().toString(36)}_${(++sequence).toString(36)}`;
      try {
        parts.forEach((p, i) =>
          S.setItem(`${safe(key)}.${generation}.${i}`, p),
        );
        S.setItem(
          safe(key) + ".index",
          JSON.stringify({ generation, count: parts.length }),
        );
      } catch (error) {
        parts.forEach((_, i) => remove(`${safe(key)}.${generation}.${i}`));
        throw error;
      }
      for (let i = 0; i < old; i++)
        remove(
          previous
            ? `${safe(key)}.${previous.generation}.${i}`
            : `${safe(key)}.${i}`,
        );
      if (!previous) remove(safe(key) + ".n");
    },
  };
}

/** null solo cuando el APK todavía no incluye el módulo nativo. */
export function secureStore(): SecretStore | null {
  const S = secureStoreModule();
  if (!S || typeof S.getItem !== "function" || typeof S.setItem !== "function")
    return null;
  try {
    const store = chunkedStore(S);
    store.set("probe", "ok");
    if (store.get("probe") !== "ok") throw new Error("Lectura no confirmada");
    store.set("probe", null);
    return store;
  } catch {
    throw new Error(
      "No se pudo abrir el almacén seguro de este teléfono. Desbloquea el teléfono y vuelve a abrir Nova Negocio.",
    );
  }
}
