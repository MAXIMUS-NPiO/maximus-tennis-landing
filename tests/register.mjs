// Test-only resolver: the application uses extensionless relative imports (Next.js convention).
import { register } from "node:module";
register("./resolve-hook.mjs", import.meta.url);
