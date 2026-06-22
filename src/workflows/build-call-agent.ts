import { deterministicWorkflowId } from "./deterministic-id.js";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DEFAULT_TEMPERATURE,
  GITHUB_REPO_NAME,
  GITHUB_REPO_OWNER,
  REQUIRED_OUTPUT_KEYS,
  agentConfigPath,
} from "../call-agent/logic.js";
import type { CallAgentInput } from "../types/call-agent-io.js";

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  [key: string]: unknown;
}

export interface N8nWorkflowExport {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;
  pinData?: Record<string, unknown>;
  active: boolean;
  settings: Record<string, unknown>;
  versionId: string;
  meta: Record<string, unknown>;
  tags: Array<{ name: string }>;
  [key: string]: unknown;
}

const HARDCODED_TEST_INPUT: CallAgentInput = {
  agent_id: "linkedin-writer",
  task_title: "Launch post for Q3 product update",
  task_description: "Announce the new dashboard feature for marketing leads.",
  criterios_de_aceite: "- Mention the dashboard\n- CTA to sign up\n- Under 300 words",
};

const GITHUB_OWNER_PARAM = { __rl: true, mode: "name", value: GITHUB_REPO_OWNER };
const GITHUB_REPOSITORY_PARAM = { __rl: true, mode: "name", value: GITHUB_REPO_NAME };
const GITHUB_CREDENTIALS = {
  githubApi: { id: "GITHUB_CREDENTIAL_ID", name: "GitHub agentic-mkt (read-only PAT)" },
};

function storeInputContextJs(): string {
  return [
    "const item = $input.first().json;",
    "return [{",
    "  json: {",
    "    ...item,",
    "    _started_at_ms: Date.now(),",
    "    task_id: item.task_id ?? item.task_title ?? 'isolation-test',",
    "  },",
    "}];",
  ].join("\n");
}

function parseAgentConfigJs(): string {
  return [
    "const input = $('Store Input Context').first().json;",
    "const github = $input.first().json;",
    "const encoded = github.content;",
    "if (!encoded) {",
    "  return [{ json: { error: 'GitHub agent config fetch failed', raw_response: JSON.stringify(github) } }];",
    "}",
    "const decoded = Buffer.from(String(encoded).replace(/\\n/g, ''), 'base64').toString('utf8');",
    "const agentConfig = JSON.parse(decoded);",
    "const skills = Array.isArray(agentConfig.skills) ? agentConfig.skills : [];",
    "return skills.map((skill) => ({",
    "  json: {",
    "    ...input,",
    "    agent_config: agentConfig,",
    "    skill,",
    "    skill_path: `agents/skills/${skill}.md`,",
    "  },",
    "}));",
  ].join("\n");
}

