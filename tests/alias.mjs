// Maps the "@/..." tsconfig path alias for `node --test`, which resolves
// modules itself and does not read tsconfig.json. Test-only: the Next.js
// build resolves the same alias through tsconfig.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = pathToFileURL(`${process.cwd()}/src/`).href;

register(
  `data:text/javascript,
   const ROOT = ${JSON.stringify(root)};
   const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
   export async function resolve(specifier, context, next) {
     if (!specifier.startsWith("@/")) return next(specifier, context);
     const base = ROOT + specifier.slice(2);
     const { existsSync } = await import("node:fs");
     const { fileURLToPath } = await import("node:url");
     for (const ext of CANDIDATES) {
       const url = base + ext;
       if (ext && existsSync(fileURLToPath(url))) return next(url, context);
     }
     return next(base, context);
   }`,
  import.meta.url,
);

void existsSync;
void fileURLToPath;
