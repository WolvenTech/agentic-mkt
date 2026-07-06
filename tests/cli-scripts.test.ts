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
    const callAgentPath = resolve(REPO_ROOT, "integrations/marketing-pipelines/call-agent-subworkflow.json");
    const marketingPipelinePath = resolve(REPO_ROOT, "integrations/marketing-pipelines/marketing-pipeline-main.json");

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

describe("scripts/content-quality-proof.ts — local mode", () => {
  it("runs local proof checks without credentials and outputs JSON", () => {
    const result = runScript(resolve(REPO_ROOT, "scripts/content-quality-proof.ts"), {
      PATH: process.env.PATH ?? "",
      SKIP_DOTENV: "1",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBeDefined();

    // Find the JSON object in the output (comes after the file path line)
    const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
    expect(jsonMatch).toBeTruthy();

    if (jsonMatch) {
      const output = JSON.parse(jsonMatch[0]);
      expect(output).toHaveProperty("mode");
      expect(output.mode).toBe("local");
      expect(output).toHaveProperty("evidence");
      expect(Array.isArray(output.evidence)).toBe(true);
    }
  });

  it("produces evidence with local check results", () => {
    const result = runScript(resolve(REPO_ROOT, "scripts/content-quality-proof.ts"), {
      PATH: process.env.PATH ?? "",
      SKIP_DOTENV: "1",
    });

    expect(result.status).toBe(0);
    const output = result.stdout;
    expect(output).toContain("LOCAL-STATUSES");
    expect(output).toContain("LOCAL-PAGES");
    expect(output).toContain("LOCAL-POINTER-FORMAT");
    expect(output).toContain("LOCAL-BLOCKER-FORMAT");
    expect(output).toContain("LOCAL-STAGES");
    expect(output).toContain("LOCAL-GATES");
  });

  it("writes evidence to logs/content-quality-proof/ directory", () => {
    const logDir = resolve(REPO_ROOT, "logs/content-quality-proof");
    let before: Set<string>;
    try {
      before = new Set(readdirSync(logDir));
    } catch {
      before = new Set();
    }

    runScript(resolve(REPO_ROOT, "scripts/content-quality-proof.ts"), {
      PATH: process.env.PATH ?? "",
      SKIP_DOTENV: "1",
    });

    let after: Set<string>;
    try {
      after = new Set(readdirSync(logDir));
    } catch {
      after = new Set();
    }

    const newFiles = [...after].filter((file) => !before.has(file));

    expect(newFiles.length).toBeGreaterThan(0);

    // Verify output file structure
    for (const file of newFiles) {
      const filePath = resolve(logDir, file);
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty("generated_at");
      expect(parsed).toHaveProperty("mode");
      expect(parsed).toHaveProperty("evidence");
      expect(parsed).toHaveProperty("state");
    }

    // Clean up
    for (const file of newFiles) {
      const filePath = resolve(logDir, file);
      rmSync(filePath, { force: true });
    }
  });

  it("local proof accepts --local flag and produces local-mode output", () => {
    const result = spawnSync(resolve(REPO_ROOT, "node_modules/.bin/tsx"), [resolve(REPO_ROOT, "scripts/content-quality-proof.ts"), "--local"], {
      cwd: REPO_ROOT,
      env: { PATH: process.env.PATH ?? "", SKIP_DOTENV: "1" },
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
    const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
    expect(jsonMatch).toBeTruthy();

    if (jsonMatch) {
      const output = JSON.parse(jsonMatch[0]);
      expect(output.mode).toBe("local");
    }
  });
});
