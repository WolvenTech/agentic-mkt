import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TSX_BIN = resolve(REPO_ROOT, "node_modules/.bin/tsx");
const GATE_SCRIPT = resolve(REPO_ROOT, "scripts/vendor-gate.ts");

function runGateSubprocess(env: NodeJS.ProcessEnv): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(TSX_BIN, [GATE_SCRIPT], {
    cwd: REPO_ROOT,
    env,
    encoding: "utf-8",
  });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe("vendor gate — offline subprocess (env checks)", () => {
  it("exits 1 when CLICKUP_API_TOKEN is unset and does not leak .env (SKIP_DOTENV=1)", () => {
    const env = { PATH: process.env.PATH ?? "", SKIP_DOTENV: "1" };
    const result = runGateSubprocess(env);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("CLICKUP_API_TOKEN unset");
  });

  it("exits 1 when N8N_API_KEY is unset", () => {
    const env = {
      PATH: process.env.PATH ?? "",
      SKIP_DOTENV: "1",
      CLICKUP_API_TOKEN: "pk_test",
      CLICKUP_LIST_ID: "123",
    };
    const result = runGateSubprocess(env);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("N8N_API_KEY unset");
  });

  it("continues with exit 0 in VENDOR_GATE_STRICT=0 warn-only mode despite missing env (local dev)", () => {
    const env = { PATH: process.env.PATH ?? "", SKIP_DOTENV: "1", VENDOR_GATE_STRICT: "0" };
    const result = runGateSubprocess(env);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("warn-only mode");
  });

  it("rejects VENDOR_GATE_STRICT=0 bypass in CI=true context", () => {
    const env = {
      PATH: process.env.PATH ?? "",
      SKIP_DOTENV: "1",
      VENDOR_GATE_STRICT: "0",
      CI: "true",
    };
    const result = runGateSubprocess(env);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("CLICKUP_API_TOKEN unset");
    expect(result.stderr).not.toContain("warn-only mode");
  });

  it("allows VENDOR_GATE_STRICT=0 bypass when CI=false", () => {
    const env = {
      PATH: process.env.PATH ?? "",
      SKIP_DOTENV: "1",
      VENDOR_GATE_STRICT: "0",
      CI: "false",
    };
    const result = runGateSubprocess(env);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("warn-only mode");
  });
});

describe("test:live wiring", () => {
  it("does not invoke vitest when the vendor:gate subprocess fails", () => {
    const env = { PATH: process.env.PATH ?? "", SKIP_DOTENV: "1" };
    const result = spawnSync("pnpm", ["run", "test:live"], {
      cwd: REPO_ROOT,
      env,
      encoding: "utf-8",
      timeout: 60_000,
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Vendor connectivity gate");
    expect(result.stdout).not.toContain("RUN  v");
    expect(result.stdout).not.toContain("Test Files");
  }, 60_000);
});
