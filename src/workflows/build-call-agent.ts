import { deterministicWorkflowId } from "./deterministic-id.js";
import { loadCodeNodeSource } from "./n8n-codegen.js";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  DEFAULT_TEMPERATURE,
  GITHUB_REPO_NAME,
  GITHUB_REPO_OWNER,
  REQUIRED_STAGE_OUTPUT_KEYS,
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
  agent_id: "investigative-brief",
  task_title: "Launch post for Q3 product update",
  task_description: "Announce the new dashboard feature for marketing leads.",
  criterios_de_aceite: "- Mention the dashboard\n- CTA to sign up\n- Under 300 words",
};

const GITHUB_OWNER_PARAM = { __rl: true, mode: "name", value: GITHUB_REPO_OWNER };
const GITHUB_REPOSITORY_PARAM = { __rl: true, mode: "name", value: GITHUB_REPO_NAME };
const GITHUB_CREDENTIALS = {
  githubApi: { id: "GITHUB_CREDENTIAL_ID", name: "GitHub agentic-mkt (read-only PAT)" },
};

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
      position: [224, 304],
      parameters: { inputSource: "passthrough" },
    },
    {
      id: nodeId("Manual Trigger (Isolation Test)"),
      name: "Manual Trigger (Isolation Test)",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 112],
      parameters: {},
    },
    {
      id: nodeId("Hardcoded Test Input"),
      name: "Hardcoded Test Input",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [224, 112],
      parameters: { mode: "raw", jsonOutput: JSON.stringify(HARDCODED_TEST_INPUT), options: {} },
    },
    {
      id: nodeId("Store Input Context"),
      name: "Store Input Context",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [448, 208],
      parameters: { jsCode: loadCodeNodeSource({ workflowSlug: "call-agent", nodeSlug: "store-input-context" }) },
    },
    {
      id: nodeId("Fetch Agent Config"),
      name: "Fetch Agent Config",
      type: "n8n-nodes-base.github",
      typeVersion: 1.1,
      position: [672, 208],
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
        additionalParameters: { reference: "content-quality-pipeline" },
      },
    },
    {
      id: nodeId("Parse Agent Config"),
      name: "Parse Agent Config",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [896, 208],
      parameters: { jsCode: loadCodeNodeSource({ workflowSlug: "call-agent", nodeSlug: "parse-agent-config" }) },
    },
    {
      id: nodeId("Fetch Agent Files"),
      name: "Fetch Agent Files",
      type: "n8n-nodes-base.github",
      typeVersion: 1.1,
      position: [1120, 288],
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 1000,
      credentials: GITHUB_CREDENTIALS,
      parameters: {
        resource: "file",
        operation: "get",
        owner: GITHUB_OWNER_PARAM,
        repository: GITHUB_REPOSITORY_PARAM,
        filePath: "={{ $json.path }}",
        asBinaryProperty: false,
        additionalParameters: { reference: "content-quality-pipeline" },
      },
    },
    {
      id: nodeId("Merge Agent Files Fetch"),
      name: "Merge Agent Files Fetch",
      type: "n8n-nodes-base.merge",
      typeVersion: 3.2,
      position: [1344, 208],
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
      position: [1568, 208],
      parameters: {
        jsCode: loadCodeNodeSource({
          workflowSlug: "call-agent",
          nodeSlug: "assemble-prompt",
          tokens: {
            DEFAULT_TEMPERATURE,
            DEFAULT_MAX_OUTPUT_TOKENS,
            DEFAULT_PROVIDER,
            DEFAULT_MODEL,
          },
        }),
      },
    },
    {
      id: nodeId("Route Provider"),
      name: "Route Provider",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1792, 208],
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
      position: [2016, 112],
      credentials: { openAiApi: { id: "OPENAI_CREDENTIAL_ID", name: "OpenAI API" } },
      parameters: {
        modelId: {
          __rl: true,
          mode: "id",
          value: `={{ ($json.model || '${DEFAULT_MODEL}').replace(/^models\\//, '').replace(/^gemini.*/, '${DEFAULT_MODEL}') }}`,
        },
        responses: {
          values: [{ content: "={{ $json.user_message }}" }],
        },
        builtInTools: {},
        options: {
          instructions: "={{ $json.system_prompt }}",
          maxTokens: "={{ $json.max_output_tokens ?? 1024 }}",
          temperature: "={{ $json.temperature ?? 0.7 }}",
        },
      },
    },
    {
      id: nodeId("Parse Agent Output"),
      name: "Parse Agent Output",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2240, 112],
        parameters: {
          jsCode: loadCodeNodeSource({
            workflowSlug: "call-agent",
            nodeSlug: "parse-agent-output",
            tokens: { REQUIRED_STAGE_OUTPUT_KEYS },
          }),
        },
      },
    {
      id: nodeId("Unsupported Provider Error"),
      name: "Unsupported Provider Error",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2016, 304],
      parameters: { jsCode: loadCodeNodeSource({ workflowSlug: "call-agent", nodeSlug: "unsupported-provider-error" }) },
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
          { node: "Fetch Agent Files", type: "main", index: 0 },
          { node: "Merge Agent Files Fetch", type: "main", index: 0 },
        ],
      ],
    },
    "Fetch Agent Files": { main: [[{ node: "Merge Agent Files Fetch", type: "main", index: 1 }]] },
    "Merge Agent Files Fetch": { main: [[{ node: "Assemble Prompt", type: "main", index: 0 }]] },
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
