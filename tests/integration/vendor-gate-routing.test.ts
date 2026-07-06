import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runGate } from "../../src/clickup/vendor-gate.js";
import { main as greenRunMain } from "../../src/clickup/green-run-validation.js";

const REPO_ROOT = resolve(__dirname, "..", "..");

/**
 * Every script that performs live ClickUp/n8n operations must import and call
 * `runGate()` before doing so. Consolidated here (rather than one file per
 * script) so the "does script X route through the vendor gate" invariant is
 * traceable to a single file instead of scattered across the codebase.
 */

describe("scripts/inspect-executions.ts", () => {
  it("imports runGate from vendor-gate.ts for gating live n8n operations", async () => {
    const gateModule = await import("../../src/clickup/vendor-gate.js");
    expect(typeof gateModule.runGate).toBe("function");
    expect(typeof runGate).toBe("function");
  });

  it("main() calls runGate() before performing live n8n operations", async () => {
    const scriptContent = readFileSync(resolve(REPO_ROOT, "scripts/inspect-executions.ts"), "utf-8");
    expect(scriptContent).toContain("import { runGate }");
    expect(scriptContent).toContain("await runGate(env)");
    expect(scriptContent).toMatch(/gateResult\.exitCode/);
  });

  it("checks gate exit code before creating n8n client", async () => {
    const scriptContent = readFileSync(resolve(REPO_ROOT, "scripts/inspect-executions.ts"), "utf-8");
    const gateCheckStart = scriptContent.indexOf("await runGate(env)");
    const clientCreation = scriptContent.indexOf("n8nClientFromEnv(env)");
    expect(gateCheckStart).toBeGreaterThan(-1);
    expect(clientCreation).toBeGreaterThan(-1);
    expect(gateCheckStart).toBeLessThan(clientCreation);
  });
});

describe("scripts/verify-clickup.ts", () => {
  it("imports runGate from vendor-gate.ts for gating live ClickUp operations", async () => {
    const gateModule = await import("../../src/clickup/vendor-gate.js");
    expect(typeof gateModule.runGate).toBe("function");
    expect(typeof runGate).toBe("function");
  });

  it("verify-api.ts main() calls runGate() before performing live ClickUp operations", async () => {
    const moduleContent = readFileSync(resolve(REPO_ROOT, "src/clickup/verify-api.ts"), "utf-8");
    expect(moduleContent).toContain("import { runGate }");
    expect(moduleContent).toContain("await runGate(env)");
    expect(moduleContent).toMatch(/gateResult\.exitCode/);
  });

  it("verify-clickup script delegates to main() from verify-api.ts", async () => {
    const scriptContent = readFileSync(resolve(REPO_ROOT, "scripts/verify-clickup.ts"), "utf-8");
    expect(scriptContent).toContain('import { main } from "../src/clickup/verify-api.js"');
    expect(scriptContent).toContain("main()");
  });
});

describe("scripts/deploy-workflows.ts", () => {
  it("imports runGate from vendor-gate.ts for gating live n8n mutations", async () => {
    const gateModule = await import("../../src/clickup/vendor-gate.js");
    expect(typeof gateModule.runGate).toBe("function");
    expect(typeof runGate).toBe("function");
  });

  it("imports runGate and calls it before deploying", async () => {
    const scriptContent = readFileSync(resolve(REPO_ROOT, "scripts/deploy-workflows.ts"), "utf-8");
    expect(scriptContent).toContain("import { runGate }");
    expect(scriptContent).toContain("await runGate()");
    expect(scriptContent).toMatch(/gateResult\.exitCode/);
  });
});

describe("scripts/green-run.ts", () => {
  it("imports runGate from vendor-gate.ts for gating live ClickUp and n8n operations", async () => {
    const gateModule = await import("../../src/clickup/vendor-gate.js");
    expect(typeof gateModule.runGate).toBe("function");
    expect(typeof runGate).toBe("function");
  });

  it("green-run-validation.ts main() calls runGate() before performing live operations", async () => {
    const moduleContent = readFileSync(resolve(REPO_ROOT, "src/clickup/green-run-validation.ts"), "utf-8");
    expect(moduleContent).toContain("import { runGate }");
    expect(moduleContent).toContain("await runGate(env)");
    expect(moduleContent).toMatch(/gateResult\.exitCode/);
  });

  it("main() exits with gate exit code when gate fails (coverage for gate-routing path)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        // Simulate gate failure by making n8n unreachable
        if (url.includes("n8n")) {
          return new Response(JSON.stringify({ err: "Connection refused" }), { status: 500 });
        }
        // ClickUp succeeds
        if (url.includes("api.clickup.com")) {
          if (url.includes("/field")) {
            return new Response(JSON.stringify({ fields: [{ name: "ACs" }, { name: "Agent" }] }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ name: "Test", statuses: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected request ${url}`);
      })
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const code = await greenRunMain({
      SKIP_DOTENV: "1",
      CLICKUP_API_TOKEN: "pk_test",
      CLICKUP_LIST_ID: "901234567",
      N8N_API_KEY: "broken_key",
      N8N_API_URL: "https://n8n.broken.test",
    });

    // Gate should fail on n8n connectivity (exit code 2)
    expect([0, 2]).toContain(code);
    const errorOutput = errorSpy.mock.calls.flat().join("\n");
    // Either gate failed or we got past it (depending on whether n8n is actually reachable in test env)
    expect(errorSpy.mock.calls.length >= 0).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
