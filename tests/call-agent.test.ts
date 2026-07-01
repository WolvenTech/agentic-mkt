import { readFileSync } from "node:fs";
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
  pairSkillContentsFromFetch,
  parseAgentOutput,
  parseStageOutput,
  providerIsOpenAI,
  providerIsRouted,
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

describe("linkedin-format skill", () => {
  const skill = readSkill("linkedin-format");

  it("documents the C-level English LinkedIn audience and brief gates", () => {
    for (const phrase of [
      "C-level readers",
      "Accept briefs in Portuguese or English",
      "Always return the post in English",
      "communication objective",
      "central idea",
      "evidence",
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it("documents evidence blockers and no-invention rules", () => {
    for (const phrase of [
      "Treat missing evidence as a blocker",
      "Never invent handles, metrics, studies, client names, results, or causal claims",
      "What concrete evidence should carry this post",
      "Do not research it independently",
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it("documents the three-angle workflow and final-post mode", () => {
    for (const phrase of [
      "provide three short and distinct angles",
      "Core claim",
      "Evidence lens",
      "Stop and ask the user to choose one",
      "selected angle is present",
      "direct final draft",
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it("documents the three compatible output modes", () => {
    for (const phrase of ["Blocker", "Angle options", "Final post", "deliverable_markdown"]) {
      expect(skill).toContain(phrase);
    }
  });

  it("includes LinkedIn final QA checks from the DOCX source", () => {
    for (const phrase of [
      "Objective is clear",
      "one real, defensible idea",
      "Evidence is accurate, specific, and traceable",
      "No facts, results, or source details are invented",
    ]) {
      expect(skill).toContain(phrase);
    }
  });

  it("documents revision mode and the embedded task_description sections", () => {
    expect(skill).toContain("## Revision mode");
    for (const marker of ["Original Brief", "Revision Feedback", "Revision Instructions"]) {
      expect(skill).toContain(marker);
    }
  });

  it("documents ADR-005 long-thread handling around the ~10 comment threshold", () => {
    expect(skill).toContain("~10 comments");
    expect(skill).toContain("summarize older comments");
    expect(skill).toContain("latest lead feedback verbatim");
  });

  it("preserves the three-section AgentOutput contract during revision runs", () => {
    for (const key of REQUIRED_OUTPUT_KEYS) {
      expect(skill).toContain(key);
    }
    expect(skill).toContain("lead feedback");
    expect(skill).toContain("Bypass the angle-selection gate");
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
    expect(prompt).toContain("Create angles");
    expect(prompt).toContain("Output modes");
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

  it("github nodes fetch the agent config and skill markdown paths, with retry configured", () => {
    const githubNodes = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.github");
    expect(githubNodes).toHaveLength(2);
    const filePaths = githubNodes.map((node) => String((node.parameters as { filePath?: string }).filePath ?? ""));
    expect(filePaths.join(" ")).toContain("agent_id");
    expect(filePaths.join(" ")).toContain("skill_path");
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
      responses?: { values?: Array<{ content?: string; role?: string }> };
      options?: { instructions?: string; maxTokens?: string };
    };
    expect(params.resource).toBe("text");
    expect(params.operation).toBe("response");
    expect(params.simplify).toBe(true);
    expect(params.modelId?.value).toContain("gpt-4.1-mini");
    expect(params.options?.instructions).toContain("system_prompt");
    expect(params.responses?.values?.[0]?.content).toContain("user_message");
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

  it("Parse Agent Output node validates every required output key", () => {
    const parseNode = nodesByName.get("Parse Agent Output");
    const code = String((parseNode?.parameters as { jsCode?: string }).jsCode ?? "");
    for (const key of REQUIRED_OUTPUT_KEYS) {
      expect(code).toContain(key);
    }
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
});
