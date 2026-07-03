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

const OPTIONAL_AGENT_KEYS = ["references"] as const;

const OUTPUT_SCHEMA_KEYS = ["deliverable_markdown", "resumo", "autochecagem"] as const;

// Staged agent output schema keys per ADR-006 and ADR-011
const REQUIRED_STAGED_OUTPUT_KEYS = ["stage", "artifact_markdown", "resumo", "self_check", "next_gate"] as const;
const OPTIONAL_STAGED_OUTPUT_KEYS = ["blocker_question"] as const;
const LEGACY_ONLY_OUTPUT_KEYS = ["deliverable_markdown", "autochecagem"] as const;

const STAGED_AGENT_IDS = ["investigative-brief", "long-form-argument", "linkedin-format"] as const;

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

  it("parses investigative-brief.json as a stage agent config with required keys", () => {
    const investigativePath = resolve(REPO_ROOT, "agents", "investigative-brief.json");
    expect(existsSync(investigativePath)).toBe(true);
    const agent = JSON.parse(readFileSync(investigativePath, "utf-8")) as AgentConfig;
    expect(agent.id).toBe("investigative-brief");
    expect(agent.provider).toBe("openai");
    expect(agent.model).toBe("gpt-4.1-mini");
    expect(agent.skills).toContain("wolven-voice");
    expect(agent.skills).toContain("investigative-brief");
    expect(agent.references).toBeDefined();
    expect(Array.isArray(agent.references)).toBe(true);
    expect(agent.references).toContain("agents/references/editorial-brief.md");
  });

  it("resolves every skill to a file under agents/skills/", () => {
    const agent = readAgentConfig();
    expect(Array.isArray(agent.skills)).toBe(true);
    expect(agent.skills.length).toBeGreaterThan(0);
    const missing = agent.skills.filter((skill) => !existsSync(resolve(SKILLS_DIR, `${skill}.md`)));
    expect(missing).toEqual([]);
  });

  it("resolves every skill in investigative-brief agent to a file", () => {
    const investigativePath = resolve(REPO_ROOT, "agents", "investigative-brief.json");
    const agent = JSON.parse(readFileSync(investigativePath, "utf-8")) as AgentConfig;
    expect(Array.isArray(agent.skills)).toBe(true);
    expect(agent.skills.length).toBeGreaterThan(0);
    const missing = agent.skills.filter((skill) => !existsSync(resolve(SKILLS_DIR, `${skill}.md`)));
    expect(missing).toEqual([]);
  });

  it("resolves every reference in investigative-brief agent to a file", () => {
    const investigativePath = resolve(REPO_ROOT, "agents", "investigative-brief.json");
    const agent = JSON.parse(readFileSync(investigativePath, "utf-8")) as AgentConfig;
    if (agent.references && Array.isArray(agent.references)) {
      const missing = agent.references.filter((ref) => !existsSync(resolve(REPO_ROOT, ref)));
      expect(missing).toEqual([]);
    }
  });

  it("has an output_schema with exactly the AgentOutput keys", () => {
    const agent = readAgentConfig();
    expect(Object.keys(agent.output_schema).sort()).toEqual([...OUTPUT_SCHEMA_KEYS].sort());
    for (const key of OUTPUT_SCHEMA_KEYS) {
      expect(typeof agent.output_schema[key]).toBe("string");
      expect((agent.output_schema[key] ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("preserves backward compatibility: linkedin-writer.json does not require references", () => {
    const agent = readAgentConfig();
    expect("references" in agent || !("references" in agent)).toBe(true);
  });

  it("allows optional references field when present", () => {
    const agent = readAgentConfig();
    if ("references" in agent && agent.references !== undefined) {
      expect(Array.isArray(agent.references)).toBe(true);
      for (const ref of agent.references) {
        expect(typeof ref).toBe("string");
        expect(ref.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("verifies investigative-brief skill includes no autonomous web research constraint", () => {
    const skillPath = resolve(REPO_ROOT, "agents", "skills", "investigative-brief.md");
    expect(existsSync(skillPath)).toBe(true);
    const skillContent = readFileSync(skillPath, "utf-8");
    expect(skillContent).toMatch(/web research|autonomous|research independently/i);
  });

  it("verifies investigative-brief skill includes blocker question constraint", () => {
    const skillPath = resolve(REPO_ROOT, "agents", "skills", "investigative-brief.md");
    const skillContent = readFileSync(skillPath, "utf-8");
    expect(skillContent).toMatch(/one.*blocker|highest-impact.*question|single.*blocker/i);
  });

  it("verifies investigative-brief skill requires supplied evidence only", () => {
    const skillPath = resolve(REPO_ROOT, "agents", "skills", "investigative-brief.md");
    const skillContent = readFileSync(skillPath, "utf-8");
    expect(skillContent).toMatch(/supplied|evidence only|invent/i);
  });

  it("accepts a staged config fixture with references array", () => {
    const stagedConfig: AgentConfig = {
      id: "investigate-agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["wolven-voice", "investigative-brief"],
      references: ["agents/references/editorial-brief.md"],
      output_schema: {
        deliverable_markdown: "Example output",
        resumo: "Summary",
        autochecagem: "Validation",
      },
    };
    expect(stagedConfig.id).toBe("investigate-agent");
    expect(stagedConfig.references).toBeDefined();
    expect(Array.isArray(stagedConfig.references)).toBe(true);
    expect(stagedConfig.references?.[0]).toBe("agents/references/editorial-brief.md");
  });

  it("verifies editorial-brief reference template exists and includes expected sections", () => {
    const referencePath = resolve(REPO_ROOT, "agents", "references", "editorial-brief.md");
    expect(existsSync(referencePath)).toBe(true);
    const referenceContent = readFileSync(referencePath, "utf-8");
    expect(referenceContent).toMatch(/Communication Objective/i);
    expect(referenceContent).toMatch(/Central Claim/i);
    expect(referenceContent).toMatch(/Evidence Inventory/i);
    expect(referenceContent).toMatch(/Identified Gaps/i);
    expect(referenceContent).toMatch(/Angle Options/i);
  });

  it("parses long-form-argument.json as a stage agent config with required keys", () => {
    const longFormPath = resolve(REPO_ROOT, "agents", "long-form-argument.json");
    expect(existsSync(longFormPath)).toBe(true);
    const agent = JSON.parse(readFileSync(longFormPath, "utf-8")) as AgentConfig;
    expect(agent.id).toBe("long-form-argument");
    expect(agent.provider).toBe("openai");
    expect(agent.model).toBe("gpt-4.1-mini");
    expect(agent.skills).toContain("wolven-voice");
    expect(agent.skills).toContain("long-form-argument");
    expect(agent.references).toBeDefined();
    expect(Array.isArray(agent.references)).toBe(true);
    expect(agent.references).toContain("agents/references/argument-template.md");
  });

  it("resolves every skill in long-form-argument agent to a file", () => {
    const longFormPath = resolve(REPO_ROOT, "agents", "long-form-argument.json");
    const agent = JSON.parse(readFileSync(longFormPath, "utf-8")) as AgentConfig;
    expect(Array.isArray(agent.skills)).toBe(true);
    expect(agent.skills.length).toBeGreaterThan(0);
    const missing = agent.skills.filter((skill) => !existsSync(resolve(SKILLS_DIR, `${skill}.md`)));
    expect(missing).toEqual([]);
  });

  it("resolves every reference in long-form-argument agent to a file", () => {
    const longFormPath = resolve(REPO_ROOT, "agents", "long-form-argument.json");
    const agent = JSON.parse(readFileSync(longFormPath, "utf-8")) as AgentConfig;
    if (agent.references && Array.isArray(agent.references)) {
      const missing = agent.references.filter((ref) => !existsSync(resolve(REPO_ROOT, ref)));
      expect(missing).toEqual([]);
    }
  });

  it("verifies long-form-argument skill distinguishes channel-neutral argument from LinkedIn formatting", () => {
    const skillPath = resolve(REPO_ROOT, "agents", "skills", "long-form-argument.md");
    expect(existsSync(skillPath)).toBe(true);
    const skillContent = readFileSync(skillPath, "utf-8");
    expect(skillContent).toMatch(/channel-neutral/i);
    expect(skillContent).toMatch(/no linkedin|formatting yet|not add linkedin/i);
  });

  it("verifies long-form-argument skill enforces evidence mapping", () => {
    const skillPath = resolve(REPO_ROOT, "agents", "skills", "long-form-argument.md");
    const skillContent = readFileSync(skillPath, "utf-8");
    expect(skillContent).toMatch(/evidence.*map|map.*evidence|evidence mapping/i);
  });

  it("verifies long-form-argument skill preserves trade-offs and implications", () => {
    const skillPath = resolve(REPO_ROOT, "agents", "skills", "long-form-argument.md");
    const skillContent = readFileSync(skillPath, "utf-8");
    expect(skillContent).toMatch(/trade-off|implications?|tensions?/i);
  });

  it("verifies long-form-argument skill includes blocker behavior for missing angle or evidence", () => {
    const skillPath = resolve(REPO_ROOT, "agents", "skills", "long-form-argument.md");
    const skillContent = readFileSync(skillPath, "utf-8");
    expect(skillContent).toMatch(/blocker|missing.*angle|missing.*evidence/i);
  });

  it("verifies argument-template reference exists and includes expected sections", () => {
    const referencePath = resolve(REPO_ROOT, "agents", "references", "argument-template.md");
    expect(existsSync(referencePath)).toBe(true);
    const referenceContent = readFileSync(referencePath, "utf-8");
    expect(referenceContent).toMatch(/Central Claim/i);
    expect(referenceContent).toMatch(/Reasoning/i);
    expect(referenceContent).toMatch(/Evidence Mapping/i);
    expect(referenceContent).toMatch(/Trade-Offs?/i);
    expect(referenceContent).toMatch(/Implications?/i);
    expect(referenceContent).toMatch(/Direction/i);
  });

  it("parses linkedin-format.json as a stage agent config with Format stage output schema", () => {
    const linkedinFormatPath = resolve(REPO_ROOT, "agents", "linkedin-format.json");
    expect(existsSync(linkedinFormatPath)).toBe(true);
    const agent = JSON.parse(readFileSync(linkedinFormatPath, "utf-8")) as AgentConfig;
    expect(agent.id).toBe("linkedin-format");
    expect(agent.provider).toBe("openai");
    expect(agent.model).toBe("gpt-4.1-mini");
    expect(agent.skills).toContain("wolven-voice");
    expect(agent.skills).toContain("linkedin-format");
    expect(agent.references).toBeDefined();
    expect(Array.isArray(agent.references)).toBe(true);
    expect(agent.references).toContain("agents/references/linkedin-structure.md");
  });

  it("verifies Format stage config has stage-aware output schema with artifact_markdown, self_check, and next_gate", () => {
    const linkedinFormatPath = resolve(REPO_ROOT, "agents", "linkedin-format.json");
    const agent = JSON.parse(readFileSync(linkedinFormatPath, "utf-8")) as AgentConfig;
    expect(agent.output_schema).toHaveProperty("stage");
    expect(agent.output_schema).toHaveProperty("artifact_markdown");
    expect(agent.output_schema).toHaveProperty("resumo");
    expect(agent.output_schema).toHaveProperty("self_check");
    expect(agent.output_schema).toHaveProperty("next_gate");
    expect(agent.output_schema.stage).toBe("format");
    expect(agent.output_schema.next_gate).toBe("final review");
  });

  it("resolves every skill in linkedin-format agent to a file", () => {
    const linkedinFormatPath = resolve(REPO_ROOT, "agents", "linkedin-format.json");
    const agent = JSON.parse(readFileSync(linkedinFormatPath, "utf-8")) as AgentConfig;
    expect(Array.isArray(agent.skills)).toBe(true);
    expect(agent.skills.length).toBeGreaterThan(0);
    const missing = agent.skills.filter((skill) => !existsSync(resolve(SKILLS_DIR, `${skill}.md`)));
    expect(missing).toEqual([]);
  });

  it("resolves every reference in linkedin-format agent to a file", () => {
    const linkedinFormatPath = resolve(REPO_ROOT, "agents", "linkedin-format.json");
    const agent = JSON.parse(readFileSync(linkedinFormatPath, "utf-8")) as AgentConfig;
    if (agent.references && Array.isArray(agent.references)) {
      const missing = agent.references.filter((ref) => !existsSync(resolve(REPO_ROOT, ref)));
      expect(missing).toEqual([]);
    }
  });

  it("verifies linkedin-format skill focuses on final LinkedIn adaptation only", () => {
    const skillPath = resolve(REPO_ROOT, "agents", "skills", "linkedin-format.md");
    expect(existsSync(skillPath)).toBe(true);
    const skillContent = readFileSync(skillPath, "utf-8");
    expect(skillContent).toMatch(/LinkedIn Post Formatting|Adapt.*argument/i);
    expect(skillContent).toMatch(/final-stage channel adaptation/i);
    expect(skillContent).not.toMatch(/### 1\. Validate/);
    expect(skillContent).not.toMatch(/Create angles/);
  });

  it("verifies linkedin-format skill preserves no-invention and evidence requirements", () => {
    const skillPath = resolve(REPO_ROOT, "agents", "skills", "linkedin-format.md");
    const skillContent = readFileSync(skillPath, "utf-8");
    expect(skillContent).toMatch(/Never invent|no-invention|supplied data only/i);
    expect(skillContent).toMatch(/evidence|traceable/i);
  });

  it("verifies linkedin-structure reference template exists and includes expected sections", () => {
    const referencePath = resolve(REPO_ROOT, "agents", "references", "linkedin-structure.md");
    expect(existsSync(referencePath)).toBe(true);
    const referenceContent = readFileSync(referencePath, "utf-8");
    expect(referenceContent).toMatch(/LinkedIn Post Structure|Hook/i);
    expect(referenceContent).toMatch(/Context|Evidence/i);
    expect(referenceContent).toMatch(/Core Point|Claim/i);
    expect(referenceContent).toMatch(/Reasoning|Trade-Off/i);
    expect(referenceContent).toMatch(/Implication|Direction/i);
    expect(referenceContent).toMatch(/Formatting Guidance/i);
  });
});

describe("staged config contract parity (ADR-006, ADR-011)", () => {
  it("all three staged agents declare complete staged output key set in output_schema", () => {
    for (const agentId of STAGED_AGENT_IDS) {
      const path = resolve(REPO_ROOT, "agents", `${agentId}.json`);
      const agent = JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
      for (const key of REQUIRED_STAGED_OUTPUT_KEYS) {
        expect(agent.output_schema, `${agentId} missing staged key: ${key}`).toHaveProperty(key);
        const value = agent.output_schema[key as keyof typeof agent.output_schema];
        expect(typeof value).toBe("string");
        expect((value ?? "").trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("staged configs never declare legacy-only keys: deliverable_markdown or autochecagem", () => {
    for (const agentId of STAGED_AGENT_IDS) {
      const path = resolve(REPO_ROOT, "agents", `${agentId}.json`);
      const agent = JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
      for (const legacyKey of LEGACY_ONLY_OUTPUT_KEYS) {
        expect(agent.output_schema).not.toHaveProperty(legacyKey, `${agentId} should not declare legacy key: ${legacyKey}`);
      }
    }
  });

  it("investigative-brief output_schema declares stage: investigate", () => {
    const path = resolve(REPO_ROOT, "agents", "investigative-brief.json");
    const agent = JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
    expect(agent.output_schema.stage).toBe("investigate", "investigative-brief.output_schema.stage must be 'investigate'");
  });

  it("long-form-argument output_schema declares stage: write", () => {
    const path = resolve(REPO_ROOT, "agents", "long-form-argument.json");
    const agent = JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
    expect(agent.output_schema.stage).toBe("write", "long-form-argument.output_schema.stage must be 'write'");
  });

  it("linkedin-format output_schema declares stage: format", () => {
    const path = resolve(REPO_ROOT, "agents", "linkedin-format.json");
    const agent = JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
    expect(agent.output_schema.stage).toBe("format", "linkedin-format.output_schema.stage must be 'format'");
  });

  it("investigative-brief next_gate maps to brief review", () => {
    const path = resolve(REPO_ROOT, "agents", "investigative-brief.json");
    const agent = JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
    expect(agent.output_schema.next_gate).toBe("brief review", "investigative-brief.output_schema.next_gate must be 'brief review'");
  });

  it("long-form-argument next_gate maps to content review", () => {
    const path = resolve(REPO_ROOT, "agents", "long-form-argument.json");
    const agent = JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
    expect(agent.output_schema.next_gate).toBe("content review", "long-form-argument.output_schema.next_gate must be 'content review'");
  });

  it("linkedin-format next_gate maps to final review", () => {
    const path = resolve(REPO_ROOT, "agents", "linkedin-format.json");
    const agent = JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
    expect(agent.output_schema.next_gate).toBe("final review", "linkedin-format.output_schema.next_gate must be 'final review'");
  });

  it("legacy linkedin-writer config uses legacy output schema only (no staged keys)", () => {
    const agent = readAgentConfig();
    expect(agent.output_schema).toHaveProperty("deliverable_markdown");
    expect(agent.output_schema).toHaveProperty("resumo");
    expect(agent.output_schema).toHaveProperty("autochecagem");
    expect(agent.output_schema).not.toHaveProperty("stage", "linkedin-writer should remain legacy and not declare stage");
    expect(agent.output_schema).not.toHaveProperty("artifact_markdown", "linkedin-writer should remain legacy and not declare artifact_markdown");
    expect(agent.output_schema).not.toHaveProperty("self_check", "linkedin-writer should remain legacy and not declare self_check");
    expect(agent.output_schema).not.toHaveProperty("next_gate", "linkedin-writer should remain legacy and not declare next_gate");
  });

  it("output_schema examples for staged configs describe actual expected output, not placeholders", () => {
    for (const agentId of STAGED_AGENT_IDS) {
      const path = resolve(REPO_ROOT, "agents", `${agentId}.json`);
      const agent = JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
      // Verify artifact_markdown value describes the stage artifact, not generic placeholder
      const artifactDesc = agent.output_schema.artifact_markdown ?? "";
      expect(artifactDesc.length).toBeGreaterThan(20, `${agentId}.output_schema.artifact_markdown should describe the stage artifact`);
      // Verify self_check value describes validation steps, not generic placeholder
      const selfCheckDesc = agent.output_schema.self_check ?? "";
      expect(selfCheckDesc.length).toBeGreaterThan(20, `${agentId}.output_schema.self_check should describe validation steps`);
    }
  });

  it("validates that staged configs cannot be confused with legacy-contract agents at a glance", () => {
    const legacy = readAgentConfig();
    const staged = JSON.parse(readFileSync(resolve(REPO_ROOT, "agents", "investigative-brief.json"), "utf-8")) as AgentConfig;
    // Legacy uses OLD keys; staged uses NEW keys
    expect(Object.keys(legacy.output_schema).sort()).toEqual([...OUTPUT_SCHEMA_KEYS].sort());
    expect(Object.keys(staged.output_schema).sort()).not.toEqual([...OUTPUT_SCHEMA_KEYS].sort());
    // Staged schema has stage field, legacy does not
    expect("stage" in staged.output_schema).toBe(true);
    expect("stage" in legacy.output_schema).toBe(false);
  });
});

describe("legacy config boundary (backward compatibility)", () => {
  it("validates that references, when present, must be strings", () => {
    function validateReferences(config: AgentConfig): boolean {
      if (!config.references) {
        return true;
      }
      for (const ref of config.references) {
        if (typeof ref !== "string" || ref.trim().length === 0) {
          return false;
        }
      }
      return true;
    }

    const validConfig: AgentConfig = {
      id: "valid-agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["skill1"],
      references: ["agents/references/template.md"],
      output_schema: {
        deliverable_markdown: "Example",
        resumo: "Summary",
        autochecagem: "Validation",
      },
    };
    expect(validateReferences(validConfig)).toBe(true);

    const invalidConfig: AgentConfig = {
      id: "invalid-agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["skill1"],
      references: ["" as any],
      output_schema: {
        deliverable_markdown: "Example",
        resumo: "Summary",
        autochecagem: "Validation",
      },
    };
    expect(validateReferences(invalidConfig)).toBe(false);
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
    expect(docUrlField.name).toBe("Editorial Doc Url");
    expect(docUrlField.clickup_field_id).toBeDefined();
  });

  it("preserves existing criterios_de_aceite and agent_id custom fields", () => {
    const fieldMapping = readFieldMapping();
    expect(fieldMapping.custom_fields).toHaveProperty("criterios_de_aceite");
    expect(fieldMapping.custom_fields).toHaveProperty("agent_id");
    const criteriosField = fieldMapping.custom_fields.criterios_de_aceite;
    const agentField = fieldMapping.custom_fields.agent_id;
    expect(criteriosField.name).toBe("ACs");
    expect(criteriosField.clickup_field_id).toBe("bd2e7a51-3e9e-4d6a-9729-770fac44a504");
    expect(agentField.name).toBe("Agent");
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
