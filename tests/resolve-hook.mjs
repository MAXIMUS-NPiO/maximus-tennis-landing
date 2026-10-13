/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  // Next's framework entry points are CommonJS files without an exports map; the middleware imports them bare.
  if (specifier === "next/server") return next("next/server.js", context);
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL && !/\.[cm]?js$|\.json$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const candidate of [`${base.href}.js`, `${base.href}/index.js`]) {
      const p = fileURLToPath(candidate);
      if (existsSync(p) && statSync(p).isFile()) return next(candidate, context);
    }
  }
  return next(specifier, context);
}
