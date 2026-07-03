import {
  statusName,
} from "../marketing-pipeline/logic.js";
import { AGENT_BLOCKED_TAG, AGENT_WORKING_TAG } from "../marketing-pipeline/stages.js";
import type { FieldMapping } from "../types/field-mapping.js";
import type { N8nNode, N8nWorkflowExport } from "./build-call-agent.js";
import { deterministicWorkflowId } from "./deterministic-id.js";
import {
  agentParseFailureJs,
  collectTaskCommentsJs,
  dedupIfExpression,
  detectBlockerJs,
  docCreatedJs,
  docReadyJs,
  extractLatestLeadFeedbackJs,
  extractStageJs,
  extractTaskFieldsJs,
  extractWebhookContextJs,
  findStagePageJs,
  formatBlockerCommentJs,
  formatDraftCommentJs,
  formatPointerCommentJs,
  hasDocUrlIfExpression,
  logDuplicateIngressJs,
  markHistoryItemSeenJs,
  pageCreatedJs,
  pageExistsIfExpression,
  persistDocPointerJs,
  prepareStagedCallAgentInputJs,
  readCurrentPageJs,
  replacePageJs,
  routeFormatIfExpression,
  routeInvestigateIfExpression,
  routeWriteIfExpression,
  setIngressModeJs,
  updateStatusToNextGateJs,
  updateStatusToPreviousGateJs,
  useExistingDocJs,
  validateStagedArtifactJs,
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

  function clickUpTagNode(
    name: string,
    position: [number, number],
    operation: "add" | "remove",
    tagName: string
  ): N8nNode {
    return {
      id: nodeId(name),
      name,
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position,
      credentials: CLICKUP_CREDENTIALS,
      onError: "continueRegularOutput",
      parameters: {
        resource: "taskTag",
        ...(operation === "remove" ? { operation } : {}),
        taskId: "={{ $('Extract Task Fields').first().json.task_id }}",
        tagName,
        additionalFields: {},
      },
    };
  }

  function clickUpHttpNode(
    name: string,
    position: [number, number],
    method: "GET" | "POST" | "PUT",
    url: string,
    jsonBody?: string
  ): N8nNode {
    return {
      id: nodeId(name),
      name,
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position,
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        ...(method === "GET" ? {} : { method }),
        url,
        authentication: "predefinedCredentialType",
        nodeCredentialType: "clickUpApi",
        ...(jsonBody
          ? {
              sendHeaders: true,
              headerParameters: {
                parameters: [{ name: "Content-Type", value: "application/json" }],
              },
            }
          : {}),
        ...(jsonBody ? { sendBody: true, specifyBody: "json", jsonBody } : {}),
        options: {},
      },
    };
  }

  const statusReview = statusName(fieldMapping, "review");

  const nodes: N8nNode[] = [
    {
      id: nodeId("ClickUp Webhook"),
      name: "ClickUp Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 448],
      webhookId: nodeId("ClickUp Webhook:webhookId"),
      parameters: {
        httpMethod: "POST",
        path: "marketing-pipeline-staged-ingress",
        options: {},
      },
    },
    {
      id: nodeId("Extract Stage"),
      name: "Extract Stage",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [224, 448],
      parameters: { jsCode: extractStageJs(fieldMapping) },
    },
    {
      id: nodeId("Set Staged Ingress"),
      name: "Set Staged Ingress",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [448, 448],
      parameters: { jsCode: setIngressModeJs("first_draft") },
    },
    {
      id: nodeId("Extract Webhook Context"),
      name: "Extract Webhook Context",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [672, 448],
      parameters: { jsCode: extractWebhookContextJs() },
    },
    {
      id: nodeId("Dedup?"),
      name: "Dedup?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [896, 448],
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
      position: [1120, 352],
      parameters: { jsCode: markHistoryItemSeenJs() },
    },
    {
      id: nodeId("GET ClickUp Task"),
      name: "GET ClickUp Task",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [1344, 352],
      credentials: CLICKUP_CREDENTIALS,
      parameters: { operation: "get", id: "={{ $json.task_id }}" },
    },
    {
      id: nodeId("Extract Task Fields"),
      name: "Extract Task Fields",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1568, 352],
      parameters: { jsCode: extractTaskFieldsJs(fieldMapping) },
    },
    {
      id: nodeId("Route by Stage?"),
      name: "Route by Stage?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [1792, 352],
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
      position: [2016, 352],
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
      position: [2240, 432],
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
      position: [2464, 496],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "strict" },
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
      id: nodeId("GET Task Comments"),
      name: "GET Task Comments",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [2912, 352],
      credentials: CLICKUP_CREDENTIALS,
      alwaysOutputData: true,
      parameters: {
        resource: "comment",
        operation: "getAll",
        commentsOn: "task",
        id: "={{ $('Extract Task Fields').item.json.task_id }}",
      },
    },
    {
      id: nodeId("Collect Task Comments"),
      name: "Collect Task Comments",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3136, 352],
      parameters: { jsCode: collectTaskCommentsJs() },
    },
    {
      id: nodeId("Has Doc URL?"),
      name: "Has Doc URL?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [3360, 352],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Has Doc URL?", 0),
              leftValue: hasDocUrlIfExpression(),
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Use Existing Doc"),
      name: "Use Existing Doc",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3808, 256],
      parameters: { jsCode: useExistingDocJs() },
    },
    clickUpHttpNode(
      "POST Create ClickUp Doc",
      [3584, 448],
      "POST",
      "=https://api.clickup.com/api/v3/workspaces/{{ $('Extract Task Fields').first().json.workspace_id }}/docs",
      "={{ { name: \"Editorial workspace for \" + $('Extract Task Fields').first().json.task_id, parent: { id: $('Extract Webhook Context').first().json.list_id, type: 6 }, visibility: \"PRIVATE\", create_page: true } }}"
    ),
    {
      id: nodeId("Doc Created"),
      name: "Doc Created",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [3808, 448],
      parameters: { jsCode: docCreatedJs() },
    },
    {
      id: nodeId("Persist Doc Pointer"),
      name: "Persist Doc Pointer",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [4032, 448],
      parameters: { jsCode: persistDocPointerJs(fieldMapping) },
    },
    clickUpHttpNode(
      "PUT Update Editorial Doc Url",
      [4256, 448],
      "POST",
      "=https://api.clickup.com/api/v2/task/{{ $json.task_id }}/field/{{ $json.editorial_doc_url_field_id }}",
      "={{ { value: $json.editorial_doc_url } }}"
    ),
    {
      id: nodeId("Doc Ready"),
      name: "Doc Ready",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [4480, 352],
      parameters: { jsCode: docReadyJs() },
    },
    clickUpHttpNode(
      "GET List Doc Pages",
      [4704, 352],
      "GET",
      "=https://api.clickup.com/api/v3/workspaces/{{ $json.workspace_id }}/docs/{{ $json.doc_id }}/pages"
    ),
    {
      id: nodeId("Find Stage Page"),
      name: "Find Stage Page",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [4928, 352],
      parameters: { jsCode: findStagePageJs() },
    },
    {
      id: nodeId("Page Exists?"),
      name: "Page Exists?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [5152, 352],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Page Exists?", 0),
              leftValue: pageExistsIfExpression(),
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    clickUpHttpNode(
      "POST Create Doc Page",
      [5376, 432],
      "POST",
      "=https://api.clickup.com/api/v3/workspaces/{{ $json.workspace_id }}/docs/{{ $json.doc_id }}/pages",
      "={{ { name: $json.page_name, content: \"# \" + $json.page_name + \"\\n\\n*Initial placeholder content for \" + $json.page_name + \".*\", content_format: \"text/md\" } }}"
    ),
    {
      id: nodeId("Page Created"),
      name: "Page Created",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [5600, 432],
      parameters: { jsCode: pageCreatedJs() },
    },
    {
      id: nodeId("Page Ready"),
      name: "Page Ready",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [5824, 352],
      parameters: {},
    },
    clickUpHttpNode(
      "GET Doc Page Content",
      [6048, 352],
      "GET",
      "=https://api.clickup.com/api/v3/workspaces/{{ $json.workspace_id }}/docs/{{ $json.doc_id }}/pages/{{ $json.page_id }}?content_format=text/md"
    ),
    {
      id: nodeId("Read Current Page"),
      name: "Read Current Page",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [6272, 352],
      parameters: { jsCode: readCurrentPageJs() },
    },
    {
      id: nodeId("Extract Latest Lead Feedback"),
      name: "Extract Latest Lead Feedback",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [6496, 352],
      parameters: { jsCode: extractLatestLeadFeedbackJs() },
    },
    {
      id: nodeId("Prepare Staged Call Agent Input"),
      name: "Prepare Staged Call Agent Input",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [6720, 352],
      parameters: { jsCode: prepareStagedCallAgentInputJs() },
    },
    clickUpTagNode("Add agent-working", [2688, 352], "add", AGENT_WORKING_TAG),
    {
      id: nodeId("Execute Call Agent"),
      name: "Execute Call Agent",
      type: "n8n-nodes-base.executeWorkflow",
      typeVersion: 1.2,
      position: [6944, 352],
      parameters: {
        workflowId: { __rl: true, mode: "id", value: "CALL_AGENT_WORKFLOW_ID" },
        workflowInputs: {
          mappingMode: "defineBelow",
          value: {},
          matchingColumns: [],
          schema: [],
          attemptToConvertTypes: false,
          convertFieldsToString: true,
        },
        options: {},
      },
    },
    {
      id: nodeId("Agent Output OK?"),
      name: "Agent Output OK?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [6720, 352],
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
      position: [7168, 64],
      parameters: { jsCode: formatDraftCommentJs() },
    },
    {
      id: nodeId("POST Task Comment"),
      name: "POST Task Comment",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [7392, 64],
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 1000,
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        resource: "comment",
        commentOn: "task",
        id: "={{ $json.task_id }}",
        commentText: "={{ $json.comment_text }}",
        additionalFields: {},
      },
    },
    {
      id: nodeId("Status → Review"),
      name: "Status → Review",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [7616, 64],
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
      position: [6944, 448],
      parameters: { jsCode: agentParseFailureJs() },
    },
    {
      id: nodeId("Log Duplicate Ingress"),
      name: "Log Duplicate Ingress",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1120, 544],
      parameters: { jsCode: logDuplicateIngressJs() },
    },
    {
      id: nodeId("Staged Success?"),
      name: "Staged Success?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [6944, 256],
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
      id: nodeId("Detect Blocker"),
      name: "Detect Blocker",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [7168, 352],
      parameters: { jsCode: detectBlockerJs() },
    },
    {
      id: nodeId("Has Blocker?"),
      name: "Has Blocker?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [7392, 352],
      parameters: {
        conditions: {
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "loose" },
          combinator: "and",
          conditions: [
            {
              id: conditionId("Has Blocker?", 0),
              leftValue: "={{ $json.has_blocker === true }}",
              rightValue: "",
              operator: { type: "boolean", operation: "true", singleValue: true },
            },
          ],
        },
        options: {},
      },
    },
    {
      id: nodeId("Format Blocker Comment"),
      name: "Format Blocker Comment",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [7616, 448],
      parameters: { jsCode: formatBlockerCommentJs() },
    },
    {
      id: nodeId("POST Blocker Comment"),
      name: "POST Blocker Comment",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [7840, 448],
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 1000,
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        resource: "comment",
        commentOn: "task",
        id: "={{ $('Extract Task Fields').first().json.task_id }}",
        commentText: "={{ $json.comment_text }}",
        additionalFields: {},
      },
    },
    clickUpTagNode("Swap activity tags", [8064, 448], "remove", AGENT_WORKING_TAG),
    clickUpTagNode("Add agent-blocked tag", [8288, 448], "add", AGENT_BLOCKED_TAG),
    {
      id: nodeId("Update Status to Previous Gate"),
      name: "Update Status to Previous Gate",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [8512, 448],
      parameters: { jsCode: updateStatusToPreviousGateJs() },
    },
    {
      id: nodeId("Status → Previous Gate"),
      name: "Status → Previous Gate",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [8736, 448],
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        operation: "update",
        id: "={{ $('Extract Task Fields').first().json.task_id }}",
        updateFields: { status: "={{ $json.status_to_set }}" },
      },
    },
    {
      id: nodeId("Validate Staged Artifact"),
      name: "Validate Staged Artifact",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [7392, 256],
      parameters: { jsCode: validateStagedArtifactJs() },
    },
    {
      id: nodeId("Format Pointer Comment"),
      name: "Format Pointer Comment",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [7616, 256],
      parameters: { jsCode: formatPointerCommentJs() },
    },
    clickUpHttpNode(
      "PUT Replace Doc Page Content",
      [7840, 256],
      "PUT",
      "=https://api.clickup.com/api/v3/workspaces/{{ $('Page Ready').first().json.workspace_id }}/docs/{{ $('Page Ready').first().json.doc_id }}/pages/{{ $('Page Ready').first().json.page_id }}",
      "={{ { content: $json.artifact_markdown, content_edit_mode: \"replace\", content_format: \"text/md\" } }}"
    ),
    {
      id: nodeId("Replace Doc Page"),
      name: "Replace Doc Page",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [8064, 256],
      parameters: { jsCode: replacePageJs() },
    },
    {
      id: nodeId("POST Pointer Comment"),
      name: "POST Pointer Comment",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [8288, 256],
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 1000,
      credentials: CLICKUP_CREDENTIALS,
      parameters: {
        resource: "comment",
        commentOn: "task",
        id: "={{ $('Extract Task Fields').first().json.task_id }}",
        commentText: "={{ $json.comment_text }}",
        additionalFields: {},
      },
    },
    clickUpTagNode("Clear activity tags", [8512, 256], "remove", AGENT_WORKING_TAG),
    clickUpTagNode("Remove agent-blocked tag", [8736, 256], "remove", AGENT_BLOCKED_TAG),
    {
      id: nodeId("Update Status to Next Gate"),
      name: "Update Status to Next Gate",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [8960, 256],
      parameters: { jsCode: updateStatusToNextGateJs() },
    },
    {
      id: nodeId("Status → Next Gate"),
      name: "Status → Next Gate",
      type: "n8n-nodes-base.clickUp",
      typeVersion: 1,
      position: [9184, 256],
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
    "Extract Stage": { main: [[{ node: "Set Staged Ingress", type: "main", index: 0 }]] },
    "Set Staged Ingress": { main: [[{ node: "Extract Webhook Context", type: "main", index: 0 }]] },
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
        [],
      ],
    },
    "Investigate?": {
      main: [
        [{ node: "Add agent-working", type: "main", index: 0 }],
        [{ node: "Write?", type: "main", index: 0 }],
      ],
    },
    "Write?": {
      main: [
        [{ node: "Add agent-working", type: "main", index: 0 }],
        [{ node: "Format?", type: "main", index: 0 }],
      ],
    },
    "Format?": {
      main: [
        [{ node: "Add agent-working", type: "main", index: 0 }],
        [],
      ],
    },
    "Add agent-working": { main: [[{ node: "GET Task Comments", type: "main", index: 0 }]] },
    "GET Task Comments": { main: [[{ node: "Collect Task Comments", type: "main", index: 0 }]] },
    "Collect Task Comments": { main: [[{ node: "Has Doc URL?", type: "main", index: 0 }]] },
    "Has Doc URL?": {
      main: [
        [{ node: "Use Existing Doc", type: "main", index: 0 }],
        [{ node: "POST Create ClickUp Doc", type: "main", index: 0 }],
      ],
    },
    "Use Existing Doc": { main: [[{ node: "Doc Ready", type: "main", index: 0 }]] },
    "POST Create ClickUp Doc": { main: [[{ node: "Doc Created", type: "main", index: 0 }]] },
    "Doc Created": { main: [[{ node: "Persist Doc Pointer", type: "main", index: 0 }]] },
    "Persist Doc Pointer": { main: [[{ node: "PUT Update Editorial Doc Url", type: "main", index: 0 }]] },
    "PUT Update Editorial Doc Url": { main: [[{ node: "Doc Ready", type: "main", index: 0 }]] },
    "Doc Ready": { main: [[{ node: "GET List Doc Pages", type: "main", index: 0 }]] },
    "GET List Doc Pages": { main: [[{ node: "Find Stage Page", type: "main", index: 0 }]] },
    "Find Stage Page": { main: [[{ node: "Page Exists?", type: "main", index: 0 }]] },
    "Page Exists?": {
      main: [
        [{ node: "Page Ready", type: "main", index: 0 }],
        [{ node: "POST Create Doc Page", type: "main", index: 0 }],
      ],
    },
    "POST Create Doc Page": { main: [[{ node: "Page Created", type: "main", index: 0 }]] },
    "Page Created": { main: [[{ node: "Page Ready", type: "main", index: 0 }]] },
    "Page Ready": { main: [[{ node: "GET Doc Page Content", type: "main", index: 0 }]] },
    "GET Doc Page Content": { main: [[{ node: "Read Current Page", type: "main", index: 0 }]] },
    "Read Current Page": { main: [[{ node: "Extract Latest Lead Feedback", type: "main", index: 0 }]] },
    "Extract Latest Lead Feedback": { main: [[{ node: "Prepare Staged Call Agent Input", type: "main", index: 0 }]] },
    "Prepare Staged Call Agent Input": { main: [[{ node: "Execute Call Agent", type: "main", index: 0 }]] },
    "Execute Call Agent": { main: [[{ node: "Agent Output OK?", type: "main", index: 0 }]] },
    "Agent Output OK?": {
      main: [
        [{ node: "Staged Success?", type: "main", index: 0 }],
        [{ node: "Agent Parse Failure", type: "main", index: 0 }],
      ],
    },
    "Staged Success?": {
      main: [
        [{ node: "Detect Blocker", type: "main", index: 0 }],
        [{ node: "Format Draft Comment", type: "main", index: 0 }],
      ],
    },
    "Detect Blocker": { main: [[{ node: "Has Blocker?", type: "main", index: 0 }]] },
    "Has Blocker?": {
      main: [
        [{ node: "Format Blocker Comment", type: "main", index: 0 }],
        [{ node: "Validate Staged Artifact", type: "main", index: 0 }],
      ],
    },
    "Format Blocker Comment": { main: [[{ node: "POST Blocker Comment", type: "main", index: 0 }]] },
    "POST Blocker Comment": { main: [[{ node: "Swap activity tags", type: "main", index: 0 }]] },
    "Swap activity tags": { main: [[{ node: "Add agent-blocked tag", type: "main", index: 0 }]] },
    "Add agent-blocked tag": { main: [[{ node: "Update Status to Previous Gate", type: "main", index: 0 }]] },
    "Update Status to Previous Gate": { main: [[{ node: "Status → Previous Gate", type: "main", index: 0 }]] },
    "Validate Staged Artifact": { main: [[{ node: "Format Pointer Comment", type: "main", index: 0 }]] },
    "Format Pointer Comment": { main: [[{ node: "PUT Replace Doc Page Content", type: "main", index: 0 }]] },
    "PUT Replace Doc Page Content": { main: [[{ node: "Replace Doc Page", type: "main", index: 0 }]] },
    "Replace Doc Page": { main: [[{ node: "POST Pointer Comment", type: "main", index: 0 }]] },
    "POST Pointer Comment": { main: [[{ node: "Clear activity tags", type: "main", index: 0 }]] },
    "Clear activity tags": { main: [[{ node: "Remove agent-blocked tag", type: "main", index: 0 }]] },
    "Remove agent-blocked tag": { main: [[{ node: "Update Status to Next Gate", type: "main", index: 0 }]] },
    "Update Status to Next Gate": { main: [[{ node: "Status → Next Gate", type: "main", index: 0 }]] },
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
