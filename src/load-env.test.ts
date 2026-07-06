import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRepoDotenv } from "./load-env.js";

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

function writeEnvFile(contents: string): string {
  tmpDir = mkdtempSync(join(tmpdir(), "agentic-mkt-load-env-"));
  const envPath = join(tmpDir, ".env");
  writeFileSync(envPath, contents, "utf-8");
  return envPath;
}

describe("loadRepoDotenv", () => {
  it("skips loading when SKIP_DOTENV is set", () => {
    const envPath = writeEnvFile("CLICKUP_API_TOKEN=from_file\n");
    const env: NodeJS.ProcessEnv = { SKIP_DOTENV: "1" };
    expect(loadRepoDotenv(envPath, env)).toBe(false);
    expect(env.CLICKUP_API_TOKEN).toBeUndefined();
  });

  it("returns false when the file does not exist", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(loadRepoDotenv("/nonexistent/path/.env", env)).toBe(false);
  });

  it("parses keys, skips comments/blank lines, and strips export/quotes", () => {
    const envPath = writeEnvFile(
      [
        "# a comment",
        "",
        "CLICKUP_API_TOKEN=pk_test",
        "export N8N_API_KEY=n8n_key",
        'QUOTED="hello world"',
        "SINGLE_QUOTED='single value'",
        "NO_EQUALS_SIGN_LINE",
        "",
      ].join("\n")
    );
    const env: NodeJS.ProcessEnv = {};
    expect(loadRepoDotenv(envPath, env)).toBe(true);
    expect(env.CLICKUP_API_TOKEN).toBe("pk_test");
    expect(env.N8N_API_KEY).toBe("n8n_key");
    expect(env.QUOTED).toBe("hello world");
    expect(env.SINGLE_QUOTED).toBe("single value");
    expect(env.NO_EQUALS_SIGN_LINE).toBeUndefined();
  });

  it("does not override variables already present in the target env", () => {
    const envPath = writeEnvFile("CLICKUP_API_TOKEN=from_file\n");
    const env: NodeJS.ProcessEnv = { CLICKUP_API_TOKEN: "from_shell" };
    loadRepoDotenv(envPath, env);
    expect(env.CLICKUP_API_TOKEN).toBe("from_shell");
  });
});
