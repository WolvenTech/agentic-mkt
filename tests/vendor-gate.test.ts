import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main, runGate } from "../src/clickup/vendor-gate.js";

const REPO_ROOT = resolve(__dirname, "..");
const TSX_BIN = resolve(REPO_ROOT, "node_modules/.bin/tsx");
const GATE_SCRIPT = resolve(REPO_ROOT, "scripts/vendor-gate.ts");

const VALID_ENV = {
  CLICKUP_API_TOKEN: "pk_test_token",
  CLICKUP_LIST_ID: "123",
  N8N_API_KEY: "n8n_test_key",
  N8N_API_URL: "https://n8n.example.test",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function runGateSubprocess(env: NodeJS.ProcessEnv): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(TSX_BIN, [GATE_SCRIPT], {
    cwd: REPO_ROOT,
    env,
    encoding: "utf-8",
  });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("continues with exit 0 in VENDOR_GATE_STRICT=0 warn-only mode despite missing env", () => {
    const env = { PATH: process.env.PATH ?? "", SKIP_DOTENV: "1", VENDOR_GATE_STRICT: "0" };
    const result = runGateSubprocess(env);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("warn-only mode");
  });
});

describe("vendor gate — runGate (mocked fetch)", () => {
  it("returns exit 2 with clickup_list_reachable FAIL on a mocked ClickUp 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          return jsonResponse({ err: "Unauthorized" }, 401);
        }
        return jsonResponse({ data: [] }, 200);
      })
    );

    const { checks, exitCode } = await runGate(VALID_ENV);
    expect(exitCode).toBe(2);
    const listCheck = checks.find((c) => c.name === "clickup_list_reachable");
    expect(listCheck?.passed).toBe(false);
    expect(listCheck?.detail).toContain("HTTP 401");
  });

  it("returns exit 2 with n8n_api_reachable FAIL on a mocked n8n 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({
              fields: [{ name: "Critérios de Aceite" }, { name: "agent_id" }, { name: "revision_count" }],
            });
          }
          return jsonResponse({ name: "Marketing Pipeline" });
        }
        return jsonResponse({ err: "Unauthorized" }, 401);
      })
    );

    const { checks, exitCode } = await runGate(VALID_ENV);
    expect(exitCode).toBe(2);
    const n8nCheck = checks.find((c) => c.name === "n8n_api_reachable");
    expect(n8nCheck?.passed).toBe(false);
    expect(n8nCheck?.detail).toContain("HTTP 401");
    expect(checks.find((c) => c.name === "n8n_call_agent_workflow_present")?.passed).toBe(false);
    expect(checks.find((c) => c.name === "n8n_main_workflow_present")?.passed).toBe(false);
  });

  it("returns exit 0 with all checks PASS on mocked success responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({
              fields: [{ name: "Critérios de Aceite" }, { name: "agent_id" }, { name: "revision_count" }],
            });
          }
          return jsonResponse({ name: "Marketing Pipeline" });
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline" }] });
      })
    );

    const { checks, exitCode } = await runGate(VALID_ENV);
    expect(exitCode).toBe(0);
    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it("does not run live checks when an env var is missing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { exitCode } = await runGate({ CLICKUP_API_TOKEN: "pk_test" });
    expect(exitCode).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a connection failure when fetch rejects (vendor unreachable)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );

    const { checks, exitCode } = await runGate(VALID_ENV);
    expect(exitCode).toBe(2);
    expect(checks.find((c) => c.name === "clickup_list_reachable")?.detail).toContain("connection failed");
    expect(checks.find((c) => c.name === "n8n_api_reachable")?.detail).toContain("connection failed");
  });
});

describe("vendor gate — main() CLI report (mocked fetch, isolated env)", () => {
  it("returns 1 and prints blockers when required env vars are missing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await main({ SKIP_DOTENV: "1" });
    expect(code).toBe(1);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("FAIL");
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Blockers:");
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Set CLICKUP_API_TOKEN");
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("returns 0 in warn-only mode when VENDOR_GATE_STRICT=0 despite missing env vars", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await main({ SKIP_DOTENV: "1", VENDOR_GATE_STRICT: "0" });
    expect(code).toBe(0);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("warn-only mode");
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("returns 0 and prints 'Gate passed' on mocked success responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return jsonResponse({
              fields: [{ name: "Critérios de Aceite" }, { name: "agent_id" }, { name: "revision_count" }],
            });
          }
          return jsonResponse({ name: "Marketing Pipeline" });
        }
        return jsonResponse({ data: [{ name: "Call Agent" }, { name: "Marketing Pipeline" }] });
      })
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const code = await main({ ...VALID_ENV, SKIP_DOTENV: "1" });
    expect(code).toBe(0);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("Gate passed");
    logSpy.mockRestore();
  });

  it("returns 2 and prints a connectivity blocker on mocked vendor failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ err: "Unauthorized" }, 401))
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const code = await main({ ...VALID_ENV, SKIP_DOTENV: "1" });
    expect(code).toBe(2);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("Fix vendor connectivity");
    logSpy.mockRestore();
    errorSpy.mockRestore();
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