function assemblePromptJs(): string {
  return [
    "const items = $input.all();",
    "const base = items[0]?.json ?? {};",
    "const agentConfig = base.agent_config;",
    "if (!agentConfig) {",
    "  return [{ json: { error: 'Missing agent_config after Merge Skill Fetch', raw_response: JSON.stringify(base) } }];",
    "}",
    "const skillContents = {};",
    "for (const item of items) {",
    "  const skill = item.json.skill;",
    "  const encoded = item.json.content;",
    "  if (!skill || !encoded) continue;",
    "  skillContents[skill] = Buffer.from(String(encoded).replace(/\\n/g, ''), 'base64').toString('utf8');",
    "}",
    `const schema = agentConfig.output_schema ?? {};`,
    "const example = {",
    `  ${REQUIRED_OUTPUT_KEYS[0]}: schema.${REQUIRED_OUTPUT_KEYS[0]} ?? 'Full LinkedIn post draft in markdown',`,
    `  ${REQUIRED_OUTPUT_KEYS[1]}: schema.${REQUIRED_OUTPUT_KEYS[1]} ?? '2-3 sentence summary of the draft',`,
    `  ${REQUIRED_OUTPUT_KEYS[2]}: schema.${REQUIRED_OUTPUT_KEYS[2]} ?? 'Bullet list validating draft against acceptance criteria',`,
    "};",
    "const skillBlocks = (agentConfig.skills ?? []).map((skill) => {",
    "  const body = (skillContents[skill] ?? '').trim();",
    "  return `## Skill: ${skill}\\n${body}`;",
    "}).join('\\n\\n');",
    "const systemPrompt = [",
    "  '# Agent Role',",
    "  `You are the \\`${agentConfig.id}\\` marketing worker agent.`,",
    "  '',",
    "  '# Skills',",
    "  skillBlocks,",
    "  '',",
    "  '# Required Output Format',",
    "  'Respond with JSON only. Do not wrap the JSON in markdown code fences.',",
    "  'Required keys and semantics:',",
    "  JSON.stringify(example, null, 2),",
    "].join('\\n');",
    "const userMessage = [",
    "  '# Task Title',",
    "  base.task_title ?? '',",
    "  '',",
    "  '# Task Description',",
    "  base.task_description ?? '',",
    "  '',",
    "  '# Critérios de Aceite',",
    "  base.criterios_de_aceite ?? '',",
    "].join('\\n');",
    "return [{",
    "  json: {",
    "    ...base,",
    "    agent_config: agentConfig,",
    "    skill_contents: skillContents,",
    "    system_prompt: systemPrompt,",
    "    user_message: userMessage,",
    `    temperature: agentConfig.temperature ?? ${DEFAULT_TEMPERATURE},`,
    `    max_output_tokens: agentConfig.max_output_tokens ?? ${DEFAULT_MAX_OUTPUT_TOKENS},`,
    `    provider: agentConfig.provider ?? '${DEFAULT_PROVIDER}',`,
    `    model: agentConfig.model ?? '${DEFAULT_MODEL}',`,
    "  },",
    "}];",
  ].join("\n");
}

function parseAgentOutputJs(): string {
  return [
    `const REQUIRED_KEYS = ${JSON.stringify([...REQUIRED_OUTPUT_KEYS])};`,
    "const startedAt = $('Store Input Context').first().json._started_at_ms ?? Date.now();",
    "const input = $('Store Input Context').first().json;",
    "const agentId = input.agent_id ?? 'unknown';",
    "const taskId = input.task_id ?? input.task_title ?? 'unknown';",
    "const executionId = $execution.id;",
    "",
    "function stripFences(text) {",
    "  const trimmed = (text ?? '').trim();",
    "  if (!trimmed.startsWith('```')) return trimmed;",
    "  const lines = trimmed.split('\\n');",
    "  if (lines[0].startsWith('```')) lines.shift();",
    "  if (lines.length && lines[lines.length - 1].trim() === '```') lines.pop();",
    "  return lines.join('\\n').trim();",
    "}",
    "",
    "function extractOpenAIText(item) {",
    "  const json = item.json ?? {};",
    "  const chunks = [];",
    "  const output = json.output;",
    "  if (Array.isArray(output)) {",
    "    for (const message of output) {",
    "      const content = message?.content;",
    "      if (!Array.isArray(content)) continue;",
    "      for (const block of content) {",
    "        if (block?.type !== 'output_text' || block.text == null) continue;",
    "        if (typeof block.text === 'string') chunks.push(block.text);",
    "        else if (typeof block.text === 'object') chunks.push(JSON.stringify(block.text));",
    "      }",
    "    }",
    "  }",
    "  if (chunks.length) return chunks.join('');",
    "  const choice = Array.isArray(json.choices) ? json.choices[0] : null;",
    "  if (choice?.message?.content && typeof choice.message.content === 'string') {",
    "    return choice.message.content;",
    "  }",
    "  for (const key of ['text', 'message']) {",
    "    if (typeof json[key] === 'string') return json[key];",
    "  }",
    "  return JSON.stringify(json);",
    "}",
    "",
    "const rawResponse = extractOpenAIText($input.first());",
    "let parseSuccess = false;",
    "let result;",
    "",
    "try {",
    "  const cleaned = stripFences(rawResponse);",
    "  const parsed = JSON.parse(cleaned);",
    "  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {",
    "    throw new Error('Expected JSON object');",
    "  }",
    "  const missing = REQUIRED_KEYS.filter((key) => !(key in parsed));",
    "  if (missing.length) throw new Error(`Missing required keys: ${missing.join(', ')}`);",
    "  const invalid = REQUIRED_KEYS.filter((key) => typeof parsed[key] !== 'string' || !parsed[key].trim());",
    "  if (invalid.length) throw new Error(`Empty or non-string values for: ${invalid.join(', ')}`);",
    "  result = {",
    "    deliverable_markdown: parsed.deliverable_markdown,",
    "    resumo: parsed.resumo,",
    "    autochecagem: parsed.autochecagem,",
    "  };",
    "  parseSuccess = true;",
    "} catch (error) {",
    "  result = {",
    "    error: `Failed to parse AgentOutput: ${error.message}`,",
    "    raw_response: rawResponse,",
    "  };",
    "}",
    "",
    "const latencyMs = Date.now() - startedAt;",
    "console.log(JSON.stringify({",
    "  task_id: taskId,",
    "  agent_id: agentId,",
    "  execution_id: executionId,",
    "  latency_ms: latencyMs,",
    "  parse_success: parseSuccess,",
    "}));",
    "",
    "return [{ json: result }];",
  ].join("\n");
}

