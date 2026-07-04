import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runGate } from "../src/clickup/vendor-gate.js";

const REPO_ROOT = resolve(__dirname, "..");

describe("gate routing (task_16)", () => {
  it("imports runGate from vendor-gate.ts for gating live n8n operations", async () => {
    const gateModule = await import("../src/clickup/vendor-gate.js");
    expect(typeof gateModule.runGate).toBe("function");
    expect(typeof runGate).toBe("function");
  });

  it("inspect-executions.ts main() calls runGate() before performing live n8n operations", async () => {
    const scriptContent = readFileSync(resolve(REPO_ROOT, "scripts/inspect-executions.ts"), "utf-8");
    expect(scriptContent).toContain("import { runGate }");
    expect(scriptContent).toContain("await runGate(env)");
    expect(scriptContent).toMatch(/gateResult\.exitCode/);
  });

  it("inspect-executions main() checks gate exit code before creating n8n client", async () => {
    const scriptContent = readFileSync(resolve(REPO_ROOT, "scripts/inspect-executions.ts"), "utf-8");
    // Verify the gate check occurs before n8nClientFromEnv
    const gateCheckStart = scriptContent.indexOf("await runGate(env)");
    const clientCreation = scriptContent.indexOf("n8nClientFromEnv(env)");
    expect(gateCheckStart).toBeGreaterThan(-1);
    expect(clientCreation).toBeGreaterThan(-1);
    expect(gateCheckStart).toBeLessThan(clientCreation);
  });
});
