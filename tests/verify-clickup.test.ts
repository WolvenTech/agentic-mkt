import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runGate } from "../src/clickup/vendor-gate.js";

const REPO_ROOT = resolve(__dirname, "..");

describe("gate routing (task_16)", () => {
  it("imports runGate from vendor-gate.ts for gating live ClickUp operations", async () => {
    const gateModule = await import("../src/clickup/vendor-gate.js");
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
