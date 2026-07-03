import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_OUTPUT_KEYS,
  REQUIRED_STAGE_OUTPUT_KEYS,
  assembleSystemPrompt,
  assembleUserMessage,
  buildStructuredLog,
  decodeGithubFileContent,
  extractOpenAIText,
  openaiModelId,
  githubFetchPaths,
  isStagedAgentConfig,
  isValidReferencePath,
  pairSkillContentsFromFetch,
  pairReferenceContentsFromFetch,
  parseAgentOutput,
  parseCallAgentOutput,
  parseStageOutput,
  providerIsOpenAI,
  providerIsRouted,
  referencePath,
} from "../src/call-agent/logic.js";
import type { AgentConfig } from "../src/types/agent-config.js";
import type { CallAgentInput } from "../src/types/call-agent-io.js";
import { isAgentError, isStageError } from "../src/types/call-agent-io.js";
import { buildCallAgentWorkflow, GPT_NODE_NAME } from "../src/workflows/build-call-agent.js";
import type { N8nNode } from "../src/workflows/build-call-agent.js";

const REPO_ROOT = resolve(__dirname, "..");
const AGENT_JSON_PATH = resolve(REPO_ROOT, "agents", "linkedin-writer.json");
const SKILLS_DIR = resolve(REPO_ROOT, "agents", "skills");

const HARDCODED_CALL_AGENT_INPUT: CallAgentInput = {
  agent_id: "linkedin-writer",
  task_title: "Launch post for Q3 product update",
  task_description: "Announce the new dashboard feature for marketing leads.",
  criterios_de_aceite: "- Mention the dashboard\n- CTA to sign up\n- Under 300 words",
};

const REVISION_TASK_DESCRIPTION = `# Original Brief
Announce the new dashboard feature for marketing leads.

# Revision Feedback (Comment Thread)
[2026-06-22T10:00:00Z] Lead: Shorten the hook and include the customer quote.
[2026-06-22T10:05:00Z] linkedin-writer: ## LinkedIn Draft
Previous draft text.

# Revision Instructions
Incorporate all lead feedback above. This is automated revision round 1 of 2.`;

const SAMPLE_VALID_LLM_OUTPUT = {
  deliverable_markdown: "## Hook\n\nWe shipped a new dashboard.",
  resumo: "Summary of the dashboard launch post.",
  autochecagem: "- Dashboard mentioned\n- Sign-up CTA present",
};

function readAgentConfig(): AgentConfig {
  return JSON.parse(readFileSync(AGENT_JSON_PATH, "utf-8")) as AgentConfig;
}

function readStagedAgentConfig(): AgentConfig {
  const path = resolve(REPO_ROOT, "agents", "investigative-brief.json");
  return JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
}

function readSkill(name: string): string {
  return readFileSync(resolve(SKILLS_DIR, `${name}.md`), "utf-8");
}

function githubFilePayload(text: string): { content: string; encoding: string } {
  return { content: Buffer.from(text, "utf-8").toString("base64"), encoding: "base64" };
}

describe("parseAgentOutput", () => {
  it("produces an AgentOutput with all required keys for valid JSON", () => {
    const result = parseAgentOutput(JSON.stringify(SAMPLE_VALID_LLM_OUTPUT));
    expect(isAgentError(result)).toBe(false);
    expect(Object.keys(result).sort()).toEqual([...REQUIRED_OUTPUT_KEYS].sort());
  });

  it("returns an error envelope (not partial output) for malformed JSON", () => {
    const result = parseAgentOutput("not-json-at-all");
    expect(isAgentError(result)).toBe(true);
    if (isAgentError(result)) {
      expect(result.raw_response).toBe("not-json-at-all");
    }
    expect(result).not.toHaveProperty("deliverable_markdown");
  });

  it("returns an error envelope naming the missing key", () => {
    const partial = { deliverable_markdown: "draft", resumo: "summary" };
    const result = parseAgentOutput(JSON.stringify(partial));
    expect(isAgentError(result)).toBe(true);
    if (isAgentError(result)) {
      expect(result.error).toContain("autochecagem");
    }
  });

  it("strips ```json fences before parsing", () => {
    const fenced = `\`\`\`json\n${JSON.stringify(SAMPLE_VALID_LLM_OUTPUT)}\n\`\`\``;
    const result = parseAgentOutput(fenced);
    expect(isAgentError(result)).toBe(false);
    expect(Object.keys(result).sort()).toEqual([...REQUIRED_OUTPUT_KEYS].sort());
  });

  it("fails validation for empty/whitespace-only string values", () => {
    const invalid = { ...SAMPLE_VALID_LLM_OUTPUT, resumo: "   " };
    const result = parseAgentOutput(JSON.stringify(invalid));
    expect(isAgentError(result)).toBe(true);
    if (isAgentError(result)) {
      expect(result.error).toContain("resumo");
    }
  });

  it("never throws on garbage input", () => {
    expect(() => parseAgentOutput("{")).not.toThrow();
    expect(() => parseAgentOutput("[]")).not.toThrow();
    expect(isAgentError(parseAgentOutput("[]"))).toBe(true);
  });
});

