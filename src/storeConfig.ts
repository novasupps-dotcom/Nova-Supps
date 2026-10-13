// Base en línea de la tienda (Supabase). La clave publishable es pública por
// diseño: solo identifica el proyecto; los permisos los deciden las reglas de la
// base (Row Level Security). Así el vendedor solo escribe su código de invitación.
import type { CloudConfig } from "./cloud";

const STORE: CloudConfig = {
  url: "https://vsoasdonmmhixicayunv.supabase.co",
  anonKey: "sb_publishable_s1OGuHeBMQMYGL0MwONi9Q_mbhNiAzv",
};
/** Las pruebas pueden sustituirla con globalThis.__STORE_CLOUD. */
export const storeCloud = (): CloudConfig => ((globalThis as any).__STORE_CLOUD as CloudConfig) || STORE;
