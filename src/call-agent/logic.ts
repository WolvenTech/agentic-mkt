import type { AgentConfig } from "../types/agent-config.js";
import type { AgentErrorEnvelope, CallAgentInput, ParseResult, StageParsedResult, StageErrorEnvelope } from "../types/call-agent-io.js";
import { isKnownStage, getStageDefinition } from "../marketing-pipeline/stages.js";

export const REQUIRED_OUTPUT_KEYS = ["deliverable_markdown", "resumo", "autochecagem"] as const;
export const REQUIRED_STAGE_OUTPUT_KEYS = ["stage", "artifact_markdown", "resumo", "self_check", "next_gate"] as const;
export const GITHUB_REPO_OWNER = "rafiti052";
export const GITHUB_REPO_NAME = "agentic-mkt";
export const DEFAULT_PROVIDER = "openai";
export const DEFAULT_MODEL = "gpt-4.1-mini";
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

export interface StructuredLog {
  task_id: string;
  agent_id: string;
  execution_id: string;
  latency_ms: number;
  parse_success: boolean;
}

export function agentConfigPath(agentId: string): string {
  return `agents/${agentId}.json`;
}

export function skillPath(skillName: string): string {
  return `agents/skills/${skillName}.md`;
}

/** Decode a GitHub contents-API response (base64 `content` field) to UTF-8 text. */
export function decodeGithubFileContent(githubResponse: { content?: unknown }): string {
  const content = githubResponse.content;
  if (typeof content !== "string") {
    throw new Error("GitHub file response missing base64 content");
  }
  const normalized = content.replace(/\n/g, "");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

export function stripJsonFences(text: string): string {
  const stripped = text.trim();
  if (!stripped.startsWith("```")) {
    return stripped;
  }
  const lines = stripped.split("\n");
  if (lines[0]?.startsWith("```")) {
    lines.shift();
  }
  const last = lines[lines.length - 1];
  if (last !== undefined && last.trim() === "```") {
    lines.pop();
  }
  return lines.join("\n").trim();
}

/** Extract model text from an n8n OpenAI node's simplified output (Responses API v2 or Chat Completions v1). */
export function extractOpenAIText(response: Record<string, unknown>): string {
  const chunks: string[] = [];
  const output = response.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item !== null && typeof item === "object") {
        const content = (item as Record<string, unknown>).content;
        if (!Array.isArray(content)) {
          continue;
        }
        for (const block of content) {
          if (block !== null && typeof block === "object") {
            const record = block as Record<string, unknown>;
            if (record.type !== "output_text" || record.text === undefined || record.text === null) {
              continue;
            }
            if (typeof record.text === "string") {
              chunks.push(record.text);
            } else if (typeof record.text === "object") {
              chunks.push(JSON.stringify(record.text));
            }
          }
        }
      }
    }
  }
  if (chunks.length > 0) {
    return chunks.join("");
  }
  const choices = response.choices;
  if (Array.isArray(choices) && choices[0] !== null && typeof choices[0] === "object") {
    const message = (choices[0] as Record<string, unknown>).message;
    if (message !== null && typeof message === "object") {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string") {
        return content;
      }
    }
  }
  for (const key of ["text", "message"] as const) {
    const value = response[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return JSON.stringify(response);
}

function errorEnvelope(message: string, rawResponse: string): AgentErrorEnvelope {
  return { error: message, raw_response: rawResponse };
}

/** Parse LLM output into an AgentOutput, returning an error envelope on any parse/validation failure. */
export function parseAgentOutput(rawResponse: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(rawResponse));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorEnvelope(`Failed to parse AgentOutput: ${message}`, rawResponse);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return errorEnvelope("Expected JSON object", rawResponse);
  }

  const record = parsed as Record<string, unknown>;
  const missing = REQUIRED_OUTPUT_KEYS.filter((key) => !(key in record));
  if (missing.length > 0) {
    return errorEnvelope(`Missing required keys: ${missing.join(", ")}`, rawResponse);
  }

  const invalid = REQUIRED_OUTPUT_KEYS.filter((key) => {
    const value = record[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (invalid.length > 0) {
    return errorEnvelope(`Empty or non-string values for: ${invalid.join(", ")}`, rawResponse);
  }

  return {
    deliverable_markdown: record.deliverable_markdown as string,
    resumo: record.resumo as string,
    autochecagem: record.autochecagem as string,
  };
}

function stageErrorEnvelope(message: string, rawResponse: string): StageErrorEnvelope {
  return { error: message, raw_response: rawResponse };
}

/** Parse LLM output into a StageAgentOutput, returning an error envelope on any parse/validation failure. */
export function parseStageOutput(rawResponse: string): StageParsedResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(rawResponse));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return stageErrorEnvelope(`Failed to parse StageAgentOutput: ${message}`, rawResponse);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return stageErrorEnvelope("Expected JSON object", rawResponse);
  }

  const record = parsed as Record<string, unknown>;
  const missing = REQUIRED_STAGE_OUTPUT_KEYS.filter((key) => !(key in record));
  if (missing.length > 0) {
    return stageErrorEnvelope(`Missing required keys: ${missing.join(", ")}`, rawResponse);
  }

  // Validate stage is a known stage
  const stage = record.stage;
  if (!isKnownStage(stage)) {
    return stageErrorEnvelope(`Unknown stage '${String(stage)}'. Expected one of: investigate, write, format`, rawResponse);
  }

  // Get stage definition for next_gate validation
  let stageDefinition;
  try {
    stageDefinition = getStageDefinition(stage);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown stage";
    return stageErrorEnvelope(message, rawResponse);
  }

  // Validate required string fields are non-empty
  const requiredStringFields = ["artifact_markdown", "resumo", "self_check"] as const;
  const empty = requiredStringFields.filter((key) => {
    const value = record[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (empty.length > 0) {
    return stageErrorEnvelope(`Empty or non-string values for: ${empty.join(", ")}`, rawResponse);
  }

  // Validate next_gate matches stage definition
  const nextGate = record.next_gate;
  if (nextGate !== stageDefinition.next_gate) {
    return stageErrorEnvelope(
      `Invalid next_gate '${String(nextGate)}' for stage '${stage}'. Expected '${stageDefinition.next_gate}'`,
      rawResponse
    );
  }

  // Validate blocker_question if present
  const blockerQuestion = record.blocker_question;
  if (blockerQuestion !== undefined) {
    if (typeof blockerQuestion !== "string" || blockerQuestion.trim().length === 0) {
      return stageErrorEnvelope("blocker_question must be a non-empty string when present", rawResponse);
    }
  }

  return {
    stage,
    artifact_markdown: record.artifact_markdown as string,
    resumo: record.resumo as string,
    self_check: record.self_check as string,
    next_gate: nextGate as "brief review" | "content review" | "final review",
    ...(blockerQuestion ? { blocker_question: blockerQuestion as string } : {}),
  };
}

/** Merge Parse Agent Config items with GitHub fetch responses by index (n8n Merge node output shape). */
export function mergeSkillFetchItems(
  parseItems: Array<Record<string, unknown>>,
  fetchItems: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const length = Math.max(parseItems.length, fetchItems.length);
  const merged: Array<Record<string, unknown>> = [];
  for (let i = 0; i < length; i++) {
    merged.push({ ...parseItems[i], ...fetchItems[i] });
  }
  return merged;
}

/** Pair Parse Agent Config items with GitHub file responses (Fetch Skill Markdown drops context fields). */
export function pairSkillContentsFromFetch(
  parseItems: Array<{ skill?: string }>,
  fetchItems: Array<{ content?: unknown }>
): Record<string, string> {
  const skillContents: Record<string, string> = {};
  const merged = mergeSkillFetchItems(parseItems, fetchItems);
  for (const item of merged) {
    const skill = item.skill;
    if (typeof skill !== "string" || !skill) {
      continue;
    }
    skillContents[skill] = decodeGithubFileContent(item as { content?: unknown });
  }
  return skillContents;
}

/** Build system prompt from agent config, inlined skills, and an output-schema example. */
export function assembleSystemPrompt(agentConfig: AgentConfig, skillContents: Record<string, string>): string {
  const lines: string[] = [
    "# Agent Role",
    `You are the \`${agentConfig.id}\` marketing worker agent.`,
    "",
    "# Skills",
  ];

  for (const skillName of agentConfig.skills) {
    const body = (skillContents[skillName] ?? "").trim();
    lines.push(`## Skill: ${skillName}`, body, "");
  }

  const schema = agentConfig.output_schema;
  const example: Record<string, string> = {};
  for (const key of REQUIRED_OUTPUT_KEYS) {
    example[key] = schema[key];
  }

  lines.push(
    "# Required Output Format",
    "Respond with JSON only. Do not wrap the JSON in markdown code fences.",
    "Required keys and semantics:",
    JSON.stringify(example, null, 2)
  );

  return lines.join("\n").trim();
}

export function assembleUserMessage(callAgentInput: CallAgentInput): string {
  return (
    `# Task Title\n${callAgentInput.task_title}\n\n` +
    `# Task Description\n${callAgentInput.task_description}\n\n` +
    `# Critérios de Aceite\n${callAgentInput.criterios_de_aceite}`
  );
}

/** Normalize an agent model id for the n8n OpenAI node. */
export function openaiModelId(model: string): string {
  return model.replace(/^models\//, "");
}

export function providerIsOpenAI(provider: string): boolean {
  return provider.trim().toLowerCase() === "openai";
}

/** M1 routes openai and legacy google agent configs to the same OpenAI node. */
export function providerIsRouted(provider: string): boolean {
  const normalized = provider.trim().toLowerCase();
  return normalized === "openai" || normalized === "google";
}

export function buildStructuredLog(params: {
  taskId: string;
  agentId: string;
  executionId: string;
  latencyMs: number;
  parseSuccess: boolean;
}): StructuredLog {
  return {
    task_id: params.taskId,
    agent_id: params.agentId,
    execution_id: params.executionId,
    latency_ms: params.latencyMs,
    parse_success: params.parseSuccess,
  };
}

export function githubFetchPaths(agentConfig: AgentConfig): string[] {
  const paths = [agentConfigPath(agentConfig.id)];
  for (const skill of agentConfig.skills) {
    paths.push(skillPath(skill));
  }
  return paths;
}
