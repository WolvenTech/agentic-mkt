import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..");

const IO_CONTRACT_PATH = resolve(REPO_ROOT, "agents", "harness", "io-contract.md");
const GREEN_RUN_EVIDENCE_PATH = resolve(REPO_ROOT, "agents", "harness", "green-run-evidence.json");

const DOMAIN_READMES = {
  n8n: resolve(REPO_ROOT, "n8n", "README.md"),
  clickup: resolve(REPO_ROOT, "clickup", "README.md"),
  "marketing-pipelines": resolve(REPO_ROOT, "marketing-pipelines", "README.md"),
  agents: resolve(REPO_ROOT, "agents", "README.md"),
} as const;

const PLACEHOLDER_PATTERNS = ["<TBD>", "YOUR_", "EXAMPLE_", "placeholder", "TODO:", "abc123"];

const NAMED_PATTERNS = [
  "Sub-workflow Contract Pattern",
  "Status Flow Pattern",
  "Brief Gate Pattern",
  "GitHub Runtime Config Pattern",
];

const PRD_F5_REQUIREMENTS = [
  "input/output contract",
  "workflow sequence",
  "troubleshooting",
  "reusable harness patterns",
  "green run evidence",
  "skill copy",
  "sync script",
  "adr-005",
];

// Grep-tested READMEs only — `agents/harness/io-contract.md`, `.env.example`, and
// `webhook-contract.md` still document the coexisting Python tooling by design
// (root README's "coexists until task 13" section) and are out of scope here;
// task_12 owns the full python3 -> pnpm command rewrite across docs.
const PYTHON_COMMAND_GREP_PATHS: Record<string, string> = {
  "README.md": resolve(REPO_ROOT, "README.md"),
  "n8n/README.md": resolve(REPO_ROOT, "n8n", "README.md"),
  "clickup/README.md": resolve(REPO_ROOT, "clickup", "README.md"),
  "agents/harness/README.md": resolve(REPO_ROOT, "agents", "harness", "README.md"),
};

const PYTHON_COMMAND_PATTERNS = [/\bpython3\b/, /\.py\b/];

function loadText(path: string): string {
  return readFileSync(path, "utf-8");
}

function loadEvidence(): {
  validation_status: string;
  main_workflow: {
    verified: boolean;
    n8n_execution_id: string;
    clickup_task_url: string;
    latency_seconds: number | null;
    status_path: string[];
  };
} {
  return JSON.parse(readFileSync(GREEN_RUN_EVIDENCE_PATH, "utf-8"));
}

describe("green-run evidence cross-references", () => {
  const contract = loadText(IO_CONTRACT_PATH);
  const evidence = loadEvidence();
  const main = evidence.main_workflow;

  it("main_workflow has the required evidence fields", () => {
    for (const key of ["n8n_execution_id", "clickup_task_url", "latency_seconds", "status_path"]) {
      expect(main).toHaveProperty(key);
    }
  });

  it("documents the execution ID once a run has passed and verified", () => {
    if (evidence.validation_status !== "passed" || !main.verified) {
      expect(contract.toLowerCase()).toContain("validation_status");
      return;
    }
    expect(main.n8n_execution_id).toBeTruthy();
    expect(contract).toContain(main.n8n_execution_id);
    for (const placeholder of PLACEHOLDER_PATTERNS) {
      expect(main.n8n_execution_id).not.toContain(placeholder);
    }
  });

  it("documents the ClickUp task URL once a run has passed and verified", () => {
    if (evidence.validation_status !== "passed" || !main.verified) {
      expect(contract).toContain("green-run-evidence.json");
      return;
    }
    expect(main.clickup_task_url.startsWith("https://app.clickup.com/")).toBe(true);
    expect(contract).toContain(main.clickup_task_url);
    for (const placeholder of PLACEHOLDER_PATTERNS) {
      expect(main.clickup_task_url).not.toContain(placeholder);
    }
  });

  it("documents observed latency under the M1 target once a run has passed and verified", () => {
    if (evidence.validation_status !== "passed" || !main.verified) {
      expect(contract.toLowerCase()).toContain("latency");
      return;
    }
    expect(main.latency_seconds).not.toBeNull();
    expect(contract).toContain(String(main.latency_seconds));
    expect(main.latency_seconds).toBeLessThanOrEqual(60);
  });
});

