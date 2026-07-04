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

const ROOT_README = resolve(REPO_ROOT, "README.md");
const WORKFLOW_DOCS = {
  root: ROOT_README,
  "marketing-pipelines": DOMAIN_READMES["marketing-pipelines"],
};

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
  "adr-003",
];

// Committed docs should not mention the retired python3/.py command path.
const PYTHON_COMMAND_GREP_PATHS: Record<string, string> = {
  "README.md": resolve(REPO_ROOT, "README.md"),
  "n8n/README.md": resolve(REPO_ROOT, "n8n", "README.md"),
  "clickup/README.md": resolve(REPO_ROOT, "clickup", "README.md"),
  "agents/harness/README.md": resolve(REPO_ROOT, "agents", "harness", "README.md"),
  "agents/harness/io-contract.md": resolve(REPO_ROOT, "agents", "harness", "io-contract.md"),
  "clickup/webhook-contract.md": resolve(REPO_ROOT, "clickup", "webhook-contract.md"),
};

const PYTHON_COMMAND_PATTERNS = [/\bpython3\b/, /\.py\b/];

function loadText(path: string): string {
  return readFileSync(path, "utf-8");
}

interface GreenRunEvidence {
  validation_status: string;
  main_workflow: {
    verified: boolean;
    n8n_execution_id: string;
    clickup_task_url: string;
    latency_seconds: number | null;
    status_path: string[];
  };
}

/** green-run-evidence.json is gitignored (local-only, never committed) — absent is the normal CI/fresh-clone state. */
function loadEvidence(): GreenRunEvidence | undefined {
  try {
    return JSON.parse(readFileSync(GREEN_RUN_EVIDENCE_PATH, "utf-8"));
  } catch {
    return undefined;
  }
}

