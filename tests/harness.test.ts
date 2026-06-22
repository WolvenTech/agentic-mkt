import { Ajv } from "ajv";
import type { ErrorObject } from "ajv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..");
const IO_CONTRACT_PATH = resolve(REPO_ROOT, "agents", "harness", "io-contract.md");
const OUTPUT_SCHEMA_PATH = resolve(REPO_ROOT, "agents", "harness", "output-schema.json");
const AGENT_JSON_PATH = resolve(REPO_ROOT, "agents", "linkedin-writer.json");
const HARNESS_README_PATH = resolve(REPO_ROOT, "agents", "harness", "README.md");

const CALL_AGENT_INPUT_FIELDS = ["agent_id", "task_title", "task_description", "criterios_de_aceite"];
const AGENT_OUTPUT_FIELDS = ["deliverable_markdown", "resumo", "autochecagem"];

const SAMPLE_VALID_OUTPUT = {
  deliverable_markdown: "## Hook\n\nSample LinkedIn post body.",
  resumo: "Two-sentence summary of the draft angle.",
  autochecagem: "- Criterion A met\n- Criterion B met",
};

const SAMPLE_MISSING_AUTOCHECAGEM = {
  deliverable_markdown: "Draft only.",
  resumo: "Summary only.",
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

  it("declares the draft-07 meta-schema and required AgentOutput fields", () => {
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(schema.type).toBe("object");
    expect([...schema.required].sort()).toEqual([...AGENT_OUTPUT_FIELDS].sort());
    expect(schema.additionalProperties).toBe(false);
  });

  it("validates a sample valid AgentOutput via ajv", () => {
    expect(validate(SAMPLE_VALID_OUTPUT)).toBe(true);
  });

  it("rejects a sample missing autochecagem via ajv", () => {
    expect(validate(SAMPLE_MISSING_AUTOCHECAGEM)).toBe(false);
    const missingAutochecagem = (validate.errors as ErrorObject[] | null | undefined)?.some(
      (err) => err.keyword === "required" && err.params.missingProperty === "autochecagem"
    );
    expect(missingAutochecagem).toBe(true);
  });
});

describe("io-contract.md", () => {
  const contract = readFileSync(IO_CONTRACT_PATH, "utf-8");

  it("lists every CallAgentInput field", () => {
    for (const field of CALL_AGENT_INPUT_FIELDS) {
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
    for (const section of ["LinkedIn Draft", "Resumo", "Autochecagem"]) {
      expect(contract).toContain(section);
    }
    for (const placeholder of ["{deliverable_markdown}", "{resumo}", "{autochecagem}"]) {
      expect(contract).toContain(placeholder);
    }
  });

  it("notes the ADR-001 no-idempotency decision", () => {
    const lower = contract.toLowerCase();
    expect(lower).toContain("idempotency");
    expect(lower).toContain("adr-001");
  });

  it("cross-references linkedin-writer.json and output_schema", () => {
    expect(contract).toContain("agents/linkedin-writer.json");
    expect(contract).toContain("output_schema");
  });
});

describe("harness integration", () => {
  const schema = readJson<OutputSchema>(OUTPUT_SCHEMA_PATH);
  const agent = readJson<{ output_schema: Record<string, string> }>(AGENT_JSON_PATH);

  it("output-schema required keys match the agent config's output_schema keys", () => {
    expect([...schema.required].sort()).toEqual(Object.keys(agent.output_schema).sort());
    expect([...schema.required].sort()).toEqual([...AGENT_OUTPUT_FIELDS].sort());
  });

  it("output-schema descriptions match the agent config's output_schema descriptions", () => {
    for (const key of AGENT_OUTPUT_FIELDS) {
      expect(schema.properties[key]?.description).toBe(agent.output_schema[key]);
    }
  });

  it("agents harness README links the contract artifacts", () => {
    const readme = readFileSync(HARNESS_README_PATH, "utf-8");
    for (const fragment of ["io-contract.md", "output-schema.json", "CallAgentInput", "AgentOutput", "ADR-001"]) {
      expect(readme).toContain(fragment);
    }
  });
});
