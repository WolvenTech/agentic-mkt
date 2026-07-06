import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../../src/types/agent-config.js";
import type { StageParsedResult } from "../../src/types/call-agent-io.js";
import { isStageError } from "../../src/types/call-agent-io.js";
import type { FieldMapping } from "../../src/types/field-mapping.js";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SKILLS_DIR = resolve(REPO_ROOT, "agents", "skills");
const FIELD_MAPPING_PATH = resolve(REPO_ROOT, "integrations", "clickup", "field-mapping.json");

const STAGE_AGENT_IDS = ["investigative-brief", "long-form-argument", "linkedin-format"] as const;
const REQUIRED_STAGE_OUTPUT_KEYS = ["stage", "artifact_markdown", "resumo", "self_check", "next_gate"] as const;
const OPTIONAL_STAGE_OUTPUT_KEYS = ["blocker_question"] as const;

function readAgentConfig(agentId: (typeof STAGE_AGENT_IDS)[number]): AgentConfig {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, "agents", `${agentId}.json`), "utf-8")) as AgentConfig;
}

function readFieldMapping(): FieldMapping {
  return JSON.parse(readFileSync(FIELD_MAPPING_PATH, "utf-8")) as FieldMapping;
}

describe("agent config", () => {
  it("exposes stage agent configs with the required keys", () => {
    for (const agentId of STAGE_AGENT_IDS) {
      const agent = readAgentConfig(agentId);
      expect(agent.id).toBe(agentId);
      expect(agent.provider).toBe("openai");
      expect(agent.model).toBe("gpt-4.1-mini");
      expect(Array.isArray(agent.skills)).toBe(true);
      expect(agent.skills.length).toBeGreaterThan(0);
      expect(Object.keys(agent.output_schema).sort()).toEqual([...REQUIRED_STAGE_OUTPUT_KEYS, ...OPTIONAL_STAGE_OUTPUT_KEYS].sort());
    }
  });

  it("resolves every skill reference to a file under agents/skills/", () => {
    for (const agentId of STAGE_AGENT_IDS) {
      const agent = readAgentConfig(agentId);
      const missing = agent.skills.filter((skill) => !existsSync(resolve(SKILLS_DIR, `${skill}.md`)));
      expect(missing).toEqual([]);
    }
  });

  it("resolves every reference in stage configs to a file", () => {
    for (const agentId of STAGE_AGENT_IDS) {
      const agent = readAgentConfig(agentId);
      if (agent.references) {
        const missing = agent.references.filter((ref) => !existsSync(resolve(REPO_ROOT, ref)));
        expect(missing).toEqual([]);
      }
    }
  });

  it("keeps stage configs on the stage-only output schema", () => {
    for (const agentId of STAGE_AGENT_IDS) {
      const agent = readAgentConfig(agentId);
      expect(agent.output_schema).toHaveProperty("stage");
      expect(agent.output_schema).toHaveProperty("artifact_markdown");
      expect(agent.output_schema).toHaveProperty("resumo");
      expect(agent.output_schema).toHaveProperty("self_check");
      expect(agent.output_schema).toHaveProperty("next_gate");
      expect(agent.output_schema).not.toHaveProperty("deliverable_markdown");
      expect(agent.output_schema).not.toHaveProperty("autochecagem");
    }
  });

  it("validates stage agent references and templates", () => {
    const investigative = readAgentConfig("investigative-brief");
    expect(investigative.references).toContain("agents/references/editorial-brief.md");

    const editorialBrief = readFileSync(resolve(REPO_ROOT, "agents", "references", "editorial-brief.md"), "utf-8");
    expect(editorialBrief).toMatch(/Communication Objective/i);
    expect(editorialBrief).toMatch(/Central Claim/i);
    expect(editorialBrief).toMatch(/Evidence Inventory/i);
    expect(editorialBrief).toMatch(/Identified Gaps/i);
    expect(editorialBrief).toMatch(/Angle Options/i);

    const longForm = readAgentConfig("long-form-argument");
    expect(longForm.references).toContain("agents/references/argument-template.md");
    expect(readFileSync(resolve(REPO_ROOT, "agents", "references", "argument-template.md"), "utf-8")).toMatch(/Argument/i);
  });

  it("parses a staged AgentConfig-like output envelope cleanly", () => {
    const stagedResult: StageParsedResult = {
      stage: "investigate",
      artifact_markdown: "Example",
      resumo: "Summary",
      self_check: "Validation",
      next_gate: "brief review",
    };
    expect(isStageError(stagedResult)).toBe(false);
  });

  it("has the expected field mapping structure for stage routing", () => {
    const mapping = readFieldMapping();
    expect(mapping.custom_fields.agent_id).toBeDefined();
    expect(mapping.custom_fields.editorial_doc_url).toBeDefined();
    expect(mapping.statuses.investigate).toBeDefined();
    expect(mapping.statuses.write).toBeDefined();
    expect(mapping.statuses.format).toBeDefined();
  });
});
