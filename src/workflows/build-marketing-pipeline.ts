import {
  needsReviewIfExpression,
  statusName,
  webhookIfExpression,
  extractStageFromWebhook,
} from "../marketing-pipeline/logic.js";
import type { FieldMapping } from "../types/field-mapping.js";
import type { N8nNode, N8nWorkflowExport } from "./build-call-agent.js";
import { deterministicWorkflowId } from "./deterministic-id.js";
import {
  agentParseFailureJs,
  collectTaskCommentsJs,
  dedupIfExpression,
  extractLatestLeadFeedbackJs,
  extractStageJs,
  extractTaskFieldsJs,
  extractWebhookContextJs,
  formatDraftCommentJs,
  formatGuidanceCommentJs,
  formatPointerCommentJs,
  logDuplicateIngressJs,
  logEmptyFeedbackGuidanceJs,
  logIngressSkippedJs,
  markHistoryItemSeenJs,
  prepareCallAgentInputJs,
  prepareRevisionCallAgentInputJs,
  prepareStagedCallAgentInputJs,
  readCurrentPageJs,
  replacePageJs,
  routeFormatIfExpression,
  routeInvestigateIfExpression,
  routeWriteIfExpression,
  setIngressModeJs,
  setNeedsReviewSkipTargetJs,
  stagedIngressIfExpression,
  updateStatusToNextGateJs,
} from "./marketing-pipeline-n8n.js";

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
      id: nodeId("Staged or Ready?"),
      name: "Staged or Ready?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [240, 300],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "or",
          conditions: [
            {
              id: conditionId("Staged or Ready?", 0),
              leftValue: stagedIngressIfExpression(fieldMapping),
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
            {
              id: conditionId("Staged or Ready?", 1),
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
      id: nodeId("Extract Stage"),
      name: "Extract Stage",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [240, 150],
      parameters: { jsCode: extractStageJs(fieldMapping) },
    },
    {
      id: nodeId("Needs Review?"),
      name: "Needs Review?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [480, 480],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Needs Review?", 0),
              leftValue: needsReviewIfExpression(fieldMapping),
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Set First Draft Ingress"),
      name: "Set First Draft Ingress",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 220],
      parameters: { jsCode: setIngressModeJs("first_draft") },
    },
    {
      id: nodeId("Set Revision Ingress"),
      name: "Set Revision Ingress",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [720, 480],
      parameters: { jsCode: setIngressModeJs("revision") },
    },
    {
      id: nodeId("Extract Webhook Context"),
      name: "Extract Webhook Context",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [960, 300],
      parameters: { jsCode: extractWebhookContextJs() },
    },
    {
      id: nodeId("Dedup?"),
      name: "Dedup?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1200, 300],
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
      position: [1440, 300],
      parameters: { jsCode: markHistoryItemSeenJs() },
    },
    {
      id: nodeId("GET ClickUp Task"),
      name: "GET ClickUp Task",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [1680, 300],
      credentials: CLICKUP_CREDENTIALS,
      parameters: { operation: "get", id: "={{ $json.task_id }}" },
    },
    {
      id: nodeId("Extract Task Fields"),
      name: "Extract Task Fields",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1920, 300],
      parameters: { jsCode: extractTaskFieldsJs(fieldMapping) },
    },
    {
      id: nodeId("Route by Stage?"),
      name: "Route by Stage?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [2160, 300],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Route by Stage?", 0),
              leftValue: "={{ $json.stage !== null }}",
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Investigate?"),
      name: "Investigate?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [2400, 60],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Investigate?", 0),
              leftValue: routeInvestigateIfExpression(),
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Write?"),
      name: "Write?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [2400, 300],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Write?", 0),
              leftValue: routeWriteIfExpression(),
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Format?"),
      name: "Format?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [2400, 540],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Format?", 0),
              leftValue: routeFormatIfExpression(),
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Revision Ingress?"),
      name: "Revision Ingress?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [2160, 300],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Revision Ingress?", 0),
              leftValue: "={{ $json.ingress_mode === 'revision' }}",
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("GET Task Comments"),
      name: "GET Task Comments",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [2400, 480],
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        resource: "comment",
        operation: "getAll",
        commentsOn: "task",
        id: "={{ $json.task_id }}",
        limit: 50,
      },
    },
    {
      id: nodeId("Collect Task Comments"),
      name: "Collect Task Comments",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2640, 480],
      parameters: { jsCode: collectTaskCommentsJs() },
    },
    {
      id: nodeId("Actionable Feedback?"),
      name: "Actionable Feedback?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [2880, 480],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Actionable Feedback?", 0),
              leftValue: "={{ $json.has_actionable_feedback === true }}",
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Log Empty Feedback Guidance"),
      name: "Log Empty Feedback Guidance",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3120, 660],
      parameters: { jsCode: logEmptyFeedbackGuidanceJs() },
    },
    {
      id: nodeId("Format Empty Feedback Guidance"),
      name: "Format Empty Feedback Guidance",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3360, 660],
      parameters: { jsCode: formatGuidanceCommentJs() },
    },
    {
      id: nodeId("POST Empty Feedback Guidance"),
      name: "POST Empty Feedback Guidance",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [3600, 660],
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
      id: nodeId("Empty Feedback → Approval"),
      name: "Empty Feedback → Approval",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [3840, 660],
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        operation: "update",
        id: "={{ $('Extract Task Fields').first().json.task_id }}",
        updateFields: { status: statusReview },
      },
    },
    {
      id: nodeId("Status → In Progress"),
      name: "Status → In Progress",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [3120, 300],
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        operation: "update",
        id: "={{ $('Extract Task Fields').first().json.task_id }}",
        updateFields: { status: statusWriting },
      },
    },
    {
      id: nodeId("Staged Input Assembly?"),
      name: "Staged Input Assembly?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [3240, 300],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Staged Input Assembly?", 0),
              leftValue: "={{ $('Extract Task Fields').first().json.stage !== null }}",
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Prepare Revision Input?"),
      name: "Prepare Revision Input?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [3480, 420],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Prepare Revision Input?", 0),
              leftValue: "={{ $('Extract Task Fields').first().json.ingress_mode === 'revision' }}",
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Prepare Revision Call Agent Input"),
      name: "Prepare Revision Call Agent Input",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3600, 420],
      parameters: { jsCode: prepareRevisionCallAgentInputJs() },
    },
    {
      id: nodeId("Read Current Page"),
      name: "Read Current Page",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3360, 60],
      parameters: { jsCode: readCurrentPageJs() },
    },
    {
      id: nodeId("Extract Latest Lead Feedback"),
      name: "Extract Latest Lead Feedback",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3600, 60],
      parameters: { jsCode: extractLatestLeadFeedbackJs() },
    },
    {
      id: nodeId("Prepare Staged Call Agent Input"),
      name: "Prepare Staged Call Agent Input",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3840, 60],
      parameters: { jsCode: prepareStagedCallAgentInputJs() },
    },
    {
      id: nodeId("Prepare Call Agent Input"),
      name: "Prepare Call Agent Input",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3600, 180],
      parameters: { jsCode: prepareCallAgentInputJs() },
    },
    {
      id: nodeId("Execute Call Agent"),
      name: "Execute Call Agent",
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [3840, 300],
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
      position: [4080, 300],
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
      position: [4320, 220],
      parameters: { jsCode: formatDraftCommentJs() },
    },
    {
      id: nodeId("POST Task Comment"),
      name: "POST Task Comment",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [4560, 220],
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
      position: [4800, 220],
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        operation: "update",
        id: "={{ $('Extract Task Fields').first().json.task_id }}",
        updateFields: { status: statusReview },
      },
    },
    {
      id: nodeId("Agent Parse Failure"),
      name: "Agent Parse Failure",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [4320, 420],
      parameters: { jsCode: agentParseFailureJs() },
    },
    {
      id: nodeId("Set Needs Review Skip Target"),
      name: "Set Needs Review Skip Target",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [720, 660],
      parameters: { jsCode: setNeedsReviewSkipTargetJs() },
    },
    {
      id: nodeId("Log Ingress Skipped"),
      name: "Log Ingress Skipped",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [960, 660],
      parameters: { jsCode: logIngressSkippedJs(fieldMapping) },
    },
    {
      id: nodeId("Log Duplicate Ingress"),
      name: "Log Duplicate Ingress",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1200, 520],
      parameters: { jsCode: logDuplicateIngressJs() },
    },
    {
      id: nodeId("Staged Success?"),
      name: "Staged Success?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [4320, 300],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Staged Success?", 0),
              leftValue: "={{ $('Extract Task Fields').first().json.stage !== null }}",
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Format Pointer Comment"),
      name: "Format Pointer Comment",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [4560, 100],
      parameters: { jsCode: formatPointerCommentJs() },
    },
    {
      id: nodeId("Replace Doc Page"),
      name: "Replace Doc Page",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [4800, 100],
      parameters: { jsCode: replacePageJs() },
    },
    {
      id: nodeId("POST Pointer Comment"),
      name: "POST Pointer Comment",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [5040, 100],
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 1000,
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        resource: "comment",
        operation: "create",
        commentOn: "task",
        id: "={{ $('Extract Task Fields').first().json.task_id }}",
        commentText: "={{ $json.comment_text }}",
      },
    },
    {
      id: nodeId("Update Status to Next Gate"),
      name: "Update Status to Next Gate",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [5280, 100],
      parameters: { jsCode: updateStatusToNextGateJs() },
    },
    {
      id: nodeId("Status → Next Gate"),
      name: "Status → Next Gate",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [5520, 100],
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        operation: "update",
        id: "={{ $('Extract Task Fields').first().json.task_id }}",
        updateFields: { status: "={{ $json.status_to_set }}" },
      },
    },
  ];

  const connections: N8nWorkflowExport["connections"] = {
    "ClickUp Webhook": { main: [[{ node: "Extract Stage", type: "main", index: 0 }]] },
    "Extract Stage": { main: [[{ node: "Staged or Ready?", type: "main", index: 0 }]] },
    "Staged or Ready?": {
      main: [
        [{ node: "Set First Draft Ingress", type: "main", index: 0 }],
        [{ node: "Needs Review?", type: "main", index: 0 }],
      ],
    },
    "Needs Review?": {
      main: [
        [{ node: "Set Revision Ingress", type: "main", index: 0 }],
        [{ node: "Set Needs Review Skip Target", type: "main", index: 0 }],
      ],
    },
    "Set First Draft Ingress": { main: [[{ node: "Extract Webhook Context", type: "main", index: 0 }]] },
    "Set Revision Ingress": { main: [[{ node: "Extract Webhook Context", type: "main", index: 0 }]] },
    "Extract Webhook Context": { main: [[{ node: "Dedup?", type: "main", index: 0 }]] },
    "Dedup?": {
      main: [
        [{ node: "Log Duplicate Ingress", type: "main", index: 0 }],
        [{ node: "Mark History Item Seen", type: "main", index: 0 }],
      ],
    },
    "Mark History Item Seen": { main: [[{ node: "GET ClickUp Task", type: "main", index: 0 }]] },
    "GET ClickUp Task": { main: [[{ node: "Extract Task Fields", type: "main", index: 0 }]] },
    "Extract Task Fields": { main: [[{ node: "Route by Stage?", type: "main", index: 0 }]] },
    "Route by Stage?": {
      main: [
        [{ node: "Investigate?", type: "main", index: 0 }],
        [{ node: "Revision Ingress?", type: "main", index: 0 }],
      ],
    },
    "Investigate?": {
      main: [
        [{ node: "Status → In Progress", type: "main", index: 0 }],
        [{ node: "Write?", type: "main", index: 0 }],
      ],
    },
    "Write?": {
      main: [
        [{ node: "Status → In Progress", type: "main", index: 0 }],
        [{ node: "Format?", type: "main", index: 0 }],
      ],
    },
    "Format?": {
      main: [
        [{ node: "Status → In Progress", type: "main", index: 0 }],
        [],
      ],
    },
    "Revision Ingress?": {
      main: [
        [{ node: "GET Task Comments", type: "main", index: 0 }],
        [{ node: "Status → In Progress", type: "main", index: 0 }],
      ],
    },
    "GET Task Comments": { main: [[{ node: "Collect Task Comments", type: "main", index: 0 }]] },
    "Collect Task Comments": { main: [[{ node: "Actionable Feedback?", type: "main", index: 0 }]] },
    "Actionable Feedback?": {
      main: [
        [{ node: "Status → In Progress", type: "main", index: 0 }],
        [{ node: "Log Empty Feedback Guidance", type: "main", index: 0 }],
      ],
    },
    "Log Empty Feedback Guidance": { main: [[{ node: "Format Empty Feedback Guidance", type: "main", index: 0 }]] },
    "Format Empty Feedback Guidance": { main: [[{ node: "POST Empty Feedback Guidance", type: "main", index: 0 }]] },
    "POST Empty Feedback Guidance": { main: [[{ node: "Empty Feedback → Approval", type: "main", index: 0 }]] },
    "Status → In Progress": { main: [[{ node: "Staged Input Assembly?", type: "main", index: 0 }]] },
    "Staged Input Assembly?": {
      main: [
        [{ node: "Read Current Page", type: "main", index: 0 }],
        [{ node: "Prepare Revision Input?", type: "main", index: 0 }],
      ],
    },
    "Read Current Page": { main: [[{ node: "Extract Latest Lead Feedback", type: "main", index: 0 }]] },
    "Extract Latest Lead Feedback": { main: [[{ node: "Prepare Staged Call Agent Input", type: "main", index: 0 }]] },
    "Prepare Staged Call Agent Input": { main: [[{ node: "Execute Call Agent", type: "main", index: 0 }]] },
    "Prepare Revision Input?": {
      main: [
        [{ node: "Prepare Revision Call Agent Input", type: "main", index: 0 }],
        [{ node: "Prepare Call Agent Input", type: "main", index: 0 }],
      ],
    },
    "Prepare Revision Call Agent Input": { main: [[{ node: "Execute Call Agent", type: "main", index: 0 }]] },
    "Prepare Call Agent Input": { main: [[{ node: "Execute Call Agent", type: "main", index: 0 }]] },
    "Execute Call Agent": { main: [[{ node: "Agent Output OK?", type: "main", index: 0 }]] },
    "Agent Output OK?": {
      main: [
        [{ node: "Staged Success?", type: "main", index: 0 }],
        [{ node: "Agent Parse Failure", type: "main", index: 0 }],
      ],
    },
    "Staged Success?": {
      main: [
        [{ node: "Format Pointer Comment", type: "main", index: 0 }],
        [{ node: "Format Draft Comment", type: "main", index: 0 }],
      ],
    },
    "Format Pointer Comment": { main: [[{ node: "Replace Doc Page", type: "main", index: 0 }]] },
    "Replace Doc Page": { main: [[{ node: "POST Pointer Comment", type: "main", index: 0 }]] },
    "POST Pointer Comment": { main: [[{ node: "Update Status to Next Gate", type: "main", index: 0 }]] },
    "Update Status to Next Gate": { main: [[{ node: "Status → Next Gate", type: "main", index: 0 }]] },
    "Format Draft Comment": { main: [[{ node: "POST Task Comment", type: "main", index: 0 }]] },
    "POST Task Comment": { main: [[{ node: "Status → Review", type: "main", index: 0 }]] },
    "Set Needs Review Skip Target": { main: [[{ node: "Log Ingress Skipped", type: "main", index: 0 }]] },
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
