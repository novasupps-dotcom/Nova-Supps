// Las pruebas unitarias importan el código de la app tal cual (sin extensión .ts),
// igual que lo hace Metro. Este gancho completa la extensión al resolver.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith("file:")) {
      for (const ext of [".ts", ".tsx"]) {
        const url = new URL(specifier + ext, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, context);
      }
    }
    return next(specifier, context);
  },
});
