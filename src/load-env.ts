import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DOTENV_PATH = resolve(REPO_ROOT, ".env");

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").toLowerCase());
}

function unquote(value: string): string {
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === "'" || value[0] === '"')) {
    return value.slice(1, -1);
  }
  return value;
}

/** Parse repo-root `.env` and set vars not already present. Set SKIP_DOTENV=1 to skip (offline tests). */
export function loadRepoDotenv(path: string = DOTENV_PATH, env: NodeJS.ProcessEnv = process.env): boolean {
  if (isTruthy(env.SKIP_DOTENV)) {
    return false;
  }
  if (!existsSync(path)) {
    return false;
  }

  for (const rawLine of readFileSync(path, "utf-8").split("\n")) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("export ")) {
      line = line.slice("export ".length).trim();
    }
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    if (!key || key in env) {
      continue;
    }
    env[key] = unquote(line.slice(eqIndex + 1).trim());
  }

  return true;
}
