import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMENT_SECTIONS,
  DEFAULT_AGENT_ID,
  DEFAULT_MODEL,
  HAPPY_PATH_NODE_SEQUENCE,
  agentOutputHasError,
  buildCallAgentInput,
  commentFooter,
  commentIncludesRequiredSections,
  deriveIngressSkipReason,
  describeIngressSkipReason,
  extractCustomFieldValue,
  extractTaskFields,
  extractWebhookContext,
  fieldId,
  formatClickupComment,
  formatIngressTransition,
  ingressMatchesReadyToWork,
  loadFieldMapping,
  statusName,
  unwrapWebhookPayload,
  webhookIfExpression,
  workflowConnectionPath,
} from "../src/marketing-pipeline/logic.js";
import type { ClickUpTask, ClickUpWebhookPayload, N8nWorkflowExport } from "../src/marketing-pipeline/logic.js";
import type { FieldMapping } from "../src/types/field-mapping.js";
import { buildMarketingPipelineWorkflow } from "../src/workflows/build-marketing-pipeline.js";

const REPO_ROOT = resolve(__dirname, "..");
const WEBHOOK_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-status-updated-ready-to-work.json");
const TASK_GET_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-get-response.json");

const SAMPLE_AGENT_OUTPUT = {
  deliverable_markdown: "## Hook\n\nWe shipped a new dashboard.",
  resumo: "Summary of the dashboard launch post.",
  autochecagem: "- Dashboard mentioned\n- Sign-up CTA present",
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function fixtureFieldMapping(): FieldMapping {
  const mapping = loadFieldMapping();
  mapping.custom_fields.criterios_de_aceite!.clickup_field_id = "cf_criterios_001";
  mapping.custom_fields.agent_id!.clickup_field_id = "cf_agent_id_001";
  return mapping;
}

describe("ingressMatchesReadyToWork", () => {
  it("passes for the Ready fixture payload", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    expect(ingressMatchesReadyToWork(payload, fixtureFieldMapping())).toBe(true);
  });

  it("accepts live ClickUp lowercase status values case-insensitively", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const mapping = fixtureFieldMapping();
    const historyItem = payload.history_items?.[0];
    const after = historyItem?.after as Record<string, unknown>;
    after.status = "READY";
    expect(ingressMatchesReadyToWork(payload, mapping)).toBe(true);
  });

  it("fails when the status transitions to something other than the ingress status", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const mapping = fixtureFieldMapping();
    const historyItem = payload.history_items?.[0];
    const after = historyItem?.after as Record<string, unknown>;
    after.status = statusName(mapping, "writing");
    expect(ingressMatchesReadyToWork(payload, mapping)).toBe(false);
  });

  it("fails when the history item field is not status", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const historyItem = payload.history_items?.[0];
    if (historyItem) {
      historyItem.field = "priority";
    }
    expect(ingressMatchesReadyToWork(payload)).toBe(false);
  });

  it("fails when there are no history items", () => {
    expect(ingressMatchesReadyToWork({ history_items: [] })).toBe(false);
  });
});

describe("describeIngressSkipReason", () => {
  it("describes a self-echo transition as not_entering_ready", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const mapping = fixtureFieldMapping();
    const historyItem = payload.history_items?.[0];
    const after = historyItem?.after as Record<string, unknown>;
    after.status = statusName(mapping, "writing");
    const before = historyItem?.before as Record<string, unknown>;
    before.status = statusName(mapping, "ready");

    const record = describeIngressSkipReason(payload, { fieldMapping: mapping });
    expect(record).toEqual({
      event: "ingress_skipped",
      task_id: String(payload.task_id),
      webhook_id: String(payload.webhook_id),
      history_item_id: String(historyItem?.id),
      transition: "ready->writing",
      reason: "not_entering_ready",
    });
  });

  it("reports no_history_items when history_items is empty", () => {
    const record = describeIngressSkipReason({ task_id: "t1", history_items: [] });
    expect(record.reason).toBe("no_history_items");
    expect(record.transition).toBe("");
  });

  it("reports field_not_status when the history item field is not status", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const historyItem = payload.history_items?.[0];
    if (historyItem) {
      historyItem.field = "priority";
    }
    const record = describeIngressSkipReason(payload);
    expect(record.reason).toBe("field_not_status");
  });

  it("allows an explicit duplicate_history_item reason override", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const record = describeIngressSkipReason(payload, { reason: "duplicate_history_item" });
    expect(record.reason).toBe("duplicate_history_item");
    expect(record.event).toBe("ingress_skipped");
  });

  it("unwraps n8n webhook body wrapper when describing skip", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const mapping = fixtureFieldMapping();
    const historyItem = payload.history_items?.[0];
    const after = historyItem?.after as Record<string, unknown>;
    after.status = statusName(mapping, "writing");

    const wrapped = { body: payload };
    const record = describeIngressSkipReason(wrapped as never, { fieldMapping: mapping });
    expect(record.task_id).toBe(String(payload.task_id));
    expect(record.reason).toBe("not_entering_ready");
  });
});

