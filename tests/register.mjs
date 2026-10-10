/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
// Test-only resolver: the application uses extensionless relative imports (Next.js convention).
import { register } from "node:module";
register("./resolve-hook.mjs", import.meta.url);