describe("troubleshooting", () => {
  const contract = loadText(IO_CONTRACT_PATH).toLowerCase();

  it("has a Troubleshooting section", () => {
    expect(contract).toContain("## troubleshooting");
  });

  it("documents webhook-not-reaching-n8n diagnostics", () => {
    expect(contract).toContain("webhook not reaching n8n");
    for (const step of [
      "active",
      "webhook url",
      "clickup webhook",
      "listen for test event",
      "task-status-updated-ready-to-work.json",
    ]) {
      expect(contract).toContain(step);
    }
  });

  it("documents task-stuck-in-In-Progress diagnostics", () => {
    expect(contract).toContain("task stuck in in progress");
    for (const step of ["n8n → executions", "execute call agent", "status → review"]) {
      expect(contract).toContain(step);
    }
  });

  it("documents OpenAI JSON parse-failure diagnostics", () => {
    expect(contract).toContain("openai json parse failures");
    for (const step of ["error envelope", "raw_response", "parse_success", "agent parse failure"]) {
      expect(contract).toContain(step);
    }
  });

  it("documents field-ID mismatch diagnostics", () => {
    expect(contract).toContain("field id mismatches");
    for (const step of ["field-mapping.json", "sync-field-mapping.py", "<tbd>"]) {
      expect(contract).toContain(step);
    }
  });
});

describe("reusable harness patterns", () => {
  const contract = loadText(IO_CONTRACT_PATH);

  it("documents at least three named patterns", () => {
    const found = NAMED_PATTERNS.filter((name) => contract.includes(name));
    expect(found.length).toBeGreaterThanOrEqual(3);
  });

  it("gives each pattern a When-to-use and Artifact reference", () => {
    for (const name of NAMED_PATTERNS.slice(0, 3)) {
      expect(contract).toContain(name);
      const idx = contract.indexOf(name);
      const section = contract.slice(idx, idx + 800).toLowerCase();
      expect(section).toContain("when to use");
      expect(section).toContain("artifact");
    }
  });
});

describe("domain READMEs", () => {
  it("each domain README has an M2 operational runbook section", () => {
    for (const [domain, path] of Object.entries(DOMAIN_READMES)) {
      const lower = loadText(path).toLowerCase();
      const hasM2 = lower.includes("m2 operational runbook") || lower.includes("m2 section");
      expect(hasM2, `${domain}/README.md missing M2 operational runbook section`).toBe(true);
    }
  });

  it("n8n README documents the workflow re-import procedure", () => {
    const readme = loadText(DOMAIN_READMES.n8n).toLowerCase();
    for (const step of [
      "import call agent sub-workflow",
      "import and activate marketing pipeline",
      "register clickup webhook",
      "call-agent-subworkflow.json",
      "marketing-pipeline-main.json",
    ]) {
      expect(readme).toContain(step);
    }
  });

  it("agents README documents skill copy and drift risk", () => {
    const readme = loadText(DOMAIN_READMES.agents).toLowerCase();
    for (const topic of ["skill-vault", "drift risk", "sync script", "adr-005"]) {
      expect(readme).toContain(topic);
    }
  });
});

describe("PRD F5 coverage", () => {
  it("covers at least 80% of PRD F5 documentation requirements", () => {
    let combined = loadText(IO_CONTRACT_PATH);
    for (const path of Object.values(DOMAIN_READMES)) {
      combined += `\n${loadText(path)}`;
    }
    combined = combined.toLowerCase();
    const matched = PRD_F5_REQUIREMENTS.filter((req) => combined.includes(req)).length;
    const coverage = matched / PRD_F5_REQUIREMENTS.length;
    expect(coverage).toBeGreaterThanOrEqual(0.8);
  });
});

describe("troubleshooting simulated webhook walkthrough", () => {
  const contract = loadText(IO_CONTRACT_PATH);
  const n8nReadme = loadText(DOMAIN_READMES.n8n);

  it("references the simulated-failure fixture and replay step", () => {
    expect(contract).toContain("task-status-updated-ready-to-work.json");
    expect(contract.toLowerCase()).toContain("listen for test event");
  });

  it("n8n README cross-links the webhook replay test to the troubleshooting doc", () => {
    const lower = n8nReadme.toLowerCase();
    expect(lower).toContain("webhook replay test");
    expect(n8nReadme).toContain("io-contract.md");
  });
});

describe("no stale Python command references in committed READMEs", () => {
  for (const [label, path] of Object.entries(PYTHON_COMMAND_GREP_PATHS)) {
    it(`${label} has no python3 or .py command references`, () => {
      const content = loadText(path);
      const matches = PYTHON_COMMAND_PATTERNS.flatMap(
        (pattern) => content.match(new RegExp(pattern, "g")) ?? []
      );
      expect(matches, `${label} still references: ${matches.join(", ")}`).toEqual([]);
    });
  }
});