describe("formatIngressTransition and deriveIngressSkipReason", () => {
  it("formats backlog to ready transition from the fixture", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const transition = formatIngressTransition(payload.history_items?.[0]);
    expect(transition).toBe("backlog->ready");
  });

  it("derives not_entering_ready for non-ingress status transitions", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const mapping = fixtureFieldMapping();
    const after = payload.history_items?.[0]?.after as Record<string, unknown>;
    after.status = statusName(mapping, "writing");
    expect(deriveIngressSkipReason(payload, mapping)).toBe("not_entering_ready");
  });
});

describe("webhookIfExpression", () => {
  it("matches the contract expression with safe payload unwrapping", () => {
    const mapping = fixtureFieldMapping();
    const expression = webhookIfExpression(mapping);
    expect(expression).toContain('$json.body && $json.body.history_items ? $json.body : $json');
    expect(expression).toContain('item.field !== "status"');
    expect(expression).toContain('.trim().toLowerCase()');
    expect(expression).toContain(JSON.stringify(statusName(mapping, "ready").toLowerCase()));
  });
});

describe("unwrapWebhookPayload", () => {
  it("accepts n8n webhook wrapper shape with body.history_items", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const mapping = fixtureFieldMapping();
    const wrapped = { body: payload, headers: {} };
    expect(ingressMatchesReadyToWork(wrapped as never, mapping)).toBe(true);
    expect(extractWebhookContext(wrapped as never).task_id).toBe(String(payload.task_id));
    expect(unwrapWebhookPayload(wrapped as never)).toEqual(payload);
  });
});

describe("extractWebhookContext", () => {
  it("normalizes task_id and webhook_id from the fixture payload", () => {
    const payload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const context = extractWebhookContext(payload);
    expect(context.task_id).toBe(String(payload.task_id));
    expect(context.webhook_id).toBe(String(payload.webhook_id));
    expect(context.list_id).toBe(String(payload.history_items?.[0]?.parent_id));
  });
});

describe("field extraction", () => {
  const task = readJson<ClickUpTask>(TASK_GET_FIXTURE_PATH);

  it("returns agent_id and criterios_de_aceite from the fixture task", () => {
    const mapping = fixtureFieldMapping();
    const fields = extractTaskFields(task, mapping);
    expect(fields.task_title).toBe("Launch post for Q3 product update");
    expect(fields.task_description).toContain("dashboard");
    expect(fields.criterios_de_aceite).toContain("Mention the dashboard");
    expect(fields.agent_id).toBe("linkedin-writer");
  });

  it("extracts a custom field value directly by mapping id", () => {
    const value = extractCustomFieldValue(task, "cf_criterios_001");
    expect(value).toContain("Mention the dashboard");
  });

  it("returns an empty string for an unmapped or <TBD> field id", () => {
    expect(extractCustomFieldValue(task, "")).toBe("");
    expect(extractCustomFieldValue(task, "<TBD>")).toBe("");
    expect(extractCustomFieldValue(task, "cf_does_not_exist")).toBe("");
  });

  it("returns an empty string when the matched field's value is null", () => {
    const nullValueTask: ClickUpTask = {
      ...task,
      custom_fields: [{ id: "cf_x", value: null }],
    };
    expect(extractCustomFieldValue(nullValueTask, "cf_x")).toBe("");
  });

  it("reads dropdown-style object values via value/name/label fallback keys", () => {
    const dropdownTask: ClickUpTask = {
      ...task,
      custom_fields: [{ id: "cf_dropdown", value: { name: "Approved" } }],
    };
    expect(extractCustomFieldValue(dropdownTask, "cf_dropdown")).toBe("Approved");
  });

  it("returns an empty string when an object value has no usable key", () => {
    const emptyObjectTask: ClickUpTask = {
      ...task,
      custom_fields: [{ id: "cf_empty", value: { other: "ignored" } }],
    };
    expect(extractCustomFieldValue(emptyObjectTask, "cf_empty")).toBe("");
  });

  it("falls back to the field mapping default when the agent_id custom field is blank", () => {
    const blankTask: ClickUpTask = { ...task, custom_fields: [] };
    const mapping = fixtureFieldMapping();
    const fields = extractTaskFields(blankTask, mapping);
    expect(fields.agent_id).toBe(DEFAULT_AGENT_ID);
  });

  it("builds a CallAgentInput envelope with all required keys populated", () => {
    const mapping = fixtureFieldMapping();
    const fields = extractTaskFields(task, mapping);
    const envelope = buildCallAgentInput(fields);
    for (const key of ["agent_id", "task_title", "task_description", "criterios_de_aceite"] as const) {
      expect(envelope[key]).toBeTruthy();
    }
  });
});

