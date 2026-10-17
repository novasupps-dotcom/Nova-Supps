// 2.4 · Tipografía Inter: se escribe una vez en la carpeta de la app y se registra con el
// módulo nativo de Expo (ExpoFontLoader). Si algo falla, la app sigue con la letra del
// sistema: nunca bloquea la apertura más de un instante.
import { hasNative } from "./native";

export const FAMILY = {
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  bold: "Inter-Bold",
  display: "InterDisplay-Bold",
} as const;

let ready = false;
/** ¿Ya se registró Inter? (las pruebas lo dejan en false: letra del sistema). */
export const fontsReady = () => ready || !!(globalThis as any).__NOVA_FONTS_READY;

/** Familia de Inter para un peso y tamaño (la versión "Display" en títulos y montos grandes). */
export function familyFor(weight: unknown, size?: number): string {
  const w = weight === "bold" ? 700 : Number(weight) || 400;
  if (w >= 600 && (size ?? 0) >= 26) return FAMILY.display;
  if (w >= 700) return FAMILY.bold;
  if (w >= 600) return FAMILY.semibold;
  if (w >= 500) return FAMILY.medium;
  return FAMILY.regular;
}

/** Espaciado óptico de Inter según el tamaño (más cerrado en títulos, neutro en texto). */
export function trackingFor(size: number): number {
  const em = -0.0223 + 0.185 * Math.exp(-0.1745 * size);
  return Math.round(em * size * 100) / 100;
}

let loading: Promise<boolean> | null = null;
/** Registra Inter. Devuelve true si quedó lista. Máximo `timeoutMs` de espera. */
export function loadFonts(timeoutMs = 1500): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  if (!loading)
    loading = (async () => {
      if (!hasNative("ExpoFontLoader")) return false;
      try {
        const core = require("expo-modules-core");
        const loader = core.requireOptionalNativeModule("ExpoFontLoader");
        const FS = require("expo-file-system/legacy");
        if (!loader?.loadAsync || !FS?.documentDirectory) return false;
        const { FONT_DATA } = require("./fontData");
        // La carpeta cambia si cambian los archivos (así nunca se usa una versión vieja).
        const sizes = Object.values(FONT_DATA as Record<string, string>).reduce((n, x) => n + x.length, 0);
        const dir = `${FS.documentDirectory}fonts-inter-4.1-${sizes}/`;
        const info = await FS.getInfoAsync(dir);
        if (!info.exists) await FS.makeDirectoryAsync(dir, { intermediates: true });
        for (const [name, data] of Object.entries(FONT_DATA as Record<string, string>)) {
          const file = `${dir}${name}.ttf`;
          const have = await FS.getInfoAsync(file);
          if (!have.exists || !have.size) await FS.writeAsStringAsync(file, data, { encoding: "base64" });
          await loader.loadAsync(name, file);
        }
        ready = true;
        return true;
      } catch {
        return false;
      }
    })();
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(ready), timeoutMs);
    void loading!.then((ok) => {
      clearTimeout(timer);
      resolve(ok);
    });
  });
}
/** ¿Este teléfono puede registrar letras? (APK 2.2 o posterior). */
export const canLoadFonts = () => hasNative("ExpoFontLoader");