describe("green-run evidence cross-references", () => {
  const contract = loadText(IO_CONTRACT_PATH);
  const evidence = loadEvidence();
  const main = evidence?.main_workflow;

  it("main_workflow has the required evidence fields when a local evidence file is present", () => {
    if (!main) return;
    for (const key of ["n8n_execution_id", "clickup_task_url", "latency_seconds", "status_path"]) {
      expect(main).toHaveProperty(key);
    }
  });

  it("documents the execution ID once a run has passed and verified", () => {
    if (!evidence || evidence.validation_status !== "passed" || !main?.verified) {
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
    if (!evidence || evidence.validation_status !== "passed" || !main?.verified) {
      expect(contract).toContain("green-run-evidence.json");
      return;
    }
    expect(main.clickup_task_url.startsWith("https://app.clickup.com/")).toBe(true);
    expect(contract).toContain(main.clickup_task_url);
    for (const placeholder of PLACEHOLDER_PATTERNS) {
      expect(main.clickup_task_url).not.toContain(placeholder);
    }
  });

  it("documents observed latency once a run has passed and verified", () => {
    if (!evidence || evidence.validation_status !== "passed" || !main?.verified) {
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
      "field-mapping.json",
    ]) {
      expect(contract).toContain(step);
    }
  });

  it("documents task-stuck-with-agent-working diagnostics", () => {
    expect(contract).toContain("task stuck with agent-working");
    for (const step of ["n8n → executions", "add agent-working", "collect task comments", "execute call agent"]) {
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
    for (const step of ["field-mapping.json", "pnpm clickup:sync", "pnpm clickup:verify", "<tbd>"]) {
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
    for (const topic of ["skill-vault", "drift risk", "sync script", "adr-003"]) {
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
    expect(contract.toLowerCase()).toContain("listen for test event");
    expect(n8nReadme.toLowerCase()).toContain("webhook replay test");
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

describe("Code node source ownership documentation", () => {
  const rootReadme = loadText(ROOT_README);
  const marketingPipelineReadme = loadText(WORKFLOW_DOCS["marketing-pipelines"]);

  it("documents that Code node .js files are the only source of truth", () => {
    const sources = [rootReadme, marketingPipelineReadme].join("\n").toLowerCase();
    expect(sources).toContain("source of truth");
    expect(sources).toContain("code-nodes");
    expect(sources).toContain(".js");
  });

  it("documents that TypeScript builders own workflow topology and non-Code-node parameters", () => {
    expect(rootReadme.toLowerCase()).toContain("workflow topology");
    expect(rootReadme.toLowerCase()).toContain("node ids");
    expect(rootReadme.toLowerCase()).toContain("typescript");
  });

  it("documents the path pattern for Code node source files", () => {
    expect(rootReadme).toContain("src/workflows/<workflow-slug>/code-nodes/<node-slug>.js");
  });

  it("states that generated workflow JSON must not be hand-edited", () => {
    const combined = [rootReadme, marketingPipelineReadme].join("\n").toLowerCase();
    expect(combined).toContain("hand-edit");
    expect(combined).toContain("json");
  });

  it("documents the edit-regenerate-verify workflow for Code node changes", () => {
    const instructions = rootReadme.toLowerCase();
    expect(instructions).toContain("pnpm lint:code-nodes");
    expect(instructions).toContain("pnpm test");
    expect(instructions).toContain("pnpm build:workflows");
    expect(instructions).toContain("pnpm build:workflows:check");
  });

  it("documents token placeholder expectations", () => {
    const docs = [rootReadme, marketingPipelineReadme].join("\n").toLowerCase();
    expect(docs).toContain("placeholder");
    expect(docs).toContain("token");
    expect(docs).toContain("build-time");
  });

  it("documents n8n runtime globals available in Code node files", () => {
    const globals = rootReadme.toLowerCase();
    expect(globals).toContain("$input");
    expect(globals).toContain("$json");
    expect(globals).toContain("$execution");
    expect(globals).toContain("$getworkflowstaticdata");
  });
});

describe("workflow command references", () => {
  const rootReadme = loadText(ROOT_README);
  const commonCommands = [
    "pnpm test",
    "pnpm lint:code-nodes",
    "pnpm build:workflows",
    "pnpm build:workflows:check",
  ];

  for (const command of commonCommands) {
    it(`root README documents ${command}`, () => {
      expect(rootReadme).toContain(command);
    });
  }
});

describe("live proof and rollout readiness (task_22–23)", () => {
  const listSchema = loadText(resolve(REPO_ROOT, "clickup", "list-schema.md"));
  const n8nReadme = loadText(DOMAIN_READMES.n8n);

  describe("production status is documented", () => {
    it("list-schema.md has a Production Status section", () => {
      const lower = listSchema.toLowerCase();
      expect(lower).toContain("production status");
    });

    it("list-schema.md states the staged workflow is live and passed validation", () => {
      const lower = listSchema.toLowerCase();
      expect(lower).toContain("live");
      expect(lower).toContain("passed live validation");
    });

    it("list-schema.md references the live validation runbook", () => {
      expect(listSchema).toContain("LIVE-PROOF-RUNBOOK.md");
    });
  });
});

describe("staged-only rollout documentation (task_31)", () => {
  const webhookContract = loadText(resolve(REPO_ROOT, "clickup", "webhook-contract.md"));
  const ioContract = loadText(resolve(REPO_ROOT, "agents", "harness", "io-contract.md"));
  const n8nReadme = loadText(DOMAIN_READMES.n8n);
  const listSchema = loadText(resolve(REPO_ROOT, "clickup", "list-schema.md"));

  describe("no stale old-flow references in production sections", () => {
    it("webhook-contract.md describes staged ingress (investigate/write/format) not ready/needs review", () => {
      const lower = webhookContract.toLowerCase();
      // Should mention staged statuses in ingress section
      const ingresSection = webhookContract.slice(webhookContract.indexOf("## Ingress filters"), webhookContract.indexOf("## Self-echo"));
      expect(ingresSection.toLowerCase()).toContain("investigate");
      expect(ingresSection.toLowerCase()).toContain("write");
      expect(ingresSection.toLowerCase()).toContain("format");
      // Should not describe old ingress as current flow
      expect(lower).not.toContain("first-draft ingress");
      expect(lower).not.toContain("revision ingress");
    });

    it("n8n/README.md webhook path uses staged-ingress not ready-to-work", () => {
      expect(n8nReadme).toContain("marketing-pipeline-staged-ingress");
      expect(n8nReadme).not.toContain("marketing-pipeline-ready-to-work");
    });

    it("io-contract.md Live ClickUp status section documents staged flow only", () => {
      const lower = ioContract.toLowerCase();
      expect(lower).toContain("investigate");
      expect(lower).toContain("brief_review");
      expect(lower).toContain("write");
      expect(lower).toContain("format");
      // Old statuses should not be in the primary flow table
      const statusesSection = ioContract.slice(ioContract.indexOf("## Live ClickUp status"), ioContract.indexOf("## M1 green run") || ioContract.length);
      expect(statusesSection.toLowerCase()).not.toMatch(/^ready\s*\|/m);
      expect(statusesSection.toLowerCase()).not.toMatch(/^needs review\s*\|/m);
    });
  });

  describe("activity tag documentation (ADR-008)", () => {
    it("io-contract.md documents agent-working and agent-blocked tags", () => {
      expect(ioContract.toLowerCase()).toContain("agent-working");
      expect(ioContract.toLowerCase()).toContain("agent-blocked");
      expect(ioContract.toLowerCase()).toContain("activity tag");
    });

    it("io-contract.md explains when tags are set and cleared", () => {
      const lower = ioContract.toLowerCase();
      expect(lower).toContain("set when");
      expect(lower).toContain("cleared when");
      expect(lower).toContain("blocker");
    });

    it("n8n README documents activity tags in main workflow test procedure", () => {
      expect(n8nReadme.toLowerCase()).toContain("agent-working");
      expect(n8nReadme.toLowerCase()).toContain("tag");
    });

    it("LIVE-PROOF-RUNBOOK.md includes activity tag reference", () => {
      const runbook = loadText(resolve(REPO_ROOT, "agents", "harness", "LIVE-PROOF-RUNBOOK.md"));
      expect(runbook.toLowerCase()).toContain("activity tag");
      expect(runbook.toLowerCase()).toContain("agent-working");
    });
  });

  describe("proof exit-code contract documentation (ADR-010)", () => {
    it("io-contract.md documents proof and green-run exit codes", () => {
      expect(ioContract).toContain("Exit-code meanings");
      expect(ioContract).toContain("Proof and green-run exit-code contract");
      expect(ioContract).toContain("| **0** |");
      expect(ioContract).toContain("| **2** |");
      expect(ioContract).toContain("| **3** |");
    });

    it("io-contract.md documents that exit 3 means ready but unverified (not success)", () => {
      expect(ioContract).toContain("Ready but unverified");
      expect(ioContract).toContain("not");
      expect(ioContract).toContain("success");
    });

    it("io-contract.md failure output includes concrete remediation steps", () => {
      const lower = ioContract.toLowerCase();
      expect(lower).toContain("failure output");
      expect(lower).toContain("remediation");
      expect(lower).toContain("check id");
    });

    it("LIVE-PROOF-RUNBOOK.md documents exit codes and when to use them", () => {
      const runbook = loadText(resolve(REPO_ROOT, "agents", "harness", "LIVE-PROOF-RUNBOOK.md"));
      const lower = runbook.toLowerCase();
      expect(lower).toContain("exit code");
      expect(lower).toContain("green_run_execute");
    });
  });

  describe("staged webhook path documented where operators need it", () => {
    it("webhook-contract.md references staged ingress in ingress filters section", () => {
      expect(webhookContract.toLowerCase()).toContain("investigate");
      expect(webhookContract.toLowerCase()).toContain("write");
      expect(webhookContract.toLowerCase()).toContain("format");
    });

    it("io-contract.md troubleshooting references webhook path", () => {
      expect(ioContract.toLowerCase()).toContain("marketing-pipeline-staged-ingress");
    });

    it("n8n README step-by-step setup includes webhook path", () => {
      expect(n8nReadme).toContain("marketing-pipeline-staged-ingress");
      const stepIdx = n8nReadme.indexOf("### Step 3");
      expect(stepIdx).toBeGreaterThan(0);
      expect(n8nReadme.slice(stepIdx, stepIdx + 500)).toContain("marketing-pipeline-staged-ingress");
    });
  });
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
