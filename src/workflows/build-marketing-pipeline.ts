import { deterministicWorkflowId } from "./deterministic-id.js";
import {
  agentParseFailureJs,
  dedupIfExpression,
  extractTaskFieldsJs,
  extractWebhookContextJs,
  formatDraftCommentJs,
  logDuplicateIngressJs,
  logIngressSkippedJs,
  markHistoryItemSeenJs,
  prepareCallAgentInputJs,
} from "./marketing-pipeline-n8n.js";
import { statusName, webhookIfExpression } from "../marketing-pipeline/logic.js";
import type { FieldMapping } from "../types/field-mapping.js";
import type { N8nNode, N8nWorkflowExport } from "./build-call-agent.js";

const CLICKUP_CREDENTIALS = {
  clickUpApi: { id: "CLICKUP_CREDENTIAL_ID", name: "ClickUp Marketing Pipeline" },
};

/** Build the Marketing Pipeline n8n main workflow export. Source of truth per ADR-006. */
export function buildMarketingPipelineWorkflow(fieldMapping: FieldMapping): N8nWorkflowExport {
  const WORKFLOW_NAME = "Marketing Pipeline";

  function nodeId(nodeName: string): string {
    return deterministicWorkflowId(WORKFLOW_NAME, nodeName);
  }

  function conditionId(nodeName: string, index: number): string {
    return deterministicWorkflowId(WORKFLOW_NAME, `${nodeName}:condition:${index}`);
  }

  const statusWriting = statusName(fieldMapping, "writing");
  const statusReview = statusName(fieldMapping, "review");

  const nodes: N8nNode[] = [
    {
      id: nodeId("ClickUp Webhook"),
      name: "ClickUp Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 300],
      webhookId: nodeId("ClickUp Webhook:webhookId"),
      parameters: {
        httpMethod: "POST",
        path: "marketing-pipeline-ready-to-work",
        responseMode: "onReceived",
        options: {},
      },
    },
    {
      id: nodeId("Ready to Work?"),
      name: "Ready to Work?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [240, 300],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Ready to Work?", 0),
              leftValue: webhookIfExpression(fieldMapping),
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Extract Webhook Context"),
      name: "Extract Webhook Context",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
      parameters: { jsCode: extractWebhookContextJs() },
    },
    {
      id: nodeId("Dedup?"),
      name: "Dedup?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [600, 300],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Dedup?", 0),
              leftValue: dedupIfExpression(),
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Mark History Item Seen"),
      name: "Mark History Item Seen",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [720, 300],
      parameters: { jsCode: markHistoryItemSeenJs() },
    },
    {
      id: nodeId("GET ClickUp Task"),
      name: "GET ClickUp Task",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [840, 300],
      credentials: CLICKUP_CREDENTIALS,
      parameters: { operation: "get", id: "={{ $json.task_id }}" },
    },
    {
      id: nodeId("Extract Task Fields"),
      name: "Extract Task Fields",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1080, 300],
      parameters: { jsCode: extractTaskFieldsJs(fieldMapping) },
    },
    {
      id: nodeId("Status → In Progress"),
      name: "Status → In Progress",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [1320, 300],
      credentials: CLICKUP_CREDENTIALS,
      parameters: { operation: "update", id: "={{ $json.task_id }}", updateFields: { status: statusWriting } },
    },
    {
      id: nodeId("Prepare Call Agent Input"),
      name: "Prepare Call Agent Input",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1440, 300],
      parameters: { jsCode: prepareCallAgentInputJs() },
    },
    {
      id: nodeId("Execute Call Agent"),
      name: "Execute Call Agent",
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [1680, 300],
      parameters: {
        source: "database",
        workflowId: { __rl: true, mode: "id", value: "CALL_AGENT_WORKFLOW_ID" },
        mode: "once",
        options: {},
      },
    },
    {
      id: nodeId("Agent Output OK?"),
      name: "Agent Output OK?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1920, 300],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "strict" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Agent Output OK?", 0),
              leftValue: "={{ $json.error }}",
              rightValue: "",
              operator: { type: "string", operation: "notExists" },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Format Draft Comment"),
      name: "Format Draft Comment",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2160, 220],
      parameters: { jsCode: formatDraftCommentJs() },
    },
    {
      id: nodeId("POST Task Comment"),
      name: "POST Task Comment",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [2400, 220],
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 1000,
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        resource: "comment",
        operation: "create",
        commentOn: "task",
        id: "={{ $json.task_id }}",
        commentText: "={{ $json.comment_text }}",
      },
    },
    {
      id: nodeId("Status → Review"),
      name: "Status → Review",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [2640, 220],
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        operation: "update",
        id: "={{ $('Extract Task Fields').item.json.task_id }}",
        updateFields: { status: statusReview },
      },
    },
    {
      id: nodeId("Agent Parse Failure"),
      name: "Agent Parse Failure",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2160, 420],
      parameters: { jsCode: agentParseFailureJs() },
    },
    {
      id: nodeId("Log Ingress Skipped"),
      name: "Log Ingress Skipped",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 500],
      parameters: { jsCode: logIngressSkippedJs(fieldMapping) },
    },
    {
      id: nodeId("Log Duplicate Ingress"),
      name: "Log Duplicate Ingress",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [600, 500],
      parameters: { jsCode: logDuplicateIngressJs() },
    },
  ];

  const connections: N8nWorkflowExport["connections"] = {
    "ClickUp Webhook": { main: [[{ node: "Ready to Work?", type: "main", index: 0 }]] },
    "Ready to Work?": {
      main: [
        [{ node: "Extract Webhook Context", type: "main", index: 0 }],
        [{ node: "Log Ingress Skipped", type: "main", index: 0 }],
      ],
    },
    "Extract Webhook Context": { main: [[{ node: "Dedup?", type: "main", index: 0 }]] },
    "Dedup?": {
      main: [
        [{ node: "Log Duplicate Ingress", type: "main", index: 0 }],
        [{ node: "Mark History Item Seen", type: "main", index: 0 }],
      ],
    },
    "Mark History Item Seen": { main: [[{ node: "GET ClickUp Task", type: "main", index: 0 }]] },
    "GET ClickUp Task": { main: [[{ node: "Extract Task Fields", type: "main", index: 0 }]] },
    "Extract Task Fields": { main: [[{ node: "Status → In Progress", type: "main", index: 0 }]] },
    "Status → In Progress": { main: [[{ node: "Prepare Call Agent Input", type: "main", index: 0 }]] },
    "Prepare Call Agent Input": { main: [[{ node: "Execute Call Agent", type: "main", index: 0 }]] },
    "Execute Call Agent": { main: [[{ node: "Agent Output OK?", type: "main", index: 0 }]] },
    "Agent Output OK?": {
      main: [
        [{ node: "Format Draft Comment", type: "main", index: 0 }],
        [{ node: "Agent Parse Failure", type: "main", index: 0 }],
      ],
    },
    "Format Draft Comment": { main: [[{ node: "POST Task Comment", type: "main", index: 0 }]] },
    "POST Task Comment": { main: [[{ node: "Status → Review", type: "main", index: 0 }]] },
  };

  return {
    name: "Marketing Pipeline",
    nodes,
    connections,
    active: false,
    settings: { executionOrder: "v1" },
    versionId: nodeId("__version__"),
    meta: { templateCredsSetupCompleted: false, instanceId: "agentic-mkt-marketing-pipeline-export" },
    tags: [{ name: "marketing-pipeline" }],
  };
}
