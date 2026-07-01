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
  it("each domain README has an operational runbook section", () => {
    for (const [domain, path] of Object.entries(DOMAIN_READMES)) {
      const lower = loadText(path).toLowerCase();
      const hasRunbook = lower.includes("operational runbook") || lower.includes("m2 operational runbook");
      expect(hasRunbook, `${domain}/README.md missing operational runbook section`).toBe(true);
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

describe("staged ClickUp workflow documentation (task_02)", () => {
  const listSchema = loadText(resolve(REPO_ROOT, "clickup", "list-schema.md"));
  const clickupReadme = loadText(DOMAIN_READMES.clickup);
  const marketingPipelinesReadme = loadText(DOMAIN_READMES["marketing-pipelines"]);
  const n8nReadme = loadText(DOMAIN_READMES.n8n);

  describe("staged status names in documentation", () => {
    const requiredStatuses = [
      "backlog",
      "investigate",
      "brief review",
      "brief_review",
      "write",
      "content review",
      "content_review",
      "format",
      "final review",
      "final_review",
      "publish",
      "closed",
    ];

    it("list-schema.md documents all staged status names", () => {
      const lower = listSchema.toLowerCase();
      for (const status of requiredStatuses) {
        expect(lower, `list-schema.md should mention "${status}"`).toContain(status);
      }
    });

    it("no longer describes ready/writing/approval as the current workflow in primary docs", () => {
      // List schema should not describe ready/writing/approval as the flow
      const schemaLower = listSchema.toLowerCase();
      const hasPrimaryFlow = schemaLower.includes("primary workflow") &&
        (schemaLower.includes("ready") || schemaLower.includes("writing") || schemaLower.includes("approval"));
      expect(hasPrimaryFlow, "list-schema.md should not describe ready/writing/approval as primary").toBe(false);

      // ClickUp README should not describe ready/writing/approval as the current workflow
      const clickupLower = clickupReadme.toLowerCase();
      const clickupHasOldFlow =
        (clickupLower.includes("backlog → ready") || clickupLower.includes("ready → writing")) &&
        !clickupLower.includes("backlog → investigate");
      expect(clickupHasOldFlow, "clickup/README.md should not describe the old ready/writing flow").toBe(false);
    });
  });

  describe("comment vs Doc responsibilities", () => {
    it("list-schema.md explains that comments instruct and Doc stores artifacts", () => {
      const lower = listSchema.toLowerCase();
      expect(lower).toContain("comments instruct");
      expect(lower).toContain("doc stores");
      expect(lower).toContain("artifact");
    });

    it("clickup/README.md documents comment-vs-Doc guidance", () => {
      const lower = clickupReadme.toLowerCase();
      expect(lower).toContain("comments instruct");
      expect(lower).toContain("doc");
      expect(lower).toContain("artifact");
      expect(lower).toContain("free-form");
    });

    it("marketing-pipelines/README.md references the artifact-first model", () => {
      const lower = marketingPipelinesReadme.toLowerCase();
      expect(lower).toContain("artifact");
      expect(lower).toContain("doc");
      expect(lower).toContain("comment");
    });
  });

  describe("rework and blocker behavior", () => {
    it("list-schema.md documents manual rework behavior (moving back re-runs only that stage)", () => {
      const lower = listSchema.toLowerCase();
      expect(lower).toContain("rework");
      expect(lower).toContain("moving");
      expect(lower).toContain("back");
      expect(lower).toContain("stage");
    });

    it("list-schema.md documents blocker behavior and return to previous gate", () => {
      const lower = listSchema.toLowerCase();
      expect(lower).toContain("blocker");
      expect(lower).toContain("previous");
      expect(lower).toContain("gate");
    });

    it("clickup/README.md documents blocker flow in operational runbook", () => {
      const lower = clickupReadme.toLowerCase();
      expect(lower).toContain("blocker");
      expect(lower).toContain("question");
      expect(lower).toContain("comment");
    });

    it("clickup/README.md flags that downstream artifacts are preserved until manually re-run", () => {
      const lower = clickupReadme.toLowerCase();
      expect(lower).toContain("downstream");
      expect(lower).toContain("preserved");
      expect(lower).toContain("re-run");
    });
  });

  describe("user can infer workflow behavior from docs", () => {
    it("documents the complete trigger flow (how to start a stage)", () => {
      const combined = `${listSchema}\n${clickupReadme}\n${marketingPipelinesReadme}`.toLowerCase();
      expect(combined).toContain("move");
      expect(combined).toContain("trigger");
      expect(combined).toContain("stage");
    });

    it("documents approval flow (how stages advance)", () => {
      const combined = `${listSchema}\n${clickupReadme}`.toLowerCase();
      expect(combined).toContain("auto-advance");
      expect(combined).toContain("advance");
      expect(combined).toContain("brief review");
      expect(combined).toContain("content review");
      expect(combined).toContain("final review");
    });

    it("documents when and how to rework (moving back to earlier stages)", () => {
      const combined = `${listSchema}\n${clickupReadme}`.toLowerCase();
      expect(combined).toContain("move back");
      expect(combined).toContain("investigate");
      expect(combined).toContain("write");
      expect(combined).toContain("format");
    });

    it("documents the ClickUp Doc as the artifact storage and where to find stage outputs", () => {
      const combined = `${clickupReadme}\n${marketingPipelinesReadme}`.toLowerCase();
      expect(combined).toContain("doc");
      expect(combined).toContain("brief");
      expect(combined).toContain("argument");
      expect(combined).toContain("final draft");
    });
  });
});