describe("formatClickupComment", () => {
  it("includes all three required markdown sections", () => {
    const comment = formatClickupComment(SAMPLE_AGENT_OUTPUT);
    expect(commentIncludesRequiredSections(comment)).toBe(true);
    for (const section of COMMENT_SECTIONS) {
      expect(comment).toContain(section);
    }
  });

  it("includes a footer naming the agent and model", () => {
    const comment = formatClickupComment(SAMPLE_AGENT_OUTPUT);
    const footer = commentFooter(DEFAULT_AGENT_ID, DEFAULT_MODEL);
    expect(comment).toContain(footer);
    expect(comment).toContain("Generated by linkedin-writer (gpt-4.1-mini)");
  });

  it("honors custom agentId/model overrides", () => {
    const comment = formatClickupComment(SAMPLE_AGENT_OUTPUT, { agentId: "custom-agent", model: "gemini-pro" });
    expect(comment).toContain("_Generated by custom-agent (gemini-pro)_");
  });
});

describe("agentOutputHasError", () => {
  it("detects a successful AgentOutput as error-free", () => {
    expect(agentOutputHasError(SAMPLE_AGENT_OUTPUT)).toBe(false);
  });

  it("detects an error envelope", () => {
    expect(agentOutputHasError({ error: "Failed to parse", raw_response: "{}" })).toBe(true);
  });
});

describe("statusName and fieldId", () => {
  const mapping = fixtureFieldMapping();

  it("reads a status display name by key", () => {
    expect(statusName(mapping, "writing")).toBe("writing");
  });

  it("returns an empty string for an unknown status key", () => {
    expect(statusName(mapping, "does_not_exist")).toBe("");
  });

  it("reads a custom field id by key", () => {
    expect(fieldId(mapping, "criterios_de_aceite")).toBe("cf_criterios_001");
  });

  it("returns an empty string for an unknown custom field key", () => {
    expect(fieldId(mapping, "does_not_exist")).toBe("");
  });
});

describe("workflowConnectionPath", () => {
  const workflow: N8nWorkflowExport = {
    nodes: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
    connections: {
      A: { main: [[{ node: "B" }]] },
      B: { main: [[{ node: "C" }]] },
      C: { main: [[{ node: "D" }]] },
    },
  };

  it("walks main connections from start to end", () => {
    expect(workflowConnectionPath(workflow, "A", "D")).toEqual(["A", "B", "C", "D"]);
  });

  it("returns null when no path exists", () => {
    expect(workflowConnectionPath(workflow, "D", "A")).toBeNull();
  });

  it("returns null for unknown node names", () => {
    expect(workflowConnectionPath(workflow, "A", "Z")).toBeNull();
  });

  it("skips links pointing at nodes absent from the node list", () => {
    const withDangling: N8nWorkflowExport = {
      nodes: [{ name: "A" }, { name: "B" }],
      connections: { A: { main: [[{ node: "missing" }, { node: "B" }]] } },
    };
    expect(workflowConnectionPath(withDangling, "A", "B")).toEqual(["A", "B"]);
  });

  it("does not revisit a node already on the current walk (cycle guard)", () => {
    const withCycle: N8nWorkflowExport = {
      nodes: [{ name: "A" }, { name: "B" }, { name: "C" }],
      connections: {
        A: { main: [[{ node: "B" }]] },
        B: { main: [[{ node: "A" }]] },
      },
    };
    expect(workflowConnectionPath(withCycle, "A", "C")).toBeNull();
    expect(workflowConnectionPath(withCycle, "B", "A")).toEqual(["B", "A"]);
  });
});

