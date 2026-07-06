import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_STAGE_OUTPUT_KEYS,
  assembleSystemPrompt,
  assembleUserMessage,
  buildStructuredLog,
  decodeGithubFileContent,
  extractOpenAIText,
  githubFetchPaths,
  isValidReferencePath,
  openaiModelId,
  pairReferenceContentsFromFetch,
  pairSkillContentsFromFetch,
  parseCallAgentOutput,
  parseStageOutput,
  providerIsOpenAI,
  providerIsRouted,
  referencePath,
} from "./logic.js";
import type { AgentConfig } from "../types/agent-config.js";
import type { CallAgentInput } from "../types/call-agent-io.js";
import { isStageError } from "../types/call-agent-io.js";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SKILLS_DIR = resolve(REPO_ROOT, "agents", "skills");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function readStageAgentConfig(agentId: "investigative-brief" | "long-form-argument" | "linkedin-format"): AgentConfig {
  return readJson<AgentConfig>(resolve(REPO_ROOT, "agents", `${agentId}.json`));
}

function readSkill(name: string): string {
  return readFileSync(resolve(SKILLS_DIR, `${name}.md`), "utf-8");
}

function githubFilePayload(text: string): { content: string; encoding: string } {
  return { content: Buffer.from(text, "utf-8").toString("base64"), encoding: "base64" };
}

describe("parseStageOutput", () => {
  const validOutput = {
    stage: "investigate",
    artifact_markdown: "## Brief\n\nKey findings from research.",
    resumo: "Summary of brief findings.",
    self_check: "- All research documented\n- Key insights highlighted",
    next_gate: "brief review",
  };

  it("produces a StageAgentOutput with all required keys for valid JSON", () => {
    const result = parseStageOutput(JSON.stringify(validOutput));
    expect(isStageError(result)).toBe(false);
    if (!isStageError(result)) {
      expect(Object.keys(result).sort()).toEqual([...REQUIRED_STAGE_OUTPUT_KEYS].sort());
    }
  });

  it("accepts blocker_question when present", () => {
    const result = parseStageOutput(
      JSON.stringify({
        ...validOutput,
        blocker_question: "Can you provide more source detail?",
      })
    );
    expect(isStageError(result)).toBe(false);
    if (!isStageError(result)) {
      expect(result.blocker_question).toBe("Can you provide more source detail?");
    }
  });

  it("rejects unknown stage", () => {
    const result = parseStageOutput(JSON.stringify({ ...validOutput, stage: "unknown" }));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("Unknown stage");
    }
  });

  it("rejects mismatched next_gate", () => {
    const result = parseStageOutput(JSON.stringify({ ...validOutput, next_gate: "content review" }));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("next_gate");
      expect(result.error).toContain("brief review");
    }
  });

  it("returns an error envelope for malformed JSON", () => {
    const result = parseStageOutput("not-json-at-all");
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.raw_response).toBe("not-json-at-all");
    }
  });

  it("returns an error envelope for missing required keys", () => {
    const result = parseStageOutput(JSON.stringify({ stage: "investigate", resumo: "Summary" }));
    expect(isStageError(result)).toBe(true);
    if (isStageError(result)) {
      expect(result.error).toContain("artifact_markdown");
    }
  });
});

describe("parseCallAgentOutput", () => {
  const agent = readStageAgentConfig("investigative-brief");

  it("parses staged output for a staged agent config", () => {
    const result = parseCallAgentOutput(
      agent,
      JSON.stringify({
        stage: "investigate",
        artifact_markdown: "## Brief\n\nKey findings from research.",
        resumo: "Summary of brief findings.",
        self_check: "- All research documented",
        next_gate: "brief review",
      })
    );
    expect(isStageError(result)).toBe(false);
  });

  it("returns an error envelope for malformed JSON", () => {
    const result = parseCallAgentOutput(agent, "not json");
    expect(isStageError(result)).toBe(true);
  });
});