describe("parseStageOutput", () => {
  const SAMPLE_VALID_STAGE_OUTPUT = {
    stage: "investigate",
    artifact_markdown: "## Brief\n\nKey findings from research.",
    resumo: "Summary of brief findings.",
    self_check: "- All research documented\n- Key insights highlighted",
    next_gate: "brief review",
  };

  const SAMPLE_VALID_BLOCKER_OUTPUT = {
    stage: "investigate",
    artifact_markdown: "## Brief\n\nPartial research.",
    resumo: "Incomplete findings.",
    self_check: "- Missing sources",
    next_gate: "brief review",
    blocker_question: "Can you provide additional sources for the claims?",
  };

  it("produces a StageAgentOutput with all required keys for valid JSON", () => {
    const result = parseStageOutput(JSON.stringify(SAMPLE_VALID_STAGE_OUTPUT));
    expect(isStageError(result)).toBe(false);
    if (!isStageError(result)) {
      for (const key of REQUIRED_STAGE_OUTPUT_KEYS) {
        expect(key in result).toBe(true);
      }
      expect(result.stage).toBe("investigate");
      expect(result.next_gate).toBe("brief review");
    }
  });

  it("accepts a valid stage output with blocker_question", () => {
    const result = parseStageOutput(JSON.stringify(SAMPLE_VALID_BLOCKER_OUTPUT));
    expect(isStageError(result)).toBe(false);
    if (!isStageError(result)) {
      expect(result.blocker_question).toBe("Can you provide additional sources for the claims?");
    }
  });

  it("rejects output with unknown stage", () => {
    const invalid = { ...SAMPLE_VALID_STAGE_OUTPUT, stage: "unknown-stage" };
    const result = parseStageOutput(JSON.stringify(invalid));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("unknown");
      expect(result.error.toLowerCase()).toContain("stage");
    }
  });

  it("rejects output with mismatched next_gate for the stage", () => {
    const invalid = { ...SAMPLE_VALID_STAGE_OUTPUT, next_gate: "content review" };
    const result = parseStageOutput(JSON.stringify(invalid));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("next_gate");
      expect(result.error).toContain("investigate");
      expect(result.error).toContain("brief review");
    }
  });

  it("rejects output for write stage with wrong next_gate", () => {
    const invalid = {
      stage: "write",
      artifact_markdown: "## Argument\n\nFull argument.",
      resumo: "Argument summary.",
      self_check: "- Logically sound",
      next_gate: "brief review",
    };
    const result = parseStageOutput(JSON.stringify(invalid));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("content review");
    }
  });

  it("rejects output for format stage with wrong next_gate", () => {
    const invalid = {
      stage: "format",
      artifact_markdown: "## Final Draft\n\nFormatted post.",
      resumo: "Format summary.",
      self_check: "- Formatting complete",
      next_gate: "content review",
    };
    const result = parseStageOutput(JSON.stringify(invalid));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("final review");
    }
  });

  it("returns an error envelope (not partial output) for malformed JSON", () => {
    const result = parseStageOutput("not-json-at-all");
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.raw_response).toBe("not-json-at-all");
    }
    expect(result).not.toHaveProperty("stage");
  });

  it("returns an error envelope naming the missing key", () => {
    const partial = {
      stage: "investigate",
      artifact_markdown: "content",
      resumo: "summary",
    };
    const result = parseStageOutput(JSON.stringify(partial));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("self_check");
      expect(result.error).toContain("next_gate");
    }
  });

  it("fails validation for empty artifact_markdown", () => {
    const invalid = { ...SAMPLE_VALID_STAGE_OUTPUT, artifact_markdown: "   " };
    const result = parseStageOutput(JSON.stringify(invalid));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("artifact_markdown");
    }
  });

  it("fails validation for empty resumo", () => {
    const invalid = { ...SAMPLE_VALID_STAGE_OUTPUT, resumo: "" };
    const result = parseStageOutput(JSON.stringify(invalid));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("resumo");
    }
  });

  it("fails validation for empty self_check", () => {
    const invalid = { ...SAMPLE_VALID_STAGE_OUTPUT, self_check: "   " };
    const result = parseStageOutput(JSON.stringify(invalid));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("self_check");
    }
  });

  it("fails validation for blocker_question that is empty", () => {
    const invalid = { ...SAMPLE_VALID_STAGE_OUTPUT, blocker_question: "   " };
    const result = parseStageOutput(JSON.stringify(invalid));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("blocker_question");
    }
  });

  it("strips ```json fences before parsing", () => {
    const fenced = `\`\`\`json\n${JSON.stringify(SAMPLE_VALID_STAGE_OUTPUT)}\n\`\`\``;
    const result = parseStageOutput(fenced);
    expect(isStageError(result)).toBe(false);
    if (!isStageError(result)) {
      expect(result.stage).toBe("investigate");
    }
  });

  it("never throws on garbage input", () => {
    expect(() => parseStageOutput("{")).not.toThrow();
    expect(() => parseStageOutput("[]")).not.toThrow();
    expect(isStageError(parseStageOutput("[]"))).toBe(true);
  });

  it("accepts valid investigate stage with correct next_gate", () => {
    const output = {
      stage: "investigate",
      artifact_markdown: "Brief findings",
      resumo: "Summary",
      self_check: "Checks done",
      next_gate: "brief review",
    };
    const result = parseStageOutput(JSON.stringify(output));
    expect(isStageError(result)).toBe(false);
    if (!isStageError(result)) {
      expect(result.stage).toBe("investigate");
      expect(result.next_gate).toBe("brief review");
    }
  });

  it("accepts valid write stage with correct next_gate", () => {
    const output = {
      stage: "write",
      artifact_markdown: "Full argument",
      resumo: "Summary",
      self_check: "Checks done",
      next_gate: "content review",
    };
    const result = parseStageOutput(JSON.stringify(output));
    expect(isStageError(result)).toBe(false);
    if (!isStageError(result)) {
      expect(result.stage).toBe("write");
      expect(result.next_gate).toBe("content review");
    }
  });

  it("accepts valid format stage with correct next_gate", () => {
    const output = {
      stage: "format",
      artifact_markdown: "Formatted post",
      resumo: "Summary",
      self_check: "Checks done",
      next_gate: "final review",
    };
    const result = parseStageOutput(JSON.stringify(output));
    expect(isStageError(result)).toBe(false);
    if (!isStageError(result)) {
      expect(result.stage).toBe("format");
      expect(result.next_gate).toBe("final review");
    }
  });

  it("preserves optional blocker_question when present", () => {
    const output = {
      stage: "investigate",
      artifact_markdown: "Brief",
      resumo: "Summary",
      self_check: "Checks",
      next_gate: "brief review",
      blocker_question: "Need clarification on sources",
    };
    const result = parseStageOutput(JSON.stringify(output));
    expect(isStageError(result)).toBe(false);
    if (!isStageError(result)) {
      expect(result.blocker_question).toBe("Need clarification on sources");
    }
  });

  it("omits blocker_question from result when not present", () => {
    const result = parseStageOutput(JSON.stringify(SAMPLE_VALID_STAGE_OUTPUT));
    expect(isStageError(result)).toBe(false);
    if (!isStageError(result)) {
      expect("blocker_question" in result).toBe(false);
    }
  });
});

