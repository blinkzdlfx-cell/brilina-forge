import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repoRoot, "web", "dist");
const target = path.join(repoRoot, "dist", "web");

await rm(target, { recursive: true, force: true });
await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true });

const indexPath = path.join(target, "index.html");
const index = await readFile(indexPath, "utf8");
const assetRefs = [...index.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(match => match[1])
  .filter(ref => ref.startsWith("/") && !ref.startsWith("//"));

const missing = [];
for (const ref of assetRefs) {
  const relative = ref.replace(/^\/+/, "");
  try {
    await readFile(path.join(target, relative));
  } catch {
    missing.push(ref);
  }
}

if (missing.length) {
  throw new Error(`Frontend build references missing packaged assets: ${missing.join(", ")}`);
}

for (const required of ["index.html", "favicon.svg"]) {
  try {
    await readFile(path.join(target, required));
  } catch {
    throw new Error(`Frontend package is missing required file: ${required}`);
  }
}

console.log(`Packaged frontend: ${source} -> ${target}`);
console.log(`Verified ${assetRefs.length} generated asset references and favicon.svg`);