describe("extractOpenAIText", () => {
  const sampleJson = JSON.stringify({
    stage: "investigate",
    artifact_markdown: "## Brief",
    resumo: "Summary",
    self_check: "- Check",
    next_gate: "brief review",
  });

  it("extracts text from OpenAI responses output", () => {
    const response = {
      output: [{ type: "message", content: [{ type: "output_text", text: sampleJson }] }],
    };
    expect(extractOpenAIText(response)).toBe(sampleJson);
  });

  it("extracts text from chat completions output", () => {
    const response = { choices: [{ message: { content: sampleJson } }] };
    expect(extractOpenAIText(response)).toBe(sampleJson);
  });

  it("falls back to text/message keys", () => {
    expect(extractOpenAIText({ text: "plain text" })).toBe("plain text");
    expect(extractOpenAIText({ message: "message text" })).toBe("message text");
  });
});

describe("assembleSystemPrompt", () => {
  const agent = readStageAgentConfig("investigative-brief");

  it("includes stage references and stage-only output schema", () => {
    const prompt = assembleSystemPrompt(
      agent,
      {
        "wolven-voice": readSkill("wolven-voice"),
        "investigative-brief": readSkill("investigative-brief"),
      },
      { "agents/references/editorial-brief.md": "## Editorial Brief\n\nTemplate content." }
    );

    expect(prompt).toContain("# Agent Role");
    expect(prompt).toContain("# Skills");
    expect(prompt).toContain("# References");
    expect(prompt).toContain('"stage"');
    expect(prompt).toContain("artifact_markdown");
    expect(prompt).toContain("self_check");
    expect(prompt).toContain("next_gate");
    expect(prompt).not.toContain("deliverable_markdown");
    expect(prompt).not.toContain("autochecagem");
  });
});

describe("github fetch helpers", () => {
  const agent = readStageAgentConfig("investigative-brief");

  it("builds config, skill, and reference paths in order", () => {
    const paths = githubFetchPaths(agent);
    expect(paths[0]).toBe("agents/investigative-brief.json");
    expect(paths).toContain("agents/skills/wolven-voice.md");
    expect(paths).toContain("agents/skills/investigative-brief.md");
    expect(paths).toContain("agents/references/editorial-brief.md");
  });

  it("pairs skill contents by index", () => {
    const contents = pairSkillContentsFromFetch(
      [{ skill: "wolven-voice" }, { skill: "investigative-brief" }],
      [githubFilePayload("voice"), githubFilePayload("brief")]
    );
    expect(contents).toEqual({
      "wolven-voice": "voice",
      "investigative-brief": "brief",
    });
  });

  it("pairs reference contents by index", () => {
    const contents = pairReferenceContentsFromFetch(
      [{ reference: "agents/references/editorial-brief.md" }],
      [githubFilePayload("reference")]
    );
    expect(contents["agents/references/editorial-brief.md"]).toBe("reference");
  });

  it("round-trips base64 GitHub content", () => {
    const payload = githubFilePayload(JSON.stringify(agent));
    const decoded = decodeGithubFileContent(payload);
    expect(JSON.parse(decoded).id).toBe("investigative-brief");
  });
});

describe("small helpers", () => {
  it("validates reference paths", () => {
    expect(isValidReferencePath("agents/references/editorial-brief.md")).toBe(true);
    expect(isValidReferencePath("../evil.md")).toBe(false);
    expect(() => referencePath("../evil.md")).toThrow("Invalid reference path");
  });

  it("formats user messages and structured logs", () => {
    const input: CallAgentInput = {
      agent_id: "investigative-brief",
      task_title: "Launch post",
      task_description: "Announce the feature",
      criterios_de_aceite: "- Mention the feature",
    };

    expect(assembleUserMessage(input)).toContain("# Task Title");
    expect(assembleUserMessage(input)).toContain("Launch post");

    expect(
      buildStructuredLog({
        taskId: "task-1",
        agentId: "investigative-brief",
        executionId: "exec-1",
        latencyMs: 12,
        parseSuccess: true,
      })
    ).toEqual({
      task_id: "task-1",
      agent_id: "investigative-brief",
      execution_id: "exec-1",
      latency_ms: 12,
      parse_success: true,
    });
  });

  it("normalizes model and provider values", () => {
    expect(openaiModelId("models/gpt-4.1-mini")).toBe("gpt-4.1-mini");
    expect(providerIsOpenAI("openai")).toBe(true);
    expect(providerIsRouted("openai")).toBe(true);
    expect(providerIsRouted("google")).toBe(true);
    expect(providerIsRouted("anthropic")).toBe(false);
  });
});