describe("buildMarketingPipelineWorkflow (main workflow topology)", () => {
  const mapping = fixtureFieldMapping();
  const workflow = buildMarketingPipelineWorkflow(mapping);
  const nodesByName = new Map(workflow.nodes.map((node) => [node.name, node]));

  it("is not a placeholder stub", () => {
    expect(workflow).not.toHaveProperty("_comment");
    expect(workflow.nodes.length).toBeGreaterThan(0);
  });

  it("contains Webhook, Code, and sub-workflow call node types", () => {
    const nodeTypes = new Set(workflow.nodes.map((node) => node.type));
    for (const expected of [
      "n8n-nodes-base.webhook",
      "n8n-nodes-base.if",
      "n8n-nodes-base.clickUp",
      "n8n-nodes-base.code",
      "n8n-nodes-base.executeWorkflow",
    ]) {
      expect(nodeTypes.has(expected)).toBe(true);
    }
    expect(nodeTypes.has("n8n-nodes-base.noOp")).toBe(false);
  });

  it("embeds the real custom field IDs from field-mapping.json in the Extract Task Fields Code node", () => {
    const node = nodesByName.get("Extract Task Fields");
    const code = String((node?.parameters as { jsCode?: string }).jsCode ?? "");
    expect(code).toContain(fieldId(mapping, "criterios_de_aceite"));
    expect(code).toContain(fieldId(mapping, "agent_id"));
    expect(code).toContain(DEFAULT_AGENT_ID);
  });

  it("connection graph includes a path from the webhook to the comment node", () => {
    const path = workflowConnectionPath(workflow, "ClickUp Webhook", "POST Task Comment");
    expect(path).not.toBeNull();
  });

  it("happy path node sequence is reachable end-to-end", () => {
    for (let index = 0; index < HAPPY_PATH_NODE_SEQUENCE.length - 1; index += 1) {
      const start = HAPPY_PATH_NODE_SEQUENCE[index];
      const end = HAPPY_PATH_NODE_SEQUENCE[index + 1];
      const path = workflowConnectionPath(workflow, start as string, end as string);
      expect(path).not.toBeNull();
    }
  });

  it("Execute Call Agent references the sub-workflow id placeholder", () => {
    const node = nodesByName.get("Execute Call Agent");
    const workflowId = (node?.parameters as { workflowId?: { value?: string } }).workflowId;
    expect(workflowId?.value).toBe("CALL_AGENT_WORKFLOW_ID");
  });

  it("ClickUp nodes share the credential placeholder", () => {
    const clickupNodes = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.clickUp");
    expect(clickupNodes.length).toBeGreaterThanOrEqual(3);
    for (const node of clickupNodes) {
      const credentials = node.credentials as { clickUpApi?: { id?: string } } | undefined;
      expect(credentials?.clickUpApi?.id).toBe("CLICKUP_CREDENTIAL_ID");
    }
  });

  it("Ready to Work? uses the shared ingress boolean expression", () => {
    const node = nodesByName.get("Ready to Work?");
    const conditions = (node?.parameters as {
      conditions?: {
        options?: { typeValidation?: string };
        combinator?: string;
        conditions?: Array<{ leftValue?: string; operator?: { type?: string; operation?: string } }>;
      };
    })?.conditions;
    expect(conditions?.options?.typeValidation).toBe("loose");
    expect(conditions?.combinator).toBe("and");
    expect(conditions?.conditions).toHaveLength(1);
    expect(conditions?.conditions?.[0]?.leftValue).toBe(webhookIfExpression(mapping));
    expect(conditions?.conditions?.[0]?.operator).toEqual({
      type: "boolean",
      operation: "true",
      singleValue: true,
    });
  });

  it("POST Task Comment targets task comments via commentOn=task", () => {
    const node = nodesByName.get("POST Task Comment");
    const params = node?.parameters as { commentOn?: string; resource?: string; operation?: string; id?: string };
    expect(params.resource).toBe("comment");
    expect(params.operation).toBe("create");
    expect(params.commentOn).toBe("task");
    expect(params.id).toContain("task_id");
    expect(node?.retryOnFail).toBe(true);
    expect(node?.maxTries).toBe(2);
    expect(node?.waitBetweenTries).toBe(1000);
  });

  it("logs structured ingress_skipped records instead of a noOp on non-matching webhooks", () => {
    const node = nodesByName.get("Log Ingress Skipped");
    expect(node?.type).toBe("n8n-nodes-base.code");
    const code = String((node?.parameters as { jsCode?: string }).jsCode ?? "");
    expect(code).toContain("ingress_skipped");
    expect(code).toContain("not_entering_ready");
    expect(code).toContain("no_history_items");
    expect(nodesByName.has("Ignore Non-Matching Webhook")).toBe(false);
  });

  it("deduplicates by history_item_id via workflow staticData before GET task", () => {
    const dedupNode = nodesByName.get("Dedup?");
    expect(dedupNode?.type).toBe("n8n-nodes-base.if");
    const dedupConditions = (dedupNode?.parameters as {
      conditions?: { conditions?: Array<{ leftValue?: string }> };
    })?.conditions?.conditions;
    expect(dedupConditions?.[0]?.leftValue).toContain("$getWorkflowStaticData('global')");
    expect(dedupConditions?.[0]?.leftValue).toContain("history_item_id");

    const markSeen = nodesByName.get("Mark History Item Seen");
    const markCode = String((markSeen?.parameters as { jsCode?: string }).jsCode ?? "");
    expect(markCode).toContain("seenHistoryItems");

    const duplicateLog = nodesByName.get("Log Duplicate Ingress");
    const duplicateCode = String((duplicateLog?.parameters as { jsCode?: string }).jsCode ?? "");
    expect(duplicateCode).toContain("duplicate_history_item");

    expect(workflowConnectionPath(workflow, "Extract Webhook Context", "Dedup?")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Mark History Item Seen", "GET ClickUp Task")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Dedup?", "Log Duplicate Ingress")).not.toBeNull();
  });

  it("routes agent parse failures away from the Review status update", () => {
    const path = workflowConnectionPath(workflow, "Agent Parse Failure", "Status → Review");
    expect(path).toBeNull();
    const failureNode = nodesByName.get("Agent Parse Failure");
    const code = String((failureNode?.parameters as { jsCode?: string }).jsCode ?? "");
    expect(code).toContain("throw new Error");
    expect(code).toContain("parse_success: false");
  });

  it("webhook listens on the documented ingress path", () => {
    const webhook = nodesByName.get("ClickUp Webhook");
    expect((webhook?.parameters as { path?: string }).path).toBe("marketing-pipeline-ready-to-work");
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
      for (const branch of outputs.main ?? []) {
        for (const link of branch) {
          expect(nodesByName.has(String(link.node))).toBe(true);
        }
      }
    }
  });

  it("runs with no environment variables set (offline, no network access)", () => {
    const restore = { ...process.env };
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    try {
      expect(() => buildMarketingPipelineWorkflow(mapping)).not.toThrow();
    } finally {
      process.env = restore;
    }
  });

  it("integration: buildMarketingPipelineWorkflow(loadFieldMapping()) produces parseable n8n export JSON", () => {
    const realMapping = loadFieldMapping();
    const built = buildMarketingPipelineWorkflow(realMapping);
    const parsed = JSON.parse(JSON.stringify(built)) as N8nWorkflowExport;
    expect(parsed.name).toBe("Marketing Pipeline");
    expect(parsed.nodes.length).toBe(built.nodes.length);
    expect(parsed.connections["ClickUp Webhook"]).toBeDefined();
  });
});

describe("ingress + extraction + comment assembly chain", () => {
  it("processes a Ready webhook end-to-end into a postable comment", () => {
    const webhookPayload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const mapping = fixtureFieldMapping();
    expect(ingressMatchesReadyToWork(webhookPayload, mapping)).toBe(true);

    const context = extractWebhookContext(webhookPayload);
    expect(context.task_id).toBe(webhookPayload.task_id);

    const task = readJson<ClickUpTask>(TASK_GET_FIXTURE_PATH);
    const fields = extractTaskFields(task, mapping);
    const callAgentInput = buildCallAgentInput(fields);
    expect(callAgentInput.agent_id).toBe("linkedin-writer");

    const comment = formatClickupComment(SAMPLE_AGENT_OUTPUT, { agentId: fields.agent_id });
    expect(commentIncludesRequiredSections(comment)).toBe(true);
    expect(agentOutputHasError(SAMPLE_AGENT_OUTPUT)).toBe(false);
  });
});
