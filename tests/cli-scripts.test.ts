import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RUN_LOG_ROOT } from "../src/clickup/green-run-validation.js";

const REPO_ROOT = resolve(__dirname, "..");
const TSX_BIN = resolve(REPO_ROOT, "node_modules/.bin/tsx");

function runScript(scriptPath: string, env: NodeJS.ProcessEnv): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(TSX_BIN, [scriptPath], {
    cwd: REPO_ROOT,
    env,
    encoding: "utf-8",
  });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

function listRunDirs(): Set<string> {
  try {
    return new Set(readdirSync(RUN_LOG_ROOT));
  } catch {
    return new Set();
  }
}

describe("scripts/sync-field-mapping.ts — offline subprocess", () => {
  it("exits non-zero with no env and mentions the token in stderr", () => {
    const result = runScript(resolve(REPO_ROOT, "scripts/sync-field-mapping.ts"), {
      PATH: process.env.PATH ?? "",
      SKIP_DOTENV: "1",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("CLICKUP_API_TOKEN");
  });
});

describe("scripts/verify-clickup.ts — offline subprocess", () => {
  it("exits non-zero with no env and mentions the token in stderr", () => {
    const result = runScript(resolve(REPO_ROOT, "scripts/verify-clickup.ts"), {
      PATH: process.env.PATH ?? "",
      SKIP_DOTENV: "1",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("CLICKUP_API_TOKEN");
  });
});

describe("scripts/green-run.ts — offline subprocess", () => {
  it("exits 2 with no token and writes evidence under logs/green-run/", () => {
    const before = listRunDirs();

    const result = runScript(resolve(REPO_ROOT, "scripts/green-run.ts"), {
      PATH: process.env.PATH ?? "",
      SKIP_DOTENV: "1",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("CLICKUP_API_TOKEN");

    const after = listRunDirs();
    const newDirs = [...after].filter((dir) => !before.has(dir));
    expect(newDirs.length).toBeGreaterThan(0);

    const evidencePath = resolve(RUN_LOG_ROOT, newDirs[0] as string, "evidence.json");
    expect(existsSync(evidencePath)).toBe(true);

    for (const dir of newDirs) {
      rmSync(resolve(RUN_LOG_ROOT, dir), { recursive: true, force: true });
    }
  });
});

describe("scripts/inspect-executions.ts — offline subprocess", () => {
  it("exits non-zero with no env and mentions N8N_API_KEY in stderr", () => {
    const result = runScript(resolve(REPO_ROOT, "scripts/inspect-executions.ts"), {
      PATH: process.env.PATH ?? "",
      SKIP_DOTENV: "1",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("N8N_API_KEY");
  });
});

describe("scripts/build-workflows.ts — offline subprocess", () => {
  it("exits 0 and writes both workflow JSON files", () => {
    const callAgentPath = resolve(REPO_ROOT, "n8n/workflows/call-agent-subworkflow.json");
    const marketingPipelinePath = resolve(REPO_ROOT, "n8n/workflows/marketing-pipeline-main.json");

    const result = runScript(resolve(REPO_ROOT, "scripts/build-workflows.ts"), {
      PATH: process.env.PATH ?? "",
      SKIP_DOTENV: "1",
    });

    expect(result.status).toBe(0);

    const callAgentWorkflow = JSON.parse(readFileSync(callAgentPath, "utf-8")) as { name: string };
    const marketingPipelineWorkflow = JSON.parse(readFileSync(marketingPipelinePath, "utf-8")) as { name: string };
    expect(callAgentWorkflow.name).toBe("Call Agent");
    expect(marketingPipelineWorkflow.name).toBe("Marketing Pipeline");
  });
});

describe("pnpm test:live — gate enforcement", () => {
  it("does not reach Vitest when vendor:gate fails (no credentials)", () => {
    const result = spawnSync("pnpm", ["run", "test:live"], {
      cwd: REPO_ROOT,
      env: { PATH: process.env.PATH ?? "", SKIP_DOTENV: "1" },
      encoding: "utf-8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("Vendor connectivity gate");
    expect(result.stdout + result.stderr).not.toContain("RUN  v");
  });
});
