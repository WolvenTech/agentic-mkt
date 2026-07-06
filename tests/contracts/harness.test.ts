import { Ajv } from "ajv";
import type { ErrorObject } from "ajv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const IO_CONTRACT_PATH = resolve(REPO_ROOT, "agents", "harness", "io-contract.md");
const OUTPUT_SCHEMA_PATH = resolve(REPO_ROOT, "agents", "harness", "output-schema.json");
const AGENT_JSON_PATH = resolve(REPO_ROOT, "agents", "investigative-brief.json");
const HARNESS_README_PATH = resolve(REPO_ROOT, "agents", "harness", "README.md");

const STAGE_INPUT_FIELDS = ["stage", "agent_id", "task_title", "task_description", "criterios_de_aceite", "prior_stage_artifact", "lead_feedback", "model"];
const STAGE_OUTPUT_FIELDS = ["stage", "artifact_markdown", "resumo", "self_check", "next_gate"];

const SAMPLE_VALID_OUTPUT = {
  stage: "investigate",
  artifact_markdown: "## Brief\n\nSample stage artifact.",
  resumo: "Two-sentence summary of the stage output.",
  self_check: "- Criterion A met\n- Criterion B met",
  next_gate: "brief review",
};

const SAMPLE_MISSING_NEXT_GATE = {
  stage: "investigate",
  artifact_markdown: "Draft only.",
  resumo: "Summary only.",
  self_check: "- Check only.",
};

interface OutputSchema {
  $schema: string;
  type: string;
  required: string[];
  additionalProperties: boolean;
  properties: Record<string, { description: string }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

describe("output-schema.json", () => {
  const schema = readJson<OutputSchema>(OUTPUT_SCHEMA_PATH);
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  it("declares the draft-07 meta-schema and required StageAgentOutput fields", () => {
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(schema.type).toBe("object");
    expect([...schema.required].sort()).toEqual([...STAGE_OUTPUT_FIELDS].sort());
    expect(schema.additionalProperties).toBe(false);
  });

  it("validates a sample valid StageAgentOutput via ajv", () => {
    expect(validate(SAMPLE_VALID_OUTPUT)).toBe(true);
  });

  it("rejects a sample missing next_gate via ajv", () => {
    expect(validate(SAMPLE_MISSING_NEXT_GATE)).toBe(false);
    const missingNextGate = (validate.errors as ErrorObject[] | null | undefined)?.some(
      (err) => err.keyword === "required" && err.params.missingProperty === "next_gate"
    );
    expect(missingNextGate).toBe(true);
  });
});

describe("io-contract.md", () => {
  const contract = readFileSync(IO_CONTRACT_PATH, "utf-8");

  it("lists every StageInput field", () => {
    for (const field of STAGE_INPUT_FIELDS) {
      expect(contract).toContain(`\`${field}\``);
    }
  });

  it("documents the error envelope", () => {
    expect(contract).toContain('"error"');
    expect(contract).toContain('"raw_response"');
    const lower = contract.toLowerCase();
    expect(lower).toContain("parse failure");
    expect(lower).toContain("must not silently fail");
  });

  it("documents the ClickUp comment template sections and placeholders", () => {
    // Pointer comment format (task 31 revision: staged workflow)
    for (const section of ["Pointer comment", "Blocker comment", "[CQ-AI]", "[CQ-BLOCKER]", "Resumo", "Self-Check"]) {
      expect(contract).toContain(section);
    }
    // Placeholders for stage artifact pages and output fields
    for (const placeholder of ["{artifact_markdown}", "{resumo}", "{self_check}", "{next_gate_display_name}", "{blocker_question}"]) {
      expect(contract).toContain(placeholder);
    }
  });

  it("notes the ADR-001 no-idempotency decision", () => {
    const lower = contract.toLowerCase();
    expect(lower).toContain("idempotency");
    expect(lower).toContain("adr-001");
  });

  it("cross-references staged agent configs and output_schema", () => {
    expect(contract).toContain("investigative-brief.json");
    expect(contract).toContain("long-form-argument.json");
    expect(contract).toContain("linkedin-format.json");
    expect(contract).toContain("output-schema.json");
  });
});

describe("harness integration", () => {
  const schema = readJson<OutputSchema>(OUTPUT_SCHEMA_PATH);
  const agent = readJson<{ output_schema: Record<string, string> }>(AGENT_JSON_PATH);

  it("output-schema required keys match the staged agent contract keys", () => {
    expect([...schema.required].sort()).toEqual([...STAGE_OUTPUT_FIELDS].sort());
    expect(Object.keys(agent.output_schema).sort()).toEqual([...STAGE_OUTPUT_FIELDS, "blocker_question"].sort());
  });

  it("agents harness README links the contract artifacts", () => {
    const readme = readFileSync(HARNESS_README_PATH, "utf-8");
    for (const fragment of ["io-contract.md", "output-schema.json", "StageInput", "StageAgentOutput", "ADR-001"]) {
      expect(readme).toContain(fragment);
    }
  });
});
