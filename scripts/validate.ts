import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadRepoDotenv, REPO_ROOT } from "../src/load-env.js";

function runPnpmScript(script: string): number {
  const result = spawnSync("pnpm", [script], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

function hasVendorEnv(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.CLICKUP_API_TOKEN?.trim() && env.CLICKUP_LIST_ID?.trim() && env.N8N_API_KEY?.trim()
  );
}

loadRepoDotenv();

const testCode = runPnpmScript("test");
if (testCode !== 0) {
  process.exit(testCode);
}

const checkCode = runPnpmScript("build:workflows:check");
if (checkCode !== 0) {
  process.exit(checkCode);
}

if (hasVendorEnv(process.env)) {
  const gateCode = runPnpmScript("vendor:gate");
  process.exit(gateCode);
}

console.log("Validate passed (vendor gate skipped — set CLICKUP_API_TOKEN, CLICKUP_LIST_ID, and N8N_API_KEY to include it).");
process.exit(0);