function unsupportedProviderJs(): string {
  return [
    "return [{",
    "  json: {",
    "    error: `Unsupported provider: ${$json.provider ?? 'unknown'}. M1 routes openai (and legacy google) to GPT.`,",
    "    raw_response: JSON.stringify($json),",
    "  },",
    "}];",
  ].join("\n");
}

export const GPT_NODE_NAME = "Message GPT-4.1-MINI";

const WORKFLOW_NAME = "Call Agent";

function nodeId(nodeName: string): string {
  return deterministicWorkflowId(WORKFLOW_NAME, nodeName);
}

function conditionId(nodeName: string, index: number): string {
  return deterministicWorkflowId(WORKFLOW_NAME, `${nodeName}:condition:${index}`);
}

/** Build the Call Agent n8n sub-workflow export. Source of truth per ADR-006. */
export function buildCallAgentWorkflow(): N8nWorkflowExport {
  const nodes: N8nNode[] = [
    {
      id: nodeId("When Executed by Another Workflow"),
      name: "When Executed by Another Workflow",
      type: "n8n-nodes-base.executeWorkflowTrigger",
      typeVersion: 1.1,
      position: [0, 300],
      parameters: { inputSource: "passthrough" },
    },
    {
      id: nodeId("Manual Trigger (Isolation Test)"),
      name: "Manual Trigger (Isolation Test)",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 100],
      parameters: {},
    },
    {
      id: nodeId("Hardcoded Test Input"),
      name: "Hardcoded Test Input",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [240, 100],
      parameters: { mode: "raw", jsonOutput: JSON.stringify(HARDCODED_TEST_INPUT), options: {} },
    },
    {
      id: nodeId("Store Input Context"),
      name: "Store Input Context",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 200],
      parameters: { jsCode: storeInputContextJs() },
    },
    {
      id: nodeId("Fetch Agent Config"),
      name: "Fetch Agent Config",
      type: "n8n-nodes-base.github",
      typeVersion: 1.1,
      position: [720, 200],
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 1000,
      credentials: GITHUB_CREDENTIALS,
      parameters: {
        resource: "file",
        operation: "get",
        owner: GITHUB_OWNER_PARAM,
        repository: GITHUB_REPOSITORY_PARAM,
        filePath: `=${agentConfigPath("{{ $json.agent_id }}")}`,
        asBinaryProperty: false,
      },
    },
    {
      id: nodeId("Parse Agent Config"),
      name: "Parse Agent Config",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [960, 200],
      parameters: { jsCode: parseAgentConfigJs() },
    },
    {
      id: nodeId("Fetch Skill Markdown"),
      name: "Fetch Skill Markdown",
      type: "n8n-nodes-base.github",
      typeVersion: 1.1,
      position: [1200, 200],
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 1000,
      credentials: GITHUB_CREDENTIALS,
      parameters: {
        resource: "file",
        operation: "get",
        owner: GITHUB_OWNER_PARAM,
        repository: GITHUB_REPOSITORY_PARAM,
        filePath: "={{ $json.skill_path }}",
        asBinaryProperty: false,
      },
    },
    {
      id: nodeId("Merge Skill Fetch"),
      name: "Merge Skill Fetch",
      type: "n8n-nodes-base.merge",
      typeVersion: 3.2,
      position: [1320, 200],
      parameters: {
        mode: "combine",
        combineBy: "combineByPosition",
        options: {},
      },
    },
    {
      id: nodeId("Assemble Prompt"),
      name: "Assemble Prompt",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1560, 200],
      parameters: { jsCode: assemblePromptJs() },
    },
    {
      id: nodeId("Route Provider"),
      name: "Route Provider",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1800, 200],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "strict" },
          combinator: "or",
          conditions: [
            {
              id: conditionId("Route Provider", 0),
              leftValue: "={{ $json.provider }}",
              rightValue: "openai",
              operator: { type: "string", operation: "equals" },
            },
            {
              id: conditionId("Route Provider", 1),
              leftValue: "={{ $json.provider }}",
              rightValue: "google",
              operator: { type: "string", operation: "equals" },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId(GPT_NODE_NAME),
      name: GPT_NODE_NAME,
      type: "@n8n/n8n-nodes-langchain.openAi",
      typeVersion: 2.1,
      position: [2040, 120],
      credentials: { openAiApi: { id: "OPENAI_CREDENTIAL_ID", name: "OpenAI API" } },
      parameters: {
        resource: "text",
        operation: "response",
        modelId: {
          __rl: true,
          mode: "id",
          value: `={{ ($json.model || '${DEFAULT_MODEL}').replace(/^models\\//, '').replace(/^gemini.*/, '${DEFAULT_MODEL}') }}`,
        },
        responses: {
          values: [{ type: "text", role: "user", content: "={{ $json.user_message }}" }],
        },
        simplify: true,
        builtInTools: {},
        options: {
          instructions: "={{ $json.system_prompt }}",
          temperature: "={{ $json.temperature ?? 0.7 }}",
          maxTokens: "={{ $json.max_output_tokens ?? 1024 }}",
        },
      },
    },
    {
      id: nodeId("Parse Agent Output"),
      name: "Parse Agent Output",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2280, 120],
      parameters: { jsCode: parseAgentOutputJs() },
    },
    {
      id: nodeId("Unsupported Provider Error"),
      name: "Unsupported Provider Error",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2040, 320],
      parameters: { jsCode: unsupportedProviderJs() },
    },
  ];

  const connections: N8nWorkflowExport["connections"] = {
    "When Executed by Another Workflow": { main: [[{ node: "Store Input Context", type: "main", index: 0 }]] },
    "Manual Trigger (Isolation Test)": { main: [[{ node: "Hardcoded Test Input", type: "main", index: 0 }]] },
    "Hardcoded Test Input": { main: [[{ node: "Store Input Context", type: "main", index: 0 }]] },
    "Store Input Context": { main: [[{ node: "Fetch Agent Config", type: "main", index: 0 }]] },
    "Fetch Agent Config": { main: [[{ node: "Parse Agent Config", type: "main", index: 0 }]] },
    "Parse Agent Config": {
      main: [
        [
          { node: "Fetch Skill Markdown", type: "main", index: 0 },
          { node: "Merge Skill Fetch", type: "main", index: 0 },
        ],
      ],
    },
    "Fetch Skill Markdown": { main: [[{ node: "Merge Skill Fetch", type: "main", index: 1 }]] },
    "Merge Skill Fetch": { main: [[{ node: "Assemble Prompt", type: "main", index: 0 }]] },
    "Assemble Prompt": { main: [[{ node: "Route Provider", type: "main", index: 0 }]] },
    "Route Provider": {
      main: [
        [{ node: GPT_NODE_NAME, type: "main", index: 0 }],
        [{ node: "Unsupported Provider Error", type: "main", index: 0 }],
      ],
    },
    [GPT_NODE_NAME]: { main: [[{ node: "Parse Agent Output", type: "main", index: 0 }]] },
  };

  return {
    name: "Call Agent",
    nodes,
    connections,
    pinData: { "When Executed by Another Workflow": [{ json: HARDCODED_TEST_INPUT }] },
    active: false,
    settings: { executionOrder: "v1" },
    versionId: nodeId("__version__"),
    meta: { templateCredsSetupCompleted: false, instanceId: "agentic-mkt-call-agent-export" },
    tags: [{ name: "marketing-pipeline" }],
  };
}
