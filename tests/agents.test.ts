import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../src/types/agent-config.js";
import type { CallAgentInput, ParseResult } from "../src/types/call-agent-io.js";
import { isAgentError } from "../src/types/call-agent-io.js";
import type { FieldMapping } from "../src/types/field-mapping.js";

const REPO_ROOT = resolve(__dirname, "..");
const AGENT_JSON_PATH = resolve(REPO_ROOT, "agents", "linkedin-writer.json");
const SKILLS_DIR = resolve(REPO_ROOT, "agents", "skills");
const FIELD_MAPPING_PATH = resolve(REPO_ROOT, "clickup", "field-mapping.json");

const REQUIRED_AGENT_KEYS = [
  "id",
  "provider",
  "model",
  "skills",
  "temperature",
  "max_output_tokens",
  "output_schema",
] as const;

const OUTPUT_SCHEMA_KEYS = ["deliverable_markdown", "resumo", "autochecagem"] as const;

function readAgentConfig(): AgentConfig {
  return JSON.parse(readFileSync(AGENT_JSON_PATH, "utf-8")) as AgentConfig;
}

function readFieldMapping(): FieldMapping {
  return JSON.parse(readFileSync(FIELD_MAPPING_PATH, "utf-8")) as FieldMapping;
}

describe("agent config", () => {
  it("parses linkedin-writer.json with every required AgentConfig key", () => {
    const agent = readAgentConfig();
    const missing = REQUIRED_AGENT_KEYS.filter((key) => !(key in agent));
    expect(missing).toEqual([]);
  });

  it("resolves every skill to a file under agents/skills/", () => {
    const agent = readAgentConfig();
    expect(Array.isArray(agent.skills)).toBe(true);
    expect(agent.skills.length).toBeGreaterThan(0);
    const missing = agent.skills.filter((skill) => !existsSync(resolve(SKILLS_DIR, `${skill}.md`)));
    expect(missing).toEqual([]);
  });

  it("has an output_schema with exactly the AgentOutput keys", () => {
    const agent = readAgentConfig();
    expect(Object.keys(agent.output_schema).sort()).toEqual([...OUTPUT_SCHEMA_KEYS].sort());
    for (const key of OUTPUT_SCHEMA_KEYS) {
      expect(typeof agent.output_schema[key]).toBe("string");
      expect(agent.output_schema[key].trim().length).toBeGreaterThan(0);
    }
  });
});

describe("field mapping", () => {
  it("parses field-mapping.json as FieldMapping with the required keys", () => {
    const fieldMapping = readFieldMapping();
    expect(fieldMapping).toHaveProperty("custom_fields");
    expect(fieldMapping).toHaveProperty("statuses");
    expect(fieldMapping).toHaveProperty("clickup_list_id");
  });

  it("keeps every custom field entry shaped with name and clickup_field_id", () => {
    const fieldMapping = readFieldMapping();
    for (const [key, field] of Object.entries(fieldMapping.custom_fields)) {
      expect(field, `${key} missing name`).toHaveProperty("name");
      expect(field, `${key} missing clickup_field_id`).toHaveProperty("clickup_field_id");
    }
  });

  it("includes all staged status keys: investigate, brief_review, write, content_review, format, final_review", () => {
    const fieldMapping = readFieldMapping();
    const stagedKeys = ["investigate", "brief_review", "write", "content_review", "format", "final_review"];
    for (const key of stagedKeys) {
      expect(fieldMapping.statuses, `missing staged status key: ${key}`).toHaveProperty(key);
      expect(String(fieldMapping.statuses[key])).not.toBe("");
    }
  });

  it("includes editorial_doc_url custom field with name and clickup_field_id", () => {
    const fieldMapping = readFieldMapping();
    expect(fieldMapping.custom_fields, "missing editorial_doc_url field").toHaveProperty("editorial_doc_url");
    const docUrlField = fieldMapping.custom_fields.editorial_doc_url;
    expect(docUrlField.name).toBe("Editorial Doc URL");
    expect(docUrlField.clickup_field_id).toBeDefined();
  });

  it("preserves existing criterios_de_aceite and agent_id custom fields", () => {
    const fieldMapping = readFieldMapping();
    expect(fieldMapping.custom_fields).toHaveProperty("criterios_de_aceite");
    expect(fieldMapping.custom_fields).toHaveProperty("agent_id");
    const criteriosField = fieldMapping.custom_fields.criterios_de_aceite;
    const agentField = fieldMapping.custom_fields.agent_id;
    expect(criteriosField.name).toBe("Critérios de Aceite");
    expect(criteriosField.clickup_field_id).toBe("bd2e7a51-3e9e-4d6a-9729-770fac44a504");
    expect(agentField.name).toBe("agent_id");
    expect(agentField.clickup_field_id).toBe("a969b8cc-d77a-4a0b-9e37-a8e81dfc6de0");
  });

  it("retains legacy status keys for backward compatibility: ready, needs_review, writing, review", () => {
    const fieldMapping = readFieldMapping();
    const legacyKeys = ["ready", "needs_review", "writing", "review"];
    for (const key of legacyKeys) {
      expect(fieldMapping.statuses, `missing legacy status key: ${key}`).toHaveProperty(key);
      expect(String(fieldMapping.statuses[key])).not.toBe("");
    }
  });
});

describe("isAgentError", () => {
  it("returns true for an error envelope shape", () => {
    const result: ParseResult = { error: "Failed to parse AgentOutput", raw_response: "not json" };
    expect(isAgentError(result)).toBe(true);
  });

  it("returns false for a successful AgentOutput shape", () => {
    const result: ParseResult = {
      deliverable_markdown: "draft",
      resumo: "summary",
      autochecagem: "- ok",
    };
    expect(isAgentError(result)).toBe(false);
  });
});

describe("shared types compile against a logic-module stub", () => {
  it("accepts CallAgentInput and yields a ParseResult narrowable by isAgentError", () => {
    const stubParseAgentOutput = (input: CallAgentInput, raw: string): ParseResult => {
      try {
        return JSON.parse(raw) as ParseResult;
      } catch {
        return { error: `Failed to parse AgentOutput for ${input.agent_id}`, raw_response: raw };
      }
    };

    const input: CallAgentInput = {
      agent_id: "linkedin-writer",
      task_title: "Launch post",
      task_description: "Announce the feature",
      criterios_de_aceite: "- Under 300 words",
    };

    const result = stubParseAgentOutput(input, "not json");
    expect(isAgentError(result)).toBe(true);
    if (isAgentError(result)) {
      expect(result.raw_response).toBe("not json");
    }
  });
});