describe("isStagedAgentConfig / parseCallAgentOutput", () => {
  function readStagedAgentConfig(): AgentConfig {
    const path = resolve(REPO_ROOT, "agents", "investigative-brief.json");
    return JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
  }

  it("isStagedAgentConfig is true for the three staged agent configs", () => {
    for (const id of ["investigative-brief", "long-form-argument", "linkedin-format"]) {
      const path = resolve(REPO_ROOT, "agents", `${id}.json`);
      const agent = JSON.parse(readFileSync(path, "utf-8")) as AgentConfig;
      expect(isStagedAgentConfig(agent)).toBe(true);
    }
  });

  it("isStagedAgentConfig is false for the legacy linkedin-writer config", () => {
    expect(isStagedAgentConfig(readAgentConfig())).toBe(false);
  });

  it("parseCallAgentOutput returns next_gate for a staged agent's valid output", () => {
    const stagedAgent = readStagedAgentConfig();
    const rawResponse = JSON.stringify({
      stage: "investigate",
      artifact_markdown: "## Brief\n\nKey findings from research.",
      resumo: "Summary of brief findings.",
      self_check: "- All research documented\n- Key insights highlighted",
      next_gate: "brief review",
    });

    const result = parseCallAgentOutput(stagedAgent, rawResponse);

    expect(isStageError(result)).toBe(false);
    if (!isStageError(result) && "next_gate" in result) {
      expect(result.next_gate).toBe("brief review");
    }
  });

  it("parseCallAgentOutput returns deliverable_markdown (no next_gate) for the legacy agent's valid output", () => {
    const rawResponse = JSON.stringify(SAMPLE_VALID_LLM_OUTPUT);

    const result = parseCallAgentOutput(readAgentConfig(), rawResponse);

    expect(isAgentError(result)).toBe(false);
    if (!isAgentError(result)) {
      expect((result as { deliverable_markdown?: string }).deliverable_markdown).toBeDefined();
      expect("next_gate" in result).toBe(false);
    }
  });

  it("parseCallAgentOutput returns an error envelope for malformed JSON regardless of contract", () => {
    const staged = parseCallAgentOutput(readStagedAgentConfig(), "not json");
    const legacy = parseCallAgentOutput(readAgentConfig(), "not json");
    expect(isStageError(staged)).toBe(true);
    expect(isAgentError(legacy)).toBe(true);
  });
});

describe("extractOpenAIText", () => {
  it("extracts text from n8n OpenAI Responses simplified output", () => {
    const response = {
      output: [
        {
          type: "message",
          status: "completed",
          content: [{ type: "output_text", text: JSON.stringify(SAMPLE_VALID_LLM_OUTPUT) }],
        },
      ],
    };
    const text = extractOpenAIText(response);
    const parsed = parseAgentOutput(text);
    expect(isAgentError(parsed)).toBe(false);
    expect(Object.keys(parsed).sort()).toEqual([...REQUIRED_OUTPUT_KEYS].sort());
  });

  it("extracts text from Chat Completions simplified output", () => {
    const response = {
      choices: [{ message: { content: JSON.stringify(SAMPLE_VALID_LLM_OUTPUT) } }],
    };
    expect(extractOpenAIText(response)).toBe(JSON.stringify(SAMPLE_VALID_LLM_OUTPUT));
  });

  it("falls back to text/message keys, then JSON.stringify", () => {
    expect(extractOpenAIText({ text: "plain text" })).toBe("plain text");
    expect(extractOpenAIText({ message: "message text" })).toBe("message text");
    expect(extractOpenAIText({ foo: "bar" })).toBe(JSON.stringify({ foo: "bar" }));
  });
});

describe("buildStructuredLog", () => {
  it("includes every structured logging field", () => {
    const log = buildStructuredLog({
      taskId: "task-1",
      agentId: "linkedin-writer",
      executionId: "exec-1",
      latencyMs: 1200,
      parseSuccess: true,
    });
    expect(log).toEqual({
      task_id: "task-1",
      agent_id: "linkedin-writer",
      execution_id: "exec-1",
      latency_ms: 1200,
      parse_success: true,
    });
  });
});

