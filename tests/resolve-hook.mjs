import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL && !/\.[cm]?js$|\.json$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const candidate of [`${base.href}.js`, `${base.href}/index.js`]) {
      const p = fileURLToPath(candidate);
      if (existsSync(p) && statSync(p).isFile()) return next(candidate, context);
    }
  }
  return next(specifier, context);
}
