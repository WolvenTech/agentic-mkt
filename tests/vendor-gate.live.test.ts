import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRepoDotenv } from "../src/load-env.js";

const REPO_ROOT = resolve(__dirname, "..");

function hasVendorCredentials(): boolean {
  const probe: NodeJS.ProcessEnv = { ...process.env };
  loadRepoDotenv(undefined, probe);
  return Boolean(probe.CLICKUP_API_TOKEN?.trim() && probe.CLICKUP_LIST_ID?.trim() && probe.N8N_API_KEY?.trim());
}

describe.skipIf(!hasVendorCredentials())("vendor gate — live (requires CLICKUP_API_TOKEN, CLICKUP_LIST_ID, N8N_API_KEY)", () => {
  it("pnpm vendor:gate exits 0 with valid credentials", () => {
    const stdout = execFileSync("pnpm", ["run", "vendor:gate"], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });
    expect(stdout).toContain("Gate passed");
  });

  it("includes Call Agent and Marketing Pipeline workflow checks in the gate output", () => {
    const stdout = execFileSync("pnpm", ["run", "vendor:gate"], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });
    expect(stdout).toContain("n8n_call_agent_workflow_present");
    expect(stdout).toContain("n8n_main_workflow_present");
  });
});