describe("wolven-voice skill", () => {
  const skill = readSkill("wolven-voice");

  it("preserves source facts while rewriting in Wolven voice", () => {
    for (const phrase of [
      "Preserve all facts",
      "names, numbers, promises, links, required CTAs",
      "source's intent",
      "Straightforward",
      "Friendly",
      "Imaginative",
      "Confident",
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it("documents forbidden corporate and Silicon Valley cliches", () => {
    for (const phrase of ["corporate fluff", "Silicon Valley cliches", "leverage", "thought leader"]) {
      expect(skill).toContain(phrase);
    }
  });

  it("includes the final voice QA from the DOCX source", () => {
    for (const phrase of [
      "Can a busy VP state the point in one sentence?",
      "human and direct",
      "facts, claims, numbers, names, links, and CTAs",
      "unsupported new claims",
    ]) {
      expect(skill).toContain(phrase);
    }
  });
});

describe("linkedin-format skill (trimmed for Format stage)", () => {
  const skill = readSkill("linkedin-format");

  it("documents focus on final LinkedIn adaptation from approved argument", () => {
    for (const phrase of [
      "Adapt an approved channel-neutral argument",
      "final LinkedIn post",
      "final-stage channel adaptation",
      "Format for LinkedIn",
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it("documents C-level English LinkedIn audience and post structure", () => {
    for (const phrase of [
      "C-level readers",
      "Always return the post in English",
      "LinkedIn",
      "LinkedIn structure",
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it("documents no-invention rules and evidence preservation from supplied argument", () => {
    for (const phrase of [
      "Never invent",
      "supplied data and claims from the argument only",
      "Preserve all facts",
      "Do not weaken or amplify",
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it("does not document the three-angle workflow (moved to investigative-brief)", () => {
    expect(skill).not.toContain("provide three short and distinct angles");
    expect(skill).not.toContain("Create angles");
  });

  it("does not document validation as a workflow step (moved to investigative-brief)", () => {
    expect(skill).not.toContain("### 1. Validate");
    expect(skill).not.toContain("Require a communication objective");
    expect(skill).not.toContain("Require a central idea");
    expect(skill).not.toContain("Treat missing evidence as a blocker");
  });

  it("documents Receive-Format-Polish workflow steps instead of bundled workflow", () => {
    for (const phrase of [
      "### 1. Receive the Argument",
      "### 2. Format for LinkedIn",
      "### 3. Apply Final Polish",
      "approved channel-neutral argument",
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it("includes LinkedIn structure and formatting guidance from template", () => {
    for (const phrase of [
      "Hook:",
      "LinkedIn template",
      "short paragraphs",
      "white space",
      "Core point",
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it("documents output mode as final post or blocker only (not angle options)", () => {
    expect(skill).toContain("artifact_markdown");
    expect(skill).toContain("resumo");
    expect(skill).toContain("self_check");
    expect(skill).not.toContain("Angle options");
  });

  it("includes final QA checks with evidence traceability to argument", () => {
    for (const phrase of [
      "traceable to the supplied argument",
      "argument is complete",
      "No facts, results, or source details are invented",
      "LinkedIn structure",
    ]) {
      expect(skill).toContain(phrase);
    }
  });
});

describe("reference path validation", () => {
  it("isValidReferencePath accepts standard repo-relative paths", () => {
    expect(isValidReferencePath("agents/references/editorial-brief.md")).toBe(true);
    expect(isValidReferencePath("agents/references/example-brief.md")).toBe(true);
    expect(isValidReferencePath("path/to/reference.md")).toBe(true);
  });

  it("isValidReferencePath rejects empty or whitespace-only paths", () => {
    expect(isValidReferencePath("")).toBe(false);
    expect(isValidReferencePath("   ")).toBe(false);
    expect(isValidReferencePath(null as unknown as string)).toBe(false);
    expect(isValidReferencePath(undefined as unknown as string)).toBe(false);
  });

  it("isValidReferencePath rejects paths with path traversal (..) patterns", () => {
    expect(isValidReferencePath("../agents/references/brief.md")).toBe(false);
    expect(isValidReferencePath("agents/../../../etc/passwd")).toBe(false);
    expect(isValidReferencePath("agents/references/../../../etc/passwd")).toBe(false);
  });

  it("referencePath() throws on invalid paths", () => {
    expect(() => referencePath("")).toThrow("Invalid reference path");
    expect(() => referencePath("../evil.md")).toThrow("Invalid reference path");
  });

  it("referencePath() returns valid paths unchanged", () => {
    expect(referencePath("agents/references/editorial-brief.md")).toBe("agents/references/editorial-brief.md");
  });
});

describe("prompt assembly", () => {
  const agent = readAgentConfig();
  const skills: Record<string, string> = {
    "wolven-voice": readSkill("wolven-voice"),
    "linkedin-format": readSkill("linkedin-format"),
  };

  it("system prompt includes both skill files and the output schema example", () => {
    const prompt = assembleSystemPrompt(agent, skills);
    expect(prompt).toContain("wolven-voice");
    expect(prompt).toContain("linkedin-format");
    expect(prompt).toContain("Wolven voice");
    expect(prompt).toContain("Workflow");
    expect(prompt).toContain("## Output");
    expect(prompt).toContain("deliverable_markdown");
    expect(prompt).toContain("blocker question, three angle options, or the selected final English LinkedIn post");
  });

  it("user message includes task title, description, and critérios", () => {
    const message = assembleUserMessage(HARDCODED_CALL_AGENT_INPUT);
    for (const field of ["task_title", "task_description", "criterios_de_aceite"] as const) {
      expect(message).toContain(HARDCODED_CALL_AGENT_INPUT[field].split("\n")[0]);
    }
  });

  it("keeps revision markdown in task_description while system prompt includes linkedin-format guidance", () => {
    const revisionInput: CallAgentInput = {
      ...HARDCODED_CALL_AGENT_INPUT,
      task_description: REVISION_TASK_DESCRIPTION,
    };

    const systemPrompt = assembleSystemPrompt(agent, skills);
    const userMessage = assembleUserMessage(revisionInput);

    expect(systemPrompt).toContain("linkedin-format");
    expect(systemPrompt).toContain("Revision mode");
    expect(systemPrompt).toContain("~10 comments");
    expect(userMessage).toContain("# Original Brief");
    expect(userMessage).toContain("# Revision Feedback (Comment Thread)");
    expect(userMessage).toContain("# Revision Instructions");
    expect(userMessage).toContain("revision round 1 of 2");
  });

  it("pairSkillContentsFromFetch maps GitHub file responses back to Parse Agent Config skills by index", () => {
    const parseItems = [
      { skill: "wolven-voice" },
      { skill: "linkedin-format" },
    ];
    const fetchItems = [
      githubFilePayload(readSkill("wolven-voice")),
      githubFilePayload(readSkill("linkedin-format")),
    ];
    const contents = pairSkillContentsFromFetch(parseItems, fetchItems);
    expect(Object.keys(contents).sort()).toEqual(["linkedin-format", "wolven-voice"]);
    expect(assembleSystemPrompt(agent, contents)).toContain("Wolven voice");
  });

  it("githubFetchPaths returns the agent config path and every skill path for linkedin-writer", () => {
    const paths = githubFetchPaths(agent);
    expect(paths).toContain("agents/linkedin-writer.json");
    expect(paths).toContain("agents/skills/wolven-voice.md");
    expect(paths).toContain("agents/skills/linkedin-format.md");
  });

  it("githubFetchPaths includes reference paths for staged configs with references", () => {
    const stagedAgent: typeof agent = {
      id: "investigate-agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["wolven-voice", "investigative-brief"],
      references: ["agents/references/editorial-brief.md", "agents/references/example-brief.md"],
      output_schema: {
        deliverable_markdown: "Example",
        resumo: "Summary",
        autochecagem: "Validation",
      },
    };
    const paths = githubFetchPaths(stagedAgent);
    expect(paths).toContain("agents/investigate-agent.json");
    expect(paths).toContain("agents/skills/wolven-voice.md");
    expect(paths).toContain("agents/skills/investigative-brief.md");
    expect(paths).toContain("agents/references/editorial-brief.md");
    expect(paths).toContain("agents/references/example-brief.md");
  });

  it("githubFetchPaths handles legacy config without references", () => {
    const legacyAgent = readAgentConfig();
    const paths = githubFetchPaths(legacyAgent);
    expect(paths).toContain("agents/linkedin-writer.json");
    expect(paths).toContain("agents/skills/wolven-voice.md");
    expect(paths).toContain("agents/skills/linkedin-format.md");
    expect(paths.length).toBe(3);
  });

  it("pairReferenceContentsFromFetch maps GitHub file responses back to references by index", () => {
    const parseItems = [
      { reference: "agents/references/editorial-brief.md" },
      { reference: "agents/references/example-brief.md" },
    ];
    const briefContent = "## Editorial Brief\n\nThis is a sample brief template.";
    const exampleContent = "## Example Brief\n\nAnother example for reference.";
    const fetchItems = [
      githubFilePayload(briefContent),
      githubFilePayload(exampleContent),
    ];
    const contents = pairReferenceContentsFromFetch(parseItems, fetchItems);
    expect(Object.keys(contents).sort()).toEqual([
      "agents/references/editorial-brief.md",
      "agents/references/example-brief.md",
    ]);
    expect(contents["agents/references/editorial-brief.md"]).toBe(briefContent);
    expect(contents["agents/references/example-brief.md"]).toBe(exampleContent);
  });

  it("pairReferenceContentsFromFetch skips items without reference keys", () => {
    const parseItems = [
      { reference: "agents/references/brief.md" },
      { other_field: "value" },
    ];
    const fetchItems = [
      githubFilePayload("Content 1"),
      githubFilePayload("Content 2"),
    ];
    const contents = pairReferenceContentsFromFetch(parseItems, fetchItems);
    expect(Object.keys(contents)).toEqual(["agents/references/brief.md"]);
  });

  it("githubFetchPaths returns paths in order: config, skills, references", () => {
    const stagedAgent: typeof agent = {
      id: "investigate-agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["wolven-voice", "investigative-brief"],
      references: ["agents/references/editorial-brief.md", "agents/references/example-brief.md"],
      output_schema: {
        deliverable_markdown: "Example",
        resumo: "Summary",
        autochecagem: "Validation",
      },
    };
    const paths = githubFetchPaths(stagedAgent);
    expect(paths[0]).toBe("agents/investigate-agent.json");
    expect(paths[1]).toBe("agents/skills/wolven-voice.md");
    expect(paths[2]).toBe("agents/skills/investigative-brief.md");
    expect(paths[3]).toBe("agents/references/editorial-brief.md");
    expect(paths[4]).toBe("agents/references/example-brief.md");
  });

  it("githubFetchPaths throws when references contain invalid paths", () => {
    const badAgent: typeof agent = {
      id: "bad-agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: [],
      references: ["../evil.md"],
      output_schema: {
        deliverable_markdown: "Example",
        resumo: "Summary",
        autochecagem: "Validation",
      },
    };
    expect(() => githubFetchPaths(badAgent)).toThrow("Invalid reference path");
  });

  it("decodeGithubFileContent round-trips base64-encoded file content", () => {
    const payload = githubFilePayload(JSON.stringify(agent));
    const decoded = decodeGithubFileContent(payload);
    expect(JSON.parse(decoded).id).toBe("linkedin-writer");
  });

  it("decodeGithubFileContent throws when content is missing", () => {
    expect(() => decodeGithubFileContent({})).toThrow("GitHub file response missing base64 content");
  });

  it("normalizes openai model ids", () => {
    expect(openaiModelId("gpt-4.1-mini")).toBe("gpt-4.1-mini");
    expect(openaiModelId("models/gpt-4.1-mini")).toBe("gpt-4.1-mini");
  });

  it("routes openai and legacy google providers", () => {
    expect(providerIsOpenAI("openai")).toBe(true);
    expect(providerIsRouted("openai")).toBe(true);
    expect(providerIsRouted("google")).toBe(true);
    expect(providerIsRouted("anthropic")).toBe(false);
  });

  it("assembleSystemPrompt includes reference section when references are provided", () => {
    const stagedAgent: typeof agent = {
      id: "investigate-agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["wolven-voice"],
      references: ["agents/references/editorial-brief.md"],
      output_schema: {
        deliverable_markdown: "Brief findings in markdown",
        resumo: "Summary of findings",
        autochecagem: "Self-check validation",
      },
    };

    const referenceContent = "## Editorial Brief Template\n\nThis is how to format a brief.";
    const skillContent = readSkill("wolven-voice");
    const skillContents = { "wolven-voice": skillContent };
    const referenceContents = { "agents/references/editorial-brief.md": referenceContent };

    const prompt = assembleSystemPrompt(stagedAgent, skillContents, referenceContents);

    expect(prompt).toContain("# References");
    expect(prompt).toContain("## Reference: agents/references/editorial-brief.md");
    expect(prompt).toContain("Editorial Brief Template");
    expect(prompt).toContain("# Skills");
    expect(prompt).toContain("wolven-voice");
    expect(prompt).toContain("Required Output Format");
  });

  it("assembleSystemPrompt omits reference section when no references are provided", () => {
    const agent = readAgentConfig();
    const skillContents = {
      "wolven-voice": readSkill("wolven-voice"),
      "linkedin-format": readSkill("linkedin-format"),
    };

    const prompt = assembleSystemPrompt(agent, skillContents);

    expect(prompt).not.toContain("# References");
    expect(prompt).toContain("# Skills");
    expect(prompt).toContain("Required Output Format");
  });

  it("assembleSystemPrompt omits reference section when references array is empty", () => {
    const stagedAgent: typeof agent = {
      id: "test-agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["wolven-voice"],
      references: [],
      output_schema: {
        deliverable_markdown: "Example",
        resumo: "Summary",
        autochecagem: "Validation",
      },
    };

    const skillContents = { "wolven-voice": readSkill("wolven-voice") };

    const prompt = assembleSystemPrompt(stagedAgent, skillContents, {});

    expect(prompt).not.toContain("# References");
    expect(prompt).toContain("# Skills");
  });

  it("assembleSystemPrompt preserves required JSON-only output instructions with references", () => {
    const stagedAgent: typeof agent = {
      id: "investigate-agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["wolven-voice"],
      references: ["agents/references/editorial-brief.md"],
      output_schema: {
        deliverable_markdown: "Brief findings",
        resumo: "Summary",
        autochecagem: "Validation",
      },
    };

    const skillContents = { "wolven-voice": readSkill("wolven-voice") };
    const referenceContents = { "agents/references/editorial-brief.md": "Template" };

    const prompt = assembleSystemPrompt(stagedAgent, skillContents, referenceContents);

    expect(prompt).toContain("# Required Output Format");
    expect(prompt).toContain("Respond with JSON only");
    expect(prompt).toContain("Do not wrap the JSON in markdown code fences");
    expect(prompt).toContain("deliverable_markdown");
    expect(prompt).toContain("resumo");
    expect(prompt).toContain("autochecagem");
  });

  it("assembleSystemPrompt includes multiple references in order", () => {
    const stagedAgent: typeof agent = {
      id: "multi-ref-agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["wolven-voice"],
      references: [
        "agents/references/editorial-brief.md",
        "agents/references/example-brief.md",
        "agents/references/formatting-guide.md",
      ],
      output_schema: {
        deliverable_markdown: "Example",
        resumo: "Summary",
        autochecagem: "Validation",
      },
    };

    const skillContents = { "wolven-voice": readSkill("wolven-voice") };
    const referenceContents = {
      "agents/references/editorial-brief.md": "## Brief Template\n\nFirst reference content",
      "agents/references/example-brief.md": "## Example\n\nSecond reference content",
      "agents/references/formatting-guide.md": "## Format\n\nThird reference content",
    };

    const prompt = assembleSystemPrompt(stagedAgent, skillContents, referenceContents);

    const refIndex = prompt.indexOf("# References");
    const brief1Index = prompt.indexOf("editorial-brief.md");
    const brief2Index = prompt.indexOf("example-brief.md");
    const formatIndex = prompt.indexOf("formatting-guide.md");

    expect(refIndex).toBeGreaterThan(0);
    expect(brief1Index).toBeGreaterThan(refIndex);
    expect(brief2Index).toBeGreaterThan(brief1Index);
    expect(formatIndex).toBeGreaterThan(brief2Index);
  });
});

describe("buildCallAgentWorkflow (sub-workflow topology)", () => {
  const workflow = buildCallAgentWorkflow();
  const nodesByName = new Map<string, N8nNode>(workflow.nodes.map((node) => [node.name, node]));

  it("is not a placeholder stub", () => {
    expect(workflow).not.toHaveProperty("_comment");
    expect(workflow.nodes.length).toBeGreaterThan(0);
  });

  it("contains the Execute Workflow trigger and OpenAI node types", () => {
    const nodeTypes = new Set(workflow.nodes.map((node) => node.type));
    for (const expected of [
      "n8n-nodes-base.executeWorkflowTrigger",
      "n8n-nodes-base.manualTrigger",
      "n8n-nodes-base.github",
      "n8n-nodes-base.merge",
      "@n8n/n8n-nodes-langchain.openAi",
      "n8n-nodes-base.code",
      "n8n-nodes-base.if",
    ]) {
      expect(nodeTypes.has(expected)).toBe(true);
    }
  });

  it("github nodes fetch the agent config and skill/reference paths, with retry configured", () => {
    const githubNodes = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.github");
    expect(githubNodes).toHaveLength(2);
    const filePaths = githubNodes.map((node) => String((node.parameters as { filePath?: string }).filePath ?? ""));
    expect(filePaths.join(" ")).toContain("agent_id");
    expect(filePaths.join(" ")).toContain("path");
    for (const node of githubNodes) {
      expect(node.retryOnFail).toBe(true);
      expect(node.maxTries).toBe(2);
    }
  });

  it("GPT node sends instructions, user message, and maxTokens", () => {
    const gpt = nodesByName.get(GPT_NODE_NAME);
    const params = gpt?.parameters as {
      resource?: string;
      operation?: string;
      simplify?: boolean;
      modelId?: { value?: string };
      responses?: { values?: Array<{ content?: string; role?: string; type?: string }> };
      options?: { instructions?: string; maxTokens?: string };
    };
    expect(params.resource).toBeUndefined();
    expect(params.operation).toBeUndefined();
    expect(params.simplify).toBeUndefined();
    expect(params.modelId?.value).toContain("gpt-4.1-mini");
    expect(params.options?.instructions).toContain("system_prompt");
    expect(params.responses?.values?.[0]?.content).toContain("user_message");
    expect(params.responses?.values?.[0]?.role).toBeUndefined();
    expect(params.responses?.values?.[0]?.type).toBeUndefined();
    expect(params.options?.maxTokens).toContain("max_output_tokens");
  });

  it("Route Provider accepts openai and legacy google", () => {
    const route = nodesByName.get("Route Provider");
    const conditions = (route?.parameters as { conditions?: { combinator?: string; conditions?: Array<{ rightValue?: string }> } })
      ?.conditions;
    expect(conditions?.combinator).toBe("or");
    const values = (conditions?.conditions ?? []).map((c) => c.rightValue).sort();
    expect(values).toEqual(["google", "openai"]);
  });

  it("Parse Agent Output node uses the staged-aware parser dispatcher", () => {
    const parseNode = nodesByName.get("Parse Agent Output");
    const code = String((parseNode?.parameters as { jsCode?: string }).jsCode ?? "");
    // Dispatcher includes both legacy and staged validation
    for (const key of REQUIRED_OUTPUT_KEYS) {
      expect(code).toContain(key);
    }
    for (const key of REQUIRED_STAGE_OUTPUT_KEYS) {
      expect(code).toContain(key);
    }
    // Dispatcher checks output_schema.stage to decide which parser to use
    expect(code).toContain("isStaged");
    expect(code).toContain("output_schema");
    expect(code).toContain("stage");
    expect(code).toContain("REQUIRED_STAGE_KEYS");
    expect(code).toContain("if (isStaged)");
  });

  it("pins a hardcoded test input for isolation runs", () => {
    const hardcoded = nodesByName.get("Hardcoded Test Input");
    const payload = JSON.parse(String((hardcoded?.parameters as { jsonOutput?: string }).jsonOutput ?? "{}"));
    expect(payload.agent_id).toBe("linkedin-writer");
    const pin = (workflow.pinData as Record<string, Array<{ json: { agent_id: string } }>>)["When Executed by Another Workflow"];
    expect(pin?.[0]?.json.agent_id).toBe("linkedin-writer");
  });

  it("re-imports without structural errors: every node and connection target is well-formed", () => {
    for (const node of workflow.nodes) {
      expect(node.name).toBeTruthy();
      expect(node.type).toBeTruthy();
      expect(node.parameters).toBeDefined();
      expect(node.position).toBeDefined();
    }
    for (const [source, outputs] of Object.entries(workflow.connections)) {
      expect(nodesByName.has(source)).toBe(true);
      for (const branch of outputs.main) {
        for (const link of branch) {
          expect(nodesByName.has(link.node)).toBe(true);
        }
      }
    }
  });

  it("routes unsupported providers to an error envelope", () => {
    const errorNode = nodesByName.get("Unsupported Provider Error");
    const code = String((errorNode?.parameters as { jsCode?: string }).jsCode ?? "");
    expect(code).toContain("error");
    expect(code).toContain("raw_response");
  });

  it("runs with no environment variables set (offline, no network access)", () => {
    const restore = { ...process.env };
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    try {
      expect(() => buildCallAgentWorkflow()).not.toThrow();
    } finally {
      process.env = restore;
    }
  });
});

describe("generated parser dispatcher (parseCallAgentOutputJs)", () => {
  it("dispatches to staged parser for staged agent configs (stage field in output_schema)", () => {
    const stagedAgent = readStagedAgentConfig();

    const validStagedOutput = {
      stage: "investigate",
      artifact_markdown: "## Brief\n\nKey findings from research.",
      resumo: "Summary of brief findings.",
      self_check: "- All research documented\n- Key insights highlighted",
      next_gate: "brief review",
    };

    const result = parseCallAgentOutput(stagedAgent, JSON.stringify(validStagedOutput));
    expect(!isStageError(result)).toBe(true);
    if (!isStageError(result)) {
      expect(result.stage).toBe("investigate");
      expect(result.artifact_markdown).toBe(validStagedOutput.artifact_markdown);
      expect(result.next_gate).toBe("brief review");
    }
  });

  it("dispatches to legacy parser for legacy agent configs (no stage field in output_schema)", () => {
    const legacyAgent = readAgentConfig();
    const validLegacyOutput = {
      deliverable_markdown: "## Hook\n\nWe shipped a new dashboard.",
      resumo: "Summary of the dashboard launch post.",
      autochecagem: "- Dashboard mentioned\n- Sign-up CTA present",
    };

    const result = parseCallAgentOutput(legacyAgent, JSON.stringify(validLegacyOutput));
    expect(isAgentError(result)).toBe(false);
    if (!isAgentError(result)) {
      expect(result.deliverable_markdown).toBe(validLegacyOutput.deliverable_markdown);
      expect(result.resumo).toBe(validLegacyOutput.resumo);
      expect("stage" in result).toBe(false);
    }
  });

  it("rejects staged output missing artifact_markdown", () => {
    const stagedAgent = readStagedAgentConfig();

    const invalidStagedOutput = {
      stage: "investigate",
      artifact_markdown: "",
      resumo: "Summary of brief findings.",
      self_check: "- All research documented",
      next_gate: "brief review",
    };

    const result = parseCallAgentOutput(stagedAgent, JSON.stringify(invalidStagedOutput));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("artifact_markdown");
    }
  });

  it("rejects staged output with wrong next_gate for the stage", () => {
    const stagedAgent = readStagedAgentConfig();

    const invalidNextGate = {
      stage: "investigate",
      artifact_markdown: "## Brief\n\nKey findings.",
      resumo: "Summary of findings.",
      self_check: "- Complete",
      next_gate: "content review",
    };

    const result = parseCallAgentOutput(stagedAgent, JSON.stringify(invalidNextGate));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("next_gate");
      expect(result.error).toContain("brief review");
    }
  });

  it("accepts valid legacy output even with extra fields", () => {
    const legacyAgent = readAgentConfig();
    const validLegacyWithExtra = {
      deliverable_markdown: "## Hook\n\nWe shipped a new dashboard.",
      resumo: "Summary of the dashboard launch post.",
      autochecagem: "- Dashboard mentioned\n- Sign-up CTA present",
      extra_field: "should be ignored",
    };

    const result = parseCallAgentOutput(legacyAgent, JSON.stringify(validLegacyWithExtra));
    expect(isAgentError(result)).toBe(false);
    if (!isAgentError(result)) {
      expect(result.deliverable_markdown).toBe(validLegacyWithExtra.deliverable_markdown);
      expect("extra_field" in result).toBe(false);
    }
  });
});

describe("end-to-end prompt assembly + parse", () => {
  it("assembles prompts from local agent files and parses SAMPLE_VALID_LLM_OUTPUT", () => {
    const agent = readAgentConfig();
    const skills: Record<string, string> = {};
    for (const name of agent.skills) {
      skills[name] = readSkill(name);
    }

    const systemPrompt = assembleSystemPrompt(agent, skills);
    const userMessage = assembleUserMessage(HARDCODED_CALL_AGENT_INPUT);
    expect(systemPrompt.length).toBeGreaterThan(200);
    expect(userMessage.length).toBeGreaterThan(50);

    const simulated = parseAgentOutput(JSON.stringify(SAMPLE_VALID_LLM_OUTPUT));
    expect(isAgentError(simulated)).toBe(false);
    if (!isAgentError(simulated)) {
      for (const key of REQUIRED_OUTPUT_KEYS) {
        expect(simulated[key].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("assembles prompts with references for staged agent configs", () => {
    const stagedAgent: typeof agent = {
      id: "investigate-agent",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["wolven-voice"],
      references: ["agents/references/editorial-brief.md"],
      output_schema: {
        deliverable_markdown: "Brief findings",
        resumo: "Summary",
        autochecagem: "Validation",
      },
    };

    const skillContent = readSkill("wolven-voice");
    const referenceContent = "## Editorial Brief Template\n\nStructure a brief with angles, evidence, and key findings.";

    const systemPrompt = assembleSystemPrompt(
      stagedAgent,
      { "wolven-voice": skillContent },
      { "agents/references/editorial-brief.md": referenceContent }
    );

    expect(systemPrompt).toContain("# Agent Role");
    expect(systemPrompt).toContain("# Skills");
    expect(systemPrompt).toContain("# References");
    expect(systemPrompt).toContain("# Required Output Format");
    expect(systemPrompt).toContain("Editorial Brief Template");
    expect(systemPrompt.length).toBeGreaterThan(300);
  });

  it("assembles Format stage agent prompts with LinkedIn structure reference", () => {
    const formatAgentPath = resolve(REPO_ROOT, "agents", "linkedin-format.json");
    const formatAgent = JSON.parse(readFileSync(formatAgentPath, "utf-8")) as AgentConfig;

    const skillContent = readSkill("wolven-voice");
    const linkedinFormatSkill = readSkill("linkedin-format");
    const linkedinStructureRef = readFileSync(resolve(REPO_ROOT, "agents", "references", "linkedin-structure.md"), "utf-8");

    const systemPrompt = assembleSystemPrompt(
      formatAgent,
      { "wolven-voice": skillContent, "linkedin-format": linkedinFormatSkill },
      { "agents/references/linkedin-structure.md": linkedinStructureRef }
    );

    expect(systemPrompt).toContain("# Agent Role");
    expect(systemPrompt).toContain("# Skills");
    expect(systemPrompt).toContain("# References");
    expect(systemPrompt).toContain("LinkedIn Post Structure");
    expect(systemPrompt).toContain("Hook");
    expect(systemPrompt).toContain("Formatting Guidance");
    expect(systemPrompt.length).toBeGreaterThan(400);
  });

  it("reads and verifies linkedin-format agent references resolve correctly", () => {
    const formatAgentPath = resolve(REPO_ROOT, "agents", "linkedin-format.json");
    const formatAgent = JSON.parse(readFileSync(formatAgentPath, "utf-8")) as AgentConfig;

    expect(formatAgent.references).toBeDefined();
    expect(Array.isArray(formatAgent.references)).toBe(true);
    if (formatAgent.references) {
      for (const ref of formatAgent.references) {
        const fullPath = resolve(REPO_ROOT, ref);
        expect(existsSync(fullPath)).toBe(true);
      }
    }
  });
});

describe("staged prompt and parser output parity (ADR-011)", () => {
  const stagedAgentIds = ["investigative-brief", "long-form-argument", "linkedin-format"] as const;

  it("staged agent system prompts include all required staged output keys in the output schema example", () => {
    for (const agentId of stagedAgentIds) {
      const agentPath = resolve(REPO_ROOT, "agents", `${agentId}.json`);
      const agent = JSON.parse(readFileSync(agentPath, "utf-8")) as AgentConfig;
      const skillContent = readSkill("wolven-voice");
      const secondarySkillName = agentId.includes("investigative") ? "investigative-brief" : agentId.includes("long-form") ? "long-form-argument" : "linkedin-format";
      const secondarySkill = readSkill(secondarySkillName);

      const systemPrompt = assembleSystemPrompt(
        agent,
        { "wolven-voice": skillContent, [secondarySkillName]: secondarySkill }
      );

      // Verify prompt includes staged keys
      for (const key of REQUIRED_STAGE_OUTPUT_KEYS) {
        expect(systemPrompt, `${agentId} prompt should include staged key: ${key}`).toContain(key);
      }
    }
  });

  it("staged agent system prompts do not mention legacy-only keys: deliverable_markdown or autochecagem", () => {
    for (const agentId of stagedAgentIds) {
      const agentPath = resolve(REPO_ROOT, "agents", `${agentId}.json`);
      const agent = JSON.parse(readFileSync(agentPath, "utf-8")) as AgentConfig;
      const skillContent = readSkill("wolven-voice");
      const secondarySkillName = agentId.includes("investigative") ? "investigative-brief" : agentId.includes("long-form") ? "long-form-argument" : "linkedin-format";
      const secondarySkill = readSkill(secondarySkillName);

      const systemPrompt = assembleSystemPrompt(
        agent,
        { "wolven-voice": skillContent, [secondarySkillName]: secondarySkill }
      );

      // Staged prompts should not suggest legacy output keys
      expect(systemPrompt, `${agentId} prompt should not include legacy key: deliverable_markdown`).not.toContain('"deliverable_markdown"');
      expect(systemPrompt, `${agentId} prompt should not include legacy key: autochecagem`).not.toContain('"autochecagem"');
    }
  });

  it("investigative-brief prompt output schema includes stage: investigate", () => {
    const agent = readStagedAgentConfig();
    const skillContent = readSkill("wolven-voice");
    const investigativeBriefSkill = readSkill("investigative-brief");

    const systemPrompt = assembleSystemPrompt(
      agent,
      { "wolven-voice": skillContent, "investigative-brief": investigativeBriefSkill }
    );

    expect(systemPrompt).toContain('"stage": "investigate"');
  });

  it("long-form-argument prompt output schema includes stage: write", () => {
    const agentPath = resolve(REPO_ROOT, "agents", "long-form-argument.json");
    const agent = JSON.parse(readFileSync(agentPath, "utf-8")) as AgentConfig;
    const skillContent = readSkill("wolven-voice");
    const longFormSkill = readSkill("long-form-argument");

    const systemPrompt = assembleSystemPrompt(
      agent,
      { "wolven-voice": skillContent, "long-form-argument": longFormSkill }
    );

    expect(systemPrompt).toContain('"stage": "write"');
  });

  it("linkedin-format prompt output schema includes stage: format", () => {
    const agentPath = resolve(REPO_ROOT, "agents", "linkedin-format.json");
    const agent = JSON.parse(readFileSync(agentPath, "utf-8")) as AgentConfig;
    const skillContent = readSkill("wolven-voice");
    const formatSkill = readSkill("linkedin-format");

    const systemPrompt = assembleSystemPrompt(
      agent,
      { "wolven-voice": skillContent, "linkedin-format": formatSkill }
    );

    expect(systemPrompt).toContain('"stage": "format"');
  });

  it("legacy linkedin-writer system prompt still includes legacy-only keys", () => {
    const agent = readAgentConfig();
    const skillContent = readSkill("wolven-voice");
    const formatSkill = readSkill("linkedin-format");

    const systemPrompt = assembleSystemPrompt(
      agent,
      { "wolven-voice": skillContent, "linkedin-format": formatSkill }
    );

    expect(systemPrompt, "legacy agent prompt should include deliverable_markdown").toContain('"deliverable_markdown"');
    expect(systemPrompt, "legacy agent prompt should include autochecagem").toContain('"autochecagem"');
    expect(systemPrompt, "legacy agent prompt should NOT include staged key stage").not.toContain('"stage"');
  });

  it("parseCallAgentOutput returns StageParsedResult (with next_gate) for staged agent output", () => {
    const stagedAgent = readStagedAgentConfig();
    const stagedOutput = {
      stage: "investigate",
      artifact_markdown: "## Brief\n\nFindings.",
      resumo: "Summary of findings.",
      self_check: "- Research documented",
      next_gate: "brief review",
    };

    const result = parseCallAgentOutput(stagedAgent, JSON.stringify(stagedOutput));

    expect(isStageError(result)).toBe(false);
    if (!isStageError(result)) {
      expect(result).toHaveProperty("stage");
      expect(result).toHaveProperty("artifact_markdown");
      expect(result).toHaveProperty("self_check");
      expect(result).toHaveProperty("next_gate");
      expect("deliverable_markdown" in result).toBe(false);
      expect("autochecagem" in result).toBe(false);
    }
  });

  it("parseCallAgentOutput returns ParseResult (with deliverable_markdown, no next_gate) for legacy agent output", () => {
    const legacyAgent = readAgentConfig();
    const legacyOutput = {
      deliverable_markdown: "## LinkedIn Post\n\nContent.",
      resumo: "Summary.",
      autochecagem: "- Facts verified",
    };

    const result = parseCallAgentOutput(legacyAgent, JSON.stringify(legacyOutput));

    expect(isAgentError(result)).toBe(false);
    if (!isAgentError(result)) {
      expect(result).toHaveProperty("deliverable_markdown");
      expect(result).toHaveProperty("resumo");
      expect(result).toHaveProperty("autochecagem");
      expect("stage" in result).toBe(false);
      expect("artifact_markdown" in result).toBe(false);
      expect("next_gate" in result).toBe(false);
    }
  });

  it("rejects staged agent output missing artifact_markdown with descriptive error", () => {
    const stagedAgent = readStagedAgentConfig();
    const invalidOutput = {
      stage: "investigate",
      resumo: "Summary.",
      self_check: "Checks.",
      next_gate: "brief review",
      // Missing artifact_markdown
    };

    const result = parseStageOutput(JSON.stringify(invalidOutput));

    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("artifact_markdown");
    }
  });

  it("rejects staged agent output missing self_check with descriptive error", () => {
    const stagedAgent = readStagedAgentConfig();
    const invalidOutput = {
      stage: "investigate",
      artifact_markdown: "Brief.",
      resumo: "Summary.",
      next_gate: "brief review",
      // Missing self_check
    };

    const result = parseStageOutput(JSON.stringify(invalidOutput));

    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("self_check");
    }
  });

  it("validates that staged output contract cannot drift back to legacy keys", () => {
    const stagedAgent = readStagedAgentConfig();
    // Attempt to pass legacy output to a staged agent
    const legacyOutput = {
      deliverable_markdown: "## Brief\n\nContent.",
      resumo: "Summary.",
      autochecagem: "- Checks",
    };

    const result = parseCallAgentOutput(stagedAgent, JSON.stringify(legacyOutput));

    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toMatch(/stage|artifact_markdown|self_check|next_gate/i);
    }
  });
});
