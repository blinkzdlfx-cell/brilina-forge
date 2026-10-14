import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

async function collectTests(directory) {
  const tests = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return tests;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      tests.push(...await collectTests(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      tests.push(fullPath);
    }
  }
  return tests;
}

const files = (await Promise.all(["src", "worker"].map(collectTests))).flat().sort();
if (files.length === 0) {
  console.error("No TypeScript test files found under src/ or worker/.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit"
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
