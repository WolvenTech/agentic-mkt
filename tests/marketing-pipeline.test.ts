import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as marketingPipelineLogic from "../src/marketing-pipeline/logic.js";
import {
  STAGED_INVESTIGATE_PATH_NODE_SEQUENCE,
  STAGED_WRITE_PATH_NODE_SEQUENCE,
  STAGED_FORMAT_PATH_NODE_SEQUENCE,
  buildCallAgentInput,
  buildRevisionTaskDescription,
  buildStageInput,
  deriveStagedIngressSkipReason,
  extractLatestLeadFeedback,
  extractStageFromWebhook,
  extractTaskFields,
  formatBlockerComment,
  formatCommentThread,
  getPreviousGateForStage,
  hasActionableFeedback,
  ingressMatchesInvestigate,
  ingressMatchesFormat,
  ingressMatchesWrite,
  isBlockerOutput,
  loadFieldMapping,
  selectPriorDocPageName,
  stagedFormatIfExpression,
  stagedInvestigateIfExpression,
  stagedWriteIfExpression,
  statusName,
  stagedStatusName,
  stageDisplayName,
  validateStageStatus,
  validateAllStageStatuses,
  validateDocPointer,
  workflowConnectionPath,
} from "../src/marketing-pipeline/logic.js";
import {
  CLICKUP_DOCS_V3_HELPERS_JS,
  createDocIfNeededJs,
  detectBlockerJs,
  extractLatestLeadFeedbackJs,
  extractTaskFieldsJs,
  extractStageJs,
  formatBlockerCommentJs,
  formatPointerCommentJs,
  getOrCreateStagePage,
  prepareStagedCallAgentInputJs,
  readCurrentPageJs,
  replacePageJs,
  selectPriorDocPageJs,
  stagedIngressIfExpression,
  updateStatusToNextGateJs,
  updateStatusToPreviousGateJs,
} from "../src/workflows/marketing-pipeline-n8n.js";
import type { ClickUpComment, ClickUpTask, ClickUpWebhookPayload } from "../src/marketing-pipeline/logic.js";
import type { FieldMapping } from "../src/types/field-mapping.js";
import {
  AGENT_BLOCKED_TAG,
  AGENT_WORKING_TAG,
  INVESTIGATE_STAGE,
  WRITE_STAGE,
  FORMAT_STAGE,
  ALL_STAGES,
  getStageDefinition,
  isKnownStage,
} from "../src/marketing-pipeline/stages.js";
import { buildMarketingPipelineWorkflow } from "../src/workflows/build-marketing-pipeline.js";

const REPO_ROOT = resolve(__dirname, "..");
const INVESTIGATE_WEBHOOK_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-status-updated-investigate.json");
const WRITE_WEBHOOK_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-status-updated-write.json");
const FORMAT_WEBHOOK_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-status-updated-format.json");
const TASK_GET_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-get-response.json");
const TASK_COMMENTS_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-comments-response.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function fixtureFieldMapping(): FieldMapping {
  const mapping = loadFieldMapping();
  mapping.custom_fields.criterios_de_aceite!.clickup_field_id = "cf_criterios_001";
  mapping.custom_fields.agent_id!.clickup_field_id = "cf_agent_id_001";
  mapping.custom_fields.editorial_doc_url!.clickup_field_id = "cf_editorial_doc_url_001";
  return mapping;
}

function nodeByName(workflow: ReturnType<typeof buildMarketingPipelineWorkflow>, name: string) {
  return workflow.nodes.find((node) => node.name === name);
}

describe("marketing pipeline ingress logic", () => {
  it("does not export the removed ready/review ingress helpers", () => {
    expect("ingressMatchesReadyToWork" in marketingPipelineLogic).toBe(false);
    expect("ingressMatchesNeedsReview" in marketingPipelineLogic).toBe(false);
    expect("needsReviewIfExpression" in marketingPipelineLogic).toBe(false);
  });

  it("accepts staged status transitions: investigate, write, format", () => {
    const mapping = fixtureFieldMapping();
    const investigatePayload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);
    const writePayload = readJson<ClickUpWebhookPayload>(WRITE_WEBHOOK_FIXTURE_PATH);
    const formatPayload = readJson<ClickUpWebhookPayload>(FORMAT_WEBHOOK_FIXTURE_PATH);

    expect(ingressMatchesInvestigate(investigatePayload, mapping)).toBe(true);
    expect(ingressMatchesWrite(investigatePayload, mapping)).toBe(false);
    expect(ingressMatchesFormat(investigatePayload, mapping)).toBe(false);

    expect(ingressMatchesInvestigate(writePayload, mapping)).toBe(false);
    expect(ingressMatchesWrite(writePayload, mapping)).toBe(true);
    expect(ingressMatchesFormat(writePayload, mapping)).toBe(false);

    expect(ingressMatchesInvestigate(formatPayload, mapping)).toBe(false);
    expect(ingressMatchesWrite(formatPayload, mapping)).toBe(false);
    expect(ingressMatchesFormat(formatPayload, mapping)).toBe(true);
  });

  it("skips non-status history items before staged extraction", () => {
    const mapping = fixtureFieldMapping();
    const payload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);
    const item = payload.history_items?.[0];

    if (item) {
      item.field = "priority";
    }
    expect(extractStageFromWebhook(payload, mapping)).toBeNull();
    expect(ingressMatchesInvestigate(payload, mapping)).toBe(false);
    expect(ingressMatchesWrite(payload, mapping)).toBe(false);
    expect(ingressMatchesFormat(payload, mapping)).toBe(false);
  });

  it("exports canonical activity tags alongside the stage model", () => {
    expect(AGENT_WORKING_TAG).toBe("agent-working");
    expect(AGENT_BLOCKED_TAG).toBe("agent-blocked");
    expect(typeof buildMarketingPipelineWorkflow).toBe("function");
  });

  it("extracts stage name from webhook payload", () => {
    const mapping = fixtureFieldMapping();
    const investigatePayload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);
    const writePayload = readJson<ClickUpWebhookPayload>(WRITE_WEBHOOK_FIXTURE_PATH);
    const formatPayload = readJson<ClickUpWebhookPayload>(FORMAT_WEBHOOK_FIXTURE_PATH);

    expect(extractStageFromWebhook(investigatePayload, mapping)).toBe("investigate");
    expect(extractStageFromWebhook(writePayload, mapping)).toBe("write");
    expect(extractStageFromWebhook(formatPayload, mapping)).toBe("format");
  });

  it("rejects human gates as non-ingress when not entering staged status", () => {
    const mapping = fixtureFieldMapping();
    const payload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);
    const item = payload.history_items?.[0];
    const after = item?.after as Record<string, unknown>;

    // Entering brief review (human gate, not AI stage)
    after.status = statusName(mapping, "brief_review");
    expect(ingressMatchesInvestigate(payload, mapping)).toBe(false);
    expect(ingressMatchesWrite(payload, mapping)).toBe(false);
    expect(ingressMatchesFormat(payload, mapping)).toBe(false);
    expect(extractStageFromWebhook(payload, mapping)).toBeNull();

    // Entering content review (human gate, not AI stage)
    after.status = statusName(mapping, "content_review");
    expect(ingressMatchesInvestigate(payload, mapping)).toBe(false);
    expect(ingressMatchesWrite(payload, mapping)).toBe(false);
    expect(ingressMatchesFormat(payload, mapping)).toBe(false);
    expect(extractStageFromWebhook(payload, mapping)).toBeNull();

    // Entering final review (human gate, not AI stage)
    after.status = statusName(mapping, "final_review");
    expect(ingressMatchesInvestigate(payload, mapping)).toBe(false);
    expect(ingressMatchesWrite(payload, mapping)).toBe(false);
    expect(ingressMatchesFormat(payload, mapping)).toBe(false);
    expect(extractStageFromWebhook(payload, mapping)).toBeNull();
  });

  it("rejects old ingress statuses when staged flow is active", () => {
    const mapping = fixtureFieldMapping();
    const payload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);
    const item = payload.history_items?.[0];
    const after = item?.after as Record<string, unknown>;

    // Old ready status should not match any staged ingress
    after.status = statusName(mapping, "ready");
    expect(ingressMatchesInvestigate(payload, mapping)).toBe(false);
    expect(ingressMatchesWrite(payload, mapping)).toBe(false);
    expect(ingressMatchesFormat(payload, mapping)).toBe(false);
    expect(extractStageFromWebhook(payload, mapping)).toBeNull();

    // Old needs_review status should not match any staged ingress
    after.status = statusName(mapping, "needs_review");
    expect(ingressMatchesInvestigate(payload, mapping)).toBe(false);
    expect(ingressMatchesWrite(payload, mapping)).toBe(false);
    expect(ingressMatchesFormat(payload, mapping)).toBe(false);
    expect(extractStageFromWebhook(payload, mapping)).toBeNull();
  });

  it("returns null stage for non-status field changes", () => {
    const mapping = fixtureFieldMapping();
    const payload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);
    const item = payload.history_items?.[0];

    if (item) {
      item.field = "priority";
    }

    expect(extractStageFromWebhook(payload, mapping)).toBeNull();
    expect(ingressMatchesInvestigate(payload, mapping)).toBe(false);
    expect(ingressMatchesWrite(payload, mapping)).toBe(false);
    expect(ingressMatchesFormat(payload, mapping)).toBe(false);
  });

  it("derives staged ingress skip reasons for non-matching payloads", () => {
    const mapping = fixtureFieldMapping();
    const payload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);

    // Non-status field should return skip reason
    const item = payload.history_items?.[0];
    if (item) {
      item.field = "priority";
    }
    expect(deriveStagedIngressSkipReason(payload, mapping)).toBe("field_not_status");

    // No history items should return skip reason
    const emptyPayload: ClickUpWebhookPayload = {
      task_id: "test",
      history_items: [],
      webhook_id: "test-webhook",
    };
    expect(deriveStagedIngressSkipReason(emptyPayload, mapping)).toBe("no_history_items");

    // Entering old status (not staged) should return skip reason
    if (item) {
      item.field = "status";
      const after = item.after as Record<string, unknown>;
      after.status = statusName(mapping, "ready");
    }
    expect(deriveStagedIngressSkipReason(payload, mapping)).toBe("not_entering_staged_status");
  });

  it("handles payload with missing history item object", () => {
    const mapping = fixtureFieldMapping();
    const payload: ClickUpWebhookPayload = {
      task_id: "test",
      history_items: undefined,
      webhook_id: "test-webhook",
    };

    expect(extractStageFromWebhook(payload, mapping)).toBeNull();
    expect(ingressMatchesInvestigate(payload, mapping)).toBe(false);
  });

  it("handles after value as string status (not object)", () => {
    const mapping = fixtureFieldMapping();
    const payload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);
    const item = payload.history_items?.[0];

    if (item) {
      item.after = statusName(mapping, "investigate");
    }

    expect(extractStageFromWebhook(payload, mapping)).toBe("investigate");
    expect(ingressMatchesInvestigate(payload, mapping)).toBe(true);
  });

  it("handles after value as null", () => {
    const mapping = fixtureFieldMapping();
    const payload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);
    const item = payload.history_items?.[0];

    if (item) {
      item.after = null;
    }

    expect(extractStageFromWebhook(payload, mapping)).toBeNull();
  });
});

describe("task and revision input shaping", () => {
  it("keeps first-draft Call Agent input unchanged and does not expose revision_count", () => {
    const mapping = fixtureFieldMapping();
    const task = readJson<ClickUpTask>(TASK_GET_FIXTURE_PATH);
    const fields = extractTaskFields(task, mapping);
    const input = buildCallAgentInput(fields);

    expect(input).toEqual({
      agent_id: fields.agent_id,
      task_title: fields.task_title,
      task_description: fields.task_description,
      criterios_de_aceite: fields.criterios_de_aceite,
    });
    expect(fields).not.toHaveProperty("revision_count");
    expect(input).not.toHaveProperty("revision_count");
  });

  it("formats actionable human comments into revision task_description", () => {
    const comments = readJson<{ comments: ClickUpComment[] }>(TASK_COMMENTS_FIXTURE_PATH).comments;
    const thread = formatCommentThread(comments.filter((comment) => hasActionableFeedback([comment])));
    const description = buildRevisionTaskDescription("Launch dashboard post", thread);

    expect(description).toContain("# Original Brief");
    expect(description).toContain("Launch dashboard post");
    expect(description).toContain("# Revision Feedback (Comment Thread)");
    expect(description).toContain("Shorten the hook");
    expect(description).toContain("# Revision Instructions");
    expect(description).toContain("Incorporate the actionable lead feedback");
    expect(description).not.toContain("revision round");
  });

  it("excludes generated draft comments and system comments from actionable feedback", () => {
    const comments: ClickUpComment[] = [
      { id: "1", comment_text: "## LinkedIn Draft\n\nGenerated body", user: { username: "Rafael" } },
      { id: "2", comment_text: "Status changed", user: { username: "ClickUp" } },
      { id: "3", comment_text: "", user: { username: "Lead" } },
    ];
    expect(hasActionableFeedback(comments)).toBe(false);

    comments.push({ id: "4", comment_text: "Make the hook sharper.", user: { username: "Lead" } });
    expect(hasActionableFeedback(comments)).toBe(true);
  });

  it("excludes [CQ-AI] pointer comments from actionable feedback", () => {
    const comments: ClickUpComment[] = [
      { id: "1", comment_text: "[CQ-AI] Updated Brief section with new angle", user: { username: "system" } },
      { id: "2", comment_text: "Make the hook sharper.", user: { username: "Lead" } },
    ];
    expect(hasActionableFeedback(comments)).toBe(true);

    const onlyPointerComment: ClickUpComment[] = [
      { id: "1", comment_text: "[CQ-AI] Stage completed", user: { username: "system" } },
    ];
    expect(hasActionableFeedback(onlyPointerComment)).toBe(false);
  });

  it("excludes [CQ-BLOCKER] blocker comments from actionable feedback", () => {
    const comments: ClickUpComment[] = [
      { id: "1", comment_text: "[CQ-BLOCKER] Unable to generate due to missing criteria", user: { username: "system" } },
      { id: "2", comment_text: "Please clarify the target audience.", user: { username: "Lead" } },
    ];
    expect(hasActionableFeedback(comments)).toBe(true);

    const onlyBlockerComment: ClickUpComment[] = [
      { id: "1", comment_text: "[CQ-BLOCKER] Missing required field", user: { username: "system" } },
    ];
    expect(hasActionableFeedback(onlyBlockerComment)).toBe(false);
  });

  it("selects latest human comment over older ones, excluding AI pointers and blockers", () => {
    const comments: ClickUpComment[] = [
      { id: "1", comment_text: "First feedback", user: { username: "Lead" }, date: "1000" },
      { id: "2", comment_text: "[CQ-AI] Brief updated", user: { username: "system" }, date: "2000" },
      { id: "3", comment_text: "Second feedback", user: { username: "Lead" }, date: "3000" },
      { id: "4", comment_text: "[CQ-BLOCKER] Blocked", user: { username: "system" }, date: "4000" },
      { id: "5", comment_text: "Third feedback (latest)", user: { username: "Lead" }, date: "5000" },
    ];
    const feedback = extractLatestLeadFeedback(comments);
    expect(feedback).toBe("Third feedback (latest)");
  });
});

describe("Doc pointer extraction and validation", () => {
  it("extracts editorial_doc_url from custom fields when present", () => {
    const mapping = fixtureFieldMapping();
    const task = readJson<ClickUpTask>(TASK_GET_FIXTURE_PATH);
    const fields = extractTaskFields(task, mapping);

    expect(fields.editorial_doc_url).toBe("https://doc.clickup.com/p/h/a1b2c3d4e5f6g7h8");
    expect(fields).toHaveProperty("editorial_doc_url");
  });

  it("returns empty pointer when field ID is missing or placeholder", () => {
    const mapping = fixtureFieldMapping();
    mapping.custom_fields.editorial_doc_url!.clickup_field_id = "<TBD>";
    const task = readJson<ClickUpTask>(TASK_GET_FIXTURE_PATH);
    const fields = extractTaskFields(task, mapping);

    expect(fields.editorial_doc_url).toBe("");
  });

  it("returns empty pointer when custom field value is null or undefined", () => {
    const mapping = fixtureFieldMapping();
    const task = readJson<ClickUpTask>(TASK_GET_FIXTURE_PATH);
    const customFields = task.custom_fields ?? [];
    const docField = customFields.find((f) => f.id === "cf_editorial_doc_url_001");
    if (docField) {
      docField.value = null;
    }
    const fields = extractTaskFields(task, mapping);

    expect(fields.editorial_doc_url).toBe("");
  });

  it("validates Doc pointer URLs starting with https", () => {
    const result = validateDocPointer("https://doc.clickup.com/p/h/a1b2c3d4e5f6g7h8");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("validates Doc pointer URLs starting with http", () => {
    const result = validateDocPointer("http://doc.clickup.com/p/h/a1b2c3d4e5f6g7h8");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("validates Doc pointer IDs containing alphanumeric and dash characters", () => {
    const result = validateDocPointer("a1b2c3d4-e5f6-g7h8");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects missing pointer with missing_pointer error", () => {
    const result = validateDocPointer("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("missing_pointer");
  });

  it("rejects malformed pointer with malformed_pointer error", () => {
    const result = validateDocPointer("not a valid pointer!");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("malformed_pointer");
  });

  it("tolerates empty pointer for initial task creation before Doc exists", () => {
    const mapping = fixtureFieldMapping();
    const task: ClickUpTask = {
      id: "task123",
      name: "New task without Doc",
      description: "Description",
      custom_fields: [
        {
          id: "cf_editorial_doc_url_001",
          name: "Editorial Doc Url",
          type: "url",
          value: "",
        },
      ],
    };
    const fields = extractTaskFields(task, mapping);

    expect(fields.editorial_doc_url).toBe("");
    const validation = validateDocPointer(fields.editorial_doc_url);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe("missing_pointer");
  });
});

describe("Marketing Pipeline topology", () => {
  const mapping = fixtureFieldMapping();
  const workflow = buildMarketingPipelineWorkflow(mapping);
  const nodes = new Set(workflow.nodes.map((node) => node.name));

  it("routes staged ingress directly into staged processing", () => {
    expect(workflow.connections["Extract Stage"]?.main).toEqual([
      [{ node: "Set Staged Ingress", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Set Staged Ingress"]?.main).toEqual([
      [{ node: "Extract Webhook Context", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Status → In Progress"]?.main).toEqual([
      [{ node: "GET Task Comments", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Collect Task Comments"]?.main).toEqual([
      [{ node: "Read Current Page", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Prepare Staged Call Agent Input"]?.main).toEqual([
      [{ node: "Add agent-working", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Add agent-working"]?.main).toEqual([
      [{ node: "Execute Call Agent", type: "main", index: 0 }],
    ]);
  });

  it("keeps dedup filtering before staged processing starts", () => {
    expect(workflow.connections["Extract Webhook Context"]?.main).toEqual([
      [{ node: "Dedup?", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Dedup?"]?.main).toEqual([
      [{ node: "Log Duplicate Ingress", type: "main", index: 0 }],
      [{ node: "Mark History Item Seen", type: "main", index: 0 }],
    ]);
  });

  it("removes legacy ready/review/revision nodes from the generated workflow", () => {
    for (const removedNode of [
      "Staged or Ready?",
      "Needs Review?",
      "Set First Draft Ingress",
      "Set Revision Ingress",
      "Revision Ingress?",
      "Prepare Revision Call Agent Input",
      "Prepare Call Agent Input",
      "Set Needs Review Skip Target",
    ]) {
      expect(nodes.has(removedNode), removedNode).toBe(false);
    }
    for (const tagNode of ["Add agent-working", "Clear activity tags", "Swap activity tags"]) {
      expect(nodes.has(tagNode), tagNode).toBe(true);
    }
  });

  it("fetches review comments through the built-in ClickUp comment getAll operation", () => {
    const node = nodeByName(workflow, "GET Task Comments");
    expect(node?.type).toBe("n8n-nodes-base.clickUp");
    expect(node?.credentials).toEqual({
      clickUpApi: { id: "CLICKUP_CREDENTIAL_ID", name: "ClickUp Marketing Pipeline" },
    });
    expect(node?.parameters).toMatchObject({
      resource: "comment",
      operation: "getAll",
      commentsOn: "task",
      limit: 50,
    });
  });

  it("keeps the staged execution chain connected from status update to Call Agent", () => {
    expect(workflowConnectionPath(workflow, "Status → In Progress", "Execute Call Agent")).toEqual([
      "Status → In Progress",
      "GET Task Comments",
      "Collect Task Comments",
      "Read Current Page",
      "Extract Latest Lead Feedback",
      "Prepare Staged Call Agent Input",
      "Add agent-working",
      "Execute Call Agent",
    ]);
    expect(workflowConnectionPath(workflow, "Prepare Staged Call Agent Input", "Status → Review")).toContain(
      "Add agent-working"
    );
  });

  it("uses first() instead of paired item lookup on the final approval status update", () => {
    const node = nodeByName(workflow, "Status → Review");
    const params = node?.parameters as { id?: string };
    expect(params.id).toBe("={{ $('Extract Task Fields').first().json.task_id }}");
    expect(params.id).not.toContain(".item.json");
  });

  it("does not contain old revision cap, restart, raw HTTP, or revision_count machinery", () => {
    for (const removedNode of [
      "Revision Cap OK?",
      "Increment Revision Count",
      "Cap Reset → Backlog",
      "Reset Revision Count",
      "Strip Restart Draft Prefix",
      "Update Restart Draft Title",
    ]) {
      expect(nodes.has(removedNode)).toBe(false);
    }
    expect(JSON.stringify(workflow)).not.toContain("CLICKUP_API_TOKEN_ID");
    expect(JSON.stringify(workflow)).not.toContain("httpHeaderAuth");
    expect(JSON.stringify(workflow)).not.toContain("revision_count");
  });
});

describe("staged ingress n8n IF expressions", () => {
  const mapping = fixtureFieldMapping();

  it("generates n8n IF expression for investigate stage ingress", () => {
    const expression = stagedInvestigateIfExpression(mapping);

    expect(expression).toContain("={{");
    expect(expression).toContain("investigate");
    expect(expression).toContain("history_items");
    expect(expression).toContain("status");
    expect(expression).not.toContain("write");
    expect(expression).not.toContain("format");
  });

  it("generates n8n IF expression for write stage ingress", () => {
    const expression = stagedWriteIfExpression(mapping);

    expect(expression).toContain("={{");
    expect(expression).toContain("write");
    expect(expression).toContain("history_items");
    expect(expression).toContain("status");
    expect(expression).not.toContain("investigate");
    expect(expression).not.toContain("format");
  });

  it("generates n8n IF expression for format stage ingress", () => {
    const expression = stagedFormatIfExpression(mapping);

    expect(expression).toContain("={{");
    expect(expression).toContain("format");
    expect(expression).toContain("history_items");
    expect(expression).toContain("status");
    expect(expression).not.toContain("investigate");
    expect(expression).not.toContain("write");
  });
});

describe("stage definitions and status mapping", () => {
  const mapping = fixtureFieldMapping();

  it("exports stage definitions from stages module", () => {
    expect(INVESTIGATE_STAGE.stage).toBe("investigate");
    expect(WRITE_STAGE.stage).toBe("write");
    expect(FORMAT_STAGE.stage).toBe("format");
    expect(ALL_STAGES).toHaveLength(3);
    expect(ALL_STAGES).toEqual([INVESTIGATE_STAGE, WRITE_STAGE, FORMAT_STAGE]);
  });

  it("each stage resolves to the expected page name and gates", () => {
    // Investigate: backlog -> Brief -> brief review
    expect(INVESTIGATE_STAGE).toMatchObject({
      stage: "investigate",
      agent_id: "investigative-brief",
      page_name: "Brief",
      previous_gate: "backlog",
      next_gate: "brief review",
    });

    // Write: brief review -> Argument -> content review
    expect(WRITE_STAGE).toMatchObject({
      stage: "write",
      agent_id: "long-form-argument",
      page_name: "Argument",
      previous_gate: "brief review",
      next_gate: "content review",
    });

    // Format: content review -> Final Draft -> final review
    expect(FORMAT_STAGE).toMatchObject({
      stage: "format",
      agent_id: "linkedin-format",
      page_name: "Final Draft",
      previous_gate: "content review",
      next_gate: "final review",
    });
  });

  it("getStageDefinition resolves all three stages by name", () => {
    const investigate = getStageDefinition("investigate");
    expect(investigate.stage).toBe("investigate");
    expect(investigate.agent_id).toBe("investigative-brief");

    const write = getStageDefinition("write");
    expect(write.stage).toBe("write");
    expect(write.agent_id).toBe("long-form-argument");

    const format = getStageDefinition("format");
    expect(format.stage).toBe("format");
    expect(format.agent_id).toBe("linkedin-format");
  });

  it("getStageDefinition throws descriptive error for unknown stage", () => {
    expect(() => getStageDefinition("invalid-stage")).toThrow(
      "Unknown stage 'invalid-stage'. Expected one of: investigate, write, format"
    );
  });

  it("isKnownStage validates stage identifier type and value", () => {
    expect(isKnownStage("investigate")).toBe(true);
    expect(isKnownStage("write")).toBe(true);
    expect(isKnownStage("format")).toBe(true);

    expect(isKnownStage("unknown")).toBe(false);
    expect(isKnownStage(null)).toBe(false);
    expect(isKnownStage(undefined)).toBe(false);
    expect(isKnownStage(123)).toBe(false);
  });

  it("stagedStatusName resolves status names from field mapping", () => {
    expect(stagedStatusName(mapping, "investigate")).toBe("investigate");
    expect(stagedStatusName(mapping, "brief_review")).toBe("brief review");
    expect(stagedStatusName(mapping, "write")).toBe("write");
    expect(stagedStatusName(mapping, "content_review")).toBe("content review");
    expect(stagedStatusName(mapping, "format")).toBe("format");
    expect(stagedStatusName(mapping, "final_review")).toBe("final review");
  });

  it("stagedStatusName throws descriptive error for missing status", () => {
    const badMapping: FieldMapping = {
      clickup_list_id: "test",
      custom_fields: {},
      statuses: { ready: "ready" },
    };

    expect(() => stagedStatusName(badMapping, "investigate")).toThrow(
      "Missing status 'investigate' in field mapping"
    );
    expect(() => stagedStatusName(badMapping, "investigate")).toThrow(
      "Available statuses:"
    );
  });

  it("validateStageStatus rejects missing staged status keys with descriptive error", () => {
    const badMapping: FieldMapping = {
      clickup_list_id: "test",
      custom_fields: {},
      statuses: { ready: "ready", writing: "writing" },
    };

    expect(() => validateStageStatus(badMapping, "investigate")).toThrow(
      "Missing staged status 'investigate' in field mapping"
    );
    expect(() => validateStageStatus(badMapping, "investigate")).toThrow(
      "Staged statuses required: investigate, brief_review, write, content_review, format, final_review"
    );
  });

  it("validateAllStageStatuses verifies all required statuses are present", () => {
    // Valid mapping should not throw
    expect(() => validateAllStageStatuses(mapping)).not.toThrow();

    // Missing statuses should throw
    const partialMapping: FieldMapping = {
      clickup_list_id: "test",
      custom_fields: {},
      statuses: {
        investigate: "investigate",
        brief_review: "brief review",
        // missing write, content_review, format, final_review
      },
    };

    expect(() => validateAllStageStatuses(partialMapping)).toThrow(
      "Missing staged statuses in field mapping: write, content_review, format, final_review"
    );
  });

  it("stage definitions work with fixture field mapping for integration testing", () => {
    validateAllStageStatuses(mapping);

    const stages = [INVESTIGATE_STAGE, WRITE_STAGE, FORMAT_STAGE];
    for (const stage of stages) {
      expect(statusName(mapping, stage.stage)).toBe(
        stage.stage === "investigate"
          ? "investigate"
          : stage.stage === "write"
            ? "write"
            : "format"
      );
    }
  });

  it("stage matrix covers all three stages with deterministic routing", () => {
    // Verify the chain: backlog -> investigate -> brief review -> write -> content review -> format -> final review
    const chain = [
      { gate: "backlog", stage: "investigate", next: "brief review" },
      { gate: "brief review", stage: "write", next: "content review" },
      { gate: "content review", stage: "format", next: "final review" },
    ];

    for (const { gate, stage, next } of chain) {
      const stagedef = ALL_STAGES.find((s) => s.stage === stage);
      expect(stagedef?.previous_gate).toBe(gate);
      expect(stagedef?.next_gate).toBe(next);
    }
  });
});

describe("n8n Doc and page helper code generation", () => {
  it("generates Doc creation code with proper error handling", () => {
    const code = createDocIfNeededJs();

    // Verify the code includes key patterns
    expect(code).toContain("createClickUpDoc");
    expect(code).toContain("editorial_doc_url");
    expect(code).toContain("doc_id");
    expect(code).toContain("doc_created");
    expect(code).toContain("CLICKUP_API_TOKEN");
    expect(code).toContain("workspace_id");
    expect(code).toContain("list_id");
  });

  it("generates stage page creation code", () => {
    const code = getOrCreateStagePage("investigate", "Brief");

    expect(code).toContain("getOrCreatePageByName");
    expect(code).toContain("page_id");
    expect(code).toContain("Brief");
    expect(code).toContain("investigate");
    expect(code).toContain("CLICKUP_API_TOKEN");
  });

  it("generates page read code", () => {
    const code = readCurrentPageJs();

    expect(code).toContain("readPageContent");
    expect(code).toContain("page_content");
    expect(code).toContain("workspace_id");
    expect(code).toContain("doc_id");
    expect(code).toContain("page_id");
  });

  it("generates page replacement code with replace mode", () => {
    const code = replacePageJs();

    expect(code).toContain("replacePage");
    expect(code).toContain("artifact_markdown");
    expect(code).toContain("page_replaced");
    expect(code).toContain("content_edit_mode");
    expect(code).toContain("CLICKUP_API_TOKEN");
  });

  it("generated code references proper stage page names from stage definitions", () => {
    // Verify each stage generates correct page name
    const stagesAndPages = [
      { stage: INVESTIGATE_STAGE.stage, pageName: INVESTIGATE_STAGE.page_name },
      { stage: WRITE_STAGE.stage, pageName: WRITE_STAGE.page_name },
      { stage: FORMAT_STAGE.stage, pageName: FORMAT_STAGE.page_name },
    ];

    for (const { stage, pageName } of stagesAndPages) {
      const code = getOrCreateStagePage(stage, pageName);
      expect(code).toContain(pageName);
      expect(code).toContain(stage);
    }
  });

  it("CLICKUP_DOCS_V3_HELPERS_JS is properly structured for n8n", () => {
    // Verify the helper functions are defined
    expect(CLICKUP_DOCS_V3_HELPERS_JS).toContain("async function docsV3Request");
    expect(CLICKUP_DOCS_V3_HELPERS_JS).toContain("async function createClickUpDoc");
    expect(CLICKUP_DOCS_V3_HELPERS_JS).toContain("async function listDocPages");
    expect(CLICKUP_DOCS_V3_HELPERS_JS).toContain("async function readPageContent");
    expect(CLICKUP_DOCS_V3_HELPERS_JS).toContain("async function replacePage");
    expect(CLICKUP_DOCS_V3_HELPERS_JS).toContain("async function getOrCreatePageByName");

    // Verify error handling patterns
    expect(CLICKUP_DOCS_V3_HELPERS_JS).toContain("success: false");
    expect(CLICKUP_DOCS_V3_HELPERS_JS).toContain("success: true");
  });
});

describe("stage input assembly", () => {
  const mapping = fixtureFieldMapping();
  const task = readJson<ClickUpTask>(TASK_GET_FIXTURE_PATH);
  const taskFields = extractTaskFields(task, mapping);
  const comments = readJson<{ comments: ClickUpComment[] }>(TASK_COMMENTS_FIXTURE_PATH).comments;

  it("investigate input does not require prior stage artifact", () => {
    const input = buildStageInput(taskFields, "investigate", "", comments);

    expect(input.agent_id).toBe(taskFields.agent_id);
    expect(input.stage).toBe("investigate");
    expect(input.task_title).toBe(taskFields.task_title);
    expect(input.task_description).toBe(taskFields.task_description);
    expect(input.criterios_de_aceite).toBe(taskFields.criterios_de_aceite);
    expect(input.prior_stage_artifact).toBeUndefined();
    expect(input.model).toBeDefined();
  });

  it("write input includes brief page markdown and lead feedback", () => {
    const briefMarkdown = "# Brief\n\nThis is the investigative brief.";
    const input = buildStageInput(taskFields, "write", briefMarkdown, comments);

    expect(input.stage).toBe("write");
    expect(input.prior_stage_artifact).toBe(briefMarkdown);
    expect(input.lead_feedback).toBeDefined();
  });

  it("format input includes argument page markdown and feedback", () => {
    const argumentMarkdown = "# Argument\n\nThis is the long-form argument.";
    const input = buildStageInput(taskFields, "format", argumentMarkdown, comments);

    expect(input.stage).toBe("format");
    expect(input.prior_stage_artifact).toBe(argumentMarkdown);
    expect(input.lead_feedback).toBeDefined();
  });

  it("represents empty feedback without throwing", () => {
    const input = buildStageInput(taskFields, "investigate", "", []);

    expect(input.lead_feedback).toBeUndefined();
    expect(() => buildStageInput(taskFields, "write", "", [])).not.toThrow();
  });

  it("extracts latest actionable lead feedback from comment thread", () => {
    const feedback = extractLatestLeadFeedback(comments);
    expect(feedback).toBeDefined();
    expect(feedback).toContain("Shorten the hook");
  });

  it("ignores empty, agent draft, and system comments when extracting feedback", () => {
    const mixedComments: ClickUpComment[] = [
      { id: "1", comment_text: "", user: { username: "Lead" } },
      { id: "2", comment_text: "## LinkedIn Draft\n\nBody", user: { username: "Bot" } },
      { id: "3", comment_text: "Status changed", user: { username: "ClickUp" } },
      { id: "4", comment_text: "Add more detail", user: { username: "Lead" } },
    ];

    const feedback = extractLatestLeadFeedback(mixedComments);
    expect(feedback).toBe("Add more detail");
  });

  it("returns empty string when no actionable feedback exists", () => {
    const systemOnlyComments: ClickUpComment[] = [
      { id: "1", comment_text: "Status changed", user: { username: "ClickUp" } },
      { id: "2", comment_text: "", user: { username: "Lead" } },
    ];

    const feedback = extractLatestLeadFeedback(systemOnlyComments);
    expect(feedback).toBe("");
  });

  it("selectPriorDocPageName returns correct page for each stage", () => {
    expect(selectPriorDocPageName("investigate")).toBeNull();
    expect(selectPriorDocPageName("write")).toBe("Brief");
    expect(selectPriorDocPageName("format")).toBe("Argument");
  });

  it("selectPriorDocPageName returns null for unknown stage", () => {
    expect(selectPriorDocPageName("unknown")).toBeNull();
  });
});

describe("n8n stage input preparation code", () => {
  it("generates select prior doc page code", () => {
    const code = selectPriorDocPageJs();

    expect(code).toContain("prior_page_name");
    expect(code).toContain("stage");
    expect(code).toContain("Brief");
    expect(code).toContain("Argument");
  });

  it("generates extract latest lead feedback code", () => {
    const code = extractLatestLeadFeedbackJs();

    expect(code).toContain("lead_feedback");
    expect(code).toContain("isActionableComment");
    expect(code).toContain("commentTimestamp");
    expect(code).toContain("Collect Task Comments");
  });

  it("generates prepare staged call agent input code", () => {
    const code = prepareStagedCallAgentInputJs();

    expect(code).toContain("stage");
    expect(code).toContain("prior_stage_artifact");
    expect(code).toContain("lead_feedback");
    expect(code).toContain("model");
    expect(code).toContain("Extract Task Fields");
    expect(code).toContain("Read Current Page");
    expect(code).toContain("Extract Latest Lead Feedback");
  });

  it("n8n code matches TypeScript stage input structure", () => {
    const prepareCode = prepareStagedCallAgentInputJs();

    // Verify all StageInput fields are present in generated code
    expect(prepareCode).toContain("agent_id");
    expect(prepareCode).toContain("stage");
    expect(prepareCode).toContain("task_title");
    expect(prepareCode).toContain("task_description");
    expect(prepareCode).toContain("criterios_de_aceite");
    expect(prepareCode).toContain("prior_stage_artifact");
    expect(prepareCode).toContain("lead_feedback");
    expect(prepareCode).toContain("model");
  });
});

describe("Marketing Pipeline stage routing", () => {
  const mapping = fixtureFieldMapping();
  const workflow = buildMarketingPipelineWorkflow(mapping);

  it("routes investigate ingress to investigative-brief agent", () => {
    const investigatePayload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);
    expect(ingressMatchesInvestigate(investigatePayload, mapping)).toBe(true);
    expect(extractStageFromWebhook(investigatePayload, mapping)).toBe("investigate");

    // Verify workflow topology includes investigate path
    expect(workflowConnectionPath(workflow, "Extract Stage", "Set Staged Ingress")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Route by Stage?", "Investigate?")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Investigate?", "Status → In Progress")).not.toBeNull();
  });

  it("routes write ingress to long-form-argument agent", () => {
    const writePayload = readJson<ClickUpWebhookPayload>(WRITE_WEBHOOK_FIXTURE_PATH);
    expect(ingressMatchesWrite(writePayload, mapping)).toBe(true);
    expect(extractStageFromWebhook(writePayload, mapping)).toBe("write");

    // Verify workflow topology includes write path
    expect(workflowConnectionPath(workflow, "Route by Stage?", "Write?")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Write?", "Status → In Progress")).not.toBeNull();
  });

  it("routes format ingress to linkedin-format agent", () => {
    const formatPayload = readJson<ClickUpWebhookPayload>(FORMAT_WEBHOOK_FIXTURE_PATH);
    expect(ingressMatchesFormat(formatPayload, mapping)).toBe(true);
    expect(extractStageFromWebhook(formatPayload, mapping)).toBe("format");

    // Verify workflow topology includes format path
    expect(workflowConnectionPath(workflow, "Route by Stage?", "Format?")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Format?", "Status → In Progress")).not.toBeNull();
  });

  it("investigate happy path reaches Execute Call Agent and next gate (brief review)", () => {
    for (let index = 0; index < STAGED_INVESTIGATE_PATH_NODE_SEQUENCE.length - 1; index += 1) {
      const start = STAGED_INVESTIGATE_PATH_NODE_SEQUENCE[index];
      const end = STAGED_INVESTIGATE_PATH_NODE_SEQUENCE[index + 1];
      expect(workflowConnectionPath(workflow, start as string, end as string), `${start} -> ${end}`).not.toBeNull();
    }
    expect(workflowConnectionPath(workflow, "Prepare Staged Call Agent Input", "Execute Call Agent")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Execute Call Agent", "Status → Next Gate")).not.toBeNull();
  });

  it("write happy path reaches Execute Call Agent and next gate (content review)", () => {
    for (let index = 0; index < STAGED_WRITE_PATH_NODE_SEQUENCE.length - 1; index += 1) {
      const start = STAGED_WRITE_PATH_NODE_SEQUENCE[index];
      const end = STAGED_WRITE_PATH_NODE_SEQUENCE[index + 1];
      expect(workflowConnectionPath(workflow, start as string, end as string), `${start} -> ${end}`).not.toBeNull();
    }
    expect(workflowConnectionPath(workflow, "Prepare Staged Call Agent Input", "Execute Call Agent")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Execute Call Agent", "Status → Next Gate")).not.toBeNull();
  });

  it("format happy path reaches Execute Call Agent and next gate (final review)", () => {
    for (let index = 0; index < STAGED_FORMAT_PATH_NODE_SEQUENCE.length - 1; index += 1) {
      const start = STAGED_FORMAT_PATH_NODE_SEQUENCE[index];
      const end = STAGED_FORMAT_PATH_NODE_SEQUENCE[index + 1];
      expect(workflowConnectionPath(workflow, start as string, end as string), `${start} -> ${end}`).not.toBeNull();
    }
    expect(workflowConnectionPath(workflow, "Prepare Staged Call Agent Input", "Execute Call Agent")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Execute Call Agent", "Status → Next Gate")).not.toBeNull();
  });

  it("staged input assembly stays linear after the status update", () => {
    expect(workflow.connections["Status → In Progress"]?.main).toEqual([
      [{ node: "GET Task Comments", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["GET Task Comments"]?.main).toEqual([
      [{ node: "Collect Task Comments", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Collect Task Comments"]?.main).toEqual([
      [{ node: "Read Current Page", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Read Current Page"]?.main).toEqual([
      [{ node: "Extract Latest Lead Feedback", type: "main", index: 0 }],
    ]);
  });

  it("routes all stages to Execute Call Agent with stage metadata", () => {
    expect(workflowConnectionPath(workflow, "Prepare Staged Call Agent Input", "Execute Call Agent")).not.toBeNull();
    const stageInputCode = prepareStagedCallAgentInputJs();
    expect(stageInputCode).toContain("stage");
    expect(stageInputCode).toContain("agent_id");
  });

  it("extracts stage in task fields to set correct agent_id", () => {
    const taskFieldsCode = extractTaskFieldsJs(mapping);
    expect(taskFieldsCode).toContain("STAGE_TO_AGENT");
    expect(taskFieldsCode).toContain("investigative-brief");
    expect(taskFieldsCode).toContain("long-form-argument");
    expect(taskFieldsCode).toContain("linkedin-format");
  });

  it("falls back to canonical stage and agent defaults when mapping entries are missing", () => {
    const sparseMapping = {
      custom_fields: {},
      statuses: {},
    } as FieldMapping;

    const taskFieldsCode = extractTaskFieldsJs(sparseMapping);
    const stageCode = extractStageJs(sparseMapping);
    const stageIfExpression = stagedIngressIfExpression(sparseMapping);

    expect(taskFieldsCode).toContain("linkedin-writer");
    expect(stageCode).toContain("stage");
    expect(stageIfExpression).toContain("investigate");
    expect(stageIfExpression).toContain("write");
    expect(stageIfExpression).toContain("format");
  });

  it("staged success path reaches Status → Next Gate (investigate)", () => {
    expect(workflowConnectionPath(workflow, "Update Status to Next Gate", "Status → Next Gate")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "POST Pointer Comment", "Status → Next Gate")).toEqual([
      "POST Pointer Comment",
      "Clear activity tags",
      "Update Status to Next Gate",
      "Status → Next Gate",
    ]);
  });

  it("staged success path replaces Doc page before posting comment", () => {
    expect(workflowConnectionPath(workflow, "Format Pointer Comment", "Replace Doc Page")).not.toBeNull();
    expect(workflowConnectionPath(workflow, "Replace Doc Page", "POST Pointer Comment")).not.toBeNull();
  });
});

describe("staged success output handling (task_17)", () => {
  const mapping = fixtureFieldMapping();
  const workflow = buildMarketingPipelineWorkflow(mapping);

  it("formats pointer comment for staged success with [CQ-AI] prefix", () => {
    const code = formatPointerCommentJs();
    expect(code).toContain("[CQ-AI]");
    expect(code).toContain("Execute Call Agent");
    expect(code).toContain("Extract Task Fields");
    expect(code).toContain("resumo");
    expect(code).toContain("self_check");
    expect(code).toContain("next_gate");
  });

  it("formats pointer comment to summarize what changed from artifact", () => {
    const code = formatPointerCommentJs();
    expect(code).toContain("artifact_markdown");
    expect(code).toContain("firstLine");
    expect(code).toContain("whatChanged");
    expect(code).toContain("**What changed:**");
  });

  it("formats pointer comment with resumo and self-check summaries", () => {
    const code = formatPointerCommentJs();
    expect(code).toContain("**Summary:**");
    expect(code).toContain("**Self-check:**");
    expect(code).toContain("agentOutput.resumo");
    expect(code).toContain("agentOutput.self_check");
  });

  it("formats pointer comment indicating next action (gate)", () => {
    const code = formatPointerCommentJs();
    expect(code).toContain("Moving to");
    expect(code).toContain("agentOutput.next_gate");
  });

  it("updates task status to the stage's next_gate using dynamic value", () => {
    const code = updateStatusToNextGateJs();
    expect(code).toContain("Format Pointer Comment");
    expect(code).toContain("next_gate");
    expect(code).toContain("STATUS_MAP");
    expect(code).toContain("brief review");
    expect(code).toContain("content review");
    expect(code).toContain("final review");
  });

  it("status update uses .first() for stable task identity reference", () => {
    const code = updateStatusToNextGateJs();
    expect(code).toContain("$('Extract Task Fields').first()");
    expect(code).not.toContain("$input.all()");
    expect(code).not.toContain(".map(");
  });

  it("status update maps next_gate to display status values", () => {
    const code = updateStatusToNextGateJs();
    expect(code).toContain("'brief review': 'Brief Review'");
    expect(code).toContain("'content review': 'Content Review'");
    expect(code).toContain("'final review': 'Final Review'");
  });

  it("status update throws on invalid next_gate values", () => {
    const code = updateStatusToNextGateJs();
    expect(code).toContain("throw new Error");
    expect(code).toContain("Invalid next_gate");
  });

  it("routes Agent Output OK to Staged Success conditional", () => {
    const agentOutputNode = nodeByName(workflow, "Agent Output OK?");
    expect(agentOutputNode).toBeDefined();
    const connections = workflow.connections["Agent Output OK?"]?.main ?? [];
    expect(connections[0]?.[0]?.node).toBe("Staged Success?");
  });

  it("branches Staged Success to blocker detection on success, draft path on fallback", () => {
    const branches = workflow.connections["Staged Success?"]?.main ?? [];
    expect(branches[0]?.[0]?.node).toBe("Detect Blocker");
    expect(branches[1]?.[0]?.node).toBe("Format Draft Comment");
  });

  it("pointer path chains: Format -> Replace -> POST -> Update -> Set Status", () => {
    const nodes = [
      "Format Pointer Comment",
      "Replace Doc Page",
      "POST Pointer Comment",
      "Clear activity tags",
      "Update Status to Next Gate",
      "Status → Next Gate",
    ];
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const from = nodes[i];
      const to = nodes[i + 1];
      expect(workflowConnectionPath(workflow, from, to), `${from} -> ${to}`).not.toBeNull();
    }
  });
});

describe("blocker output handling (task_18)", () => {
  const mapping = fixtureFieldMapping();
  const workflow = buildMarketingPipelineWorkflow(mapping);

  describe("blocker detection logic", () => {
    it("detects blocker_question field in agent output", () => {
      const blockerOutput = {
        stage: "investigate",
        artifact_markdown: "",
        resumo: "",
        self_check: "",
        next_gate: "brief review",
        blocker_question: "What is the target audience?",
      };
      expect(isBlockerOutput(blockerOutput)).toBe(true);
    });

    it("returns false when blocker_question is missing", () => {
      const successOutput = {
        stage: "investigate",
        artifact_markdown: "Some content",
        resumo: "Summary",
        self_check: "Check passed",
        next_gate: "brief review",
      };
      expect(isBlockerOutput(successOutput)).toBe(false);
    });

    it("returns false for empty blocker_question string", () => {
      const emptyBlockerOutput = {
        stage: "investigate",
        blocker_question: "",
      };
      expect(isBlockerOutput(emptyBlockerOutput)).toBe(false);
    });

    it("returns false for null/undefined blocker_question", () => {
      expect(isBlockerOutput({ blocker_question: null })).toBe(false);
      expect(isBlockerOutput({ blocker_question: undefined })).toBe(false);
    });
  });

  describe("blocker comment formatting", () => {
    it("formats blocker comment with [CQ-BLOCKER] prefix", () => {
      const comment = formatBlockerComment("What is the target audience?", "investigate");
      expect(comment).toContain("[CQ-BLOCKER]");
    });

    it("includes blocker question in formatted comment", () => {
      const question = "What is the target audience?";
      const comment = formatBlockerComment(question, "investigate");
      expect(comment).toContain(question);
    });

    it("includes stage display name in blocker comment", () => {
      const comment = formatBlockerComment("Question?", "investigate");
      expect(comment).toContain("investigation phase");
    });

    it("formats write stage as 'argument phase'", () => {
      const comment = formatBlockerComment("Question?", "write");
      expect(comment).toContain("argument phase");
    });

    it("formats format stage as 'formatting phase'", () => {
      const comment = formatBlockerComment("Question?", "format");
      expect(comment).toContain("formatting phase");
    });

    it("provides instruction to re-move task to stage", () => {
      const comment = formatBlockerComment("Question?", "investigate");
      expect(comment).toContain("move the task back to this stage");
    });
  });

  describe("stage to previous gate mapping", () => {
    it("maps investigate stage to backlog", () => {
      expect(getPreviousGateForStage("investigate")).toBe("backlog");
    });

    it("maps write stage to brief review", () => {
      expect(getPreviousGateForStage("write")).toBe("brief review");
    });

    it("maps format stage to content review", () => {
      expect(getPreviousGateForStage("format")).toBe("content review");
    });

    it("returns null for unknown stage", () => {
      expect(getPreviousGateForStage("unknown")).toBeNull();
    });
  });

  describe("stage display names", () => {
    it("displays investigate as 'investigation phase'", () => {
      expect(stageDisplayName("investigate")).toBe("investigation phase");
    });

    it("displays write as 'argument phase'", () => {
      expect(stageDisplayName("write")).toBe("argument phase");
    });

    it("displays format as 'formatting phase'", () => {
      expect(stageDisplayName("format")).toBe("formatting phase");
    });

    it("returns stage name for unknown stage", () => {
      expect(stageDisplayName("unknown")).toBe("unknown");
    });
  });

  describe("n8n blocker code generation", () => {
    it("generates detect blocker code that checks blocker_question field", () => {
      const code = detectBlockerJs();
      expect(code).toContain("blocker_question");
      expect(code).toContain("has_blocker");
      expect(code).toContain("Execute Call Agent");
    });

    it("generates blocker comment formatting code with [CQ-BLOCKER] prefix", () => {
      const code = formatBlockerCommentJs();
      expect(code).toContain("[CQ-BLOCKER]");
      expect(code).toContain("blocker_question");
      expect(code).toContain("STAGE_NAMES");
    });

    it("generates blocker comment code with stage context", () => {
      const code = formatBlockerCommentJs();
      expect(code).toContain("investigation phase");
      expect(code).toContain("argument phase");
      expect(code).toContain("formatting phase");
    });

    it("generates previous gate status update code", () => {
      const code = updateStatusToPreviousGateJs();
      expect(code).toContain("STAGE_TO_PREVIOUS_GATE");
      expect(code).toContain("investigate");
      expect(code).toContain("write");
      expect(code).toContain("format");
      expect(code).toContain("backlog");
      expect(code).toContain("brief review");
      expect(code).toContain("content review");
    });

    it("previous gate code maps to display status values", () => {
      const code = updateStatusToPreviousGateJs();
      expect(code).toContain("Backlog");
      expect(code).toContain("Brief Review");
      expect(code).toContain("Content Review");
    });

    it("previous gate code validates stage and gate values", () => {
      const code = updateStatusToPreviousGateJs();
      expect(code).toContain("throw new Error");
      expect(code).toContain("Invalid stage");
      expect(code).toContain("Invalid previous_gate");
    });
  });

  describe("blocker workflow topology", () => {
    it("has Detect Blocker node in workflow", () => {
      const node = nodeByName(workflow, "Detect Blocker");
      expect(node).toBeDefined();
      expect(node?.type).toBe("n8n-nodes-base.code");
    });

    it("has Has Blocker IF node in workflow", () => {
      const node = nodeByName(workflow, "Has Blocker?");
      expect(node).toBeDefined();
      expect(node?.type).toBe("n8n-nodes-base.if");
    });

    it("has Format Blocker Comment node in workflow", () => {
      const node = nodeByName(workflow, "Format Blocker Comment");
      expect(node).toBeDefined();
      expect(node?.type).toBe("n8n-nodes-base.code");
    });

    it("has POST Blocker Comment node in workflow", () => {
      const node = nodeByName(workflow, "POST Blocker Comment");
      expect(node).toBeDefined();
      expect(node?.type).toBe("n8n-nodes-base.clickUp");
    });

    it("has Update Status to Previous Gate node in workflow", () => {
      const node = nodeByName(workflow, "Update Status to Previous Gate");
      expect(node).toBeDefined();
      expect(node?.type).toBe("n8n-nodes-base.code");
    });

    it("has Status → Previous Gate node in workflow", () => {
      const node = nodeByName(workflow, "Status → Previous Gate");
      expect(node).toBeDefined();
      expect(node?.type).toBe("n8n-nodes-base.clickUp");
    });

    it("has activity tag lifecycle nodes in workflow", () => {
      expect(nodeByName(workflow, "Add agent-working")?.type).toBe("n8n-nodes-base.code");
      expect(nodeByName(workflow, "Clear activity tags")?.type).toBe("n8n-nodes-base.code");
      expect(nodeByName(workflow, "Swap activity tags")?.type).toBe("n8n-nodes-base.code");
    });

    it("routes Staged Success to Detect Blocker for staged outputs", () => {
      const branches = workflow.connections["Staged Success?"]?.main ?? [];
      expect(branches[0]?.[0]?.node).toBe("Detect Blocker");
    });

    it("routes Detect Blocker to Has Blocker IF node", () => {
      const connections = workflow.connections["Detect Blocker"]?.main ?? [];
      expect(connections[0]?.[0]?.node).toBe("Has Blocker?");
    });

    it("routes Has Blocker true to Format Blocker Comment", () => {
      const branches = workflow.connections["Has Blocker?"]?.main ?? [];
      expect(branches[0]?.[0]?.node).toBe("Format Blocker Comment");
    });

    it("routes Has Blocker false to Format Pointer Comment", () => {
      const branches = workflow.connections["Has Blocker?"]?.main ?? [];
      expect(branches[1]?.[0]?.node).toBe("Format Pointer Comment");
    });

    it("routes success cleanup before next-gate status return", () => {
      expect(workflow.connections["POST Pointer Comment"]?.main).toEqual([
        [{ node: "Clear activity tags", type: "main", index: 0 }],
      ]);
      expect(workflow.connections["Clear activity tags"]?.main).toEqual([
        [{ node: "Update Status to Next Gate", type: "main", index: 0 }],
      ]);
    });

    it("routes blocker tag swap before previous-gate status return", () => {
      expect(workflow.connections["POST Blocker Comment"]?.main).toEqual([
        [{ node: "Swap activity tags", type: "main", index: 0 }],
      ]);
      expect(workflow.connections["Swap activity tags"]?.main).toEqual([
        [{ node: "Update Status to Previous Gate", type: "main", index: 0 }],
      ]);
    });

    it("blocker path chains: Detect -> Has Blocker -> Format -> POST -> Update -> Set Status", () => {
      const nodes = [
        "Detect Blocker",
        "Has Blocker?",
        "Format Blocker Comment",
        "POST Blocker Comment",
        "Swap activity tags",
        "Update Status to Previous Gate",
        "Status → Previous Gate",
      ];
      for (let i = 0; i < nodes.length - 1; i += 1) {
        const from = nodes[i];
        const to = nodes[i + 1];
        expect(workflowConnectionPath(workflow, from, to), `${from} -> ${to}`).not.toBeNull();
      }
    });

    it("blocker path does NOT include Replace Doc Page node", () => {
      const path = workflowConnectionPath(workflow, "Format Blocker Comment", "Replace Doc Page");
      expect(path).toBeNull();
    });

    it("blocker path returns to previous gate, not next gate", () => {
      const blocker_path = workflowConnectionPath(
        workflow,
        "Update Status to Previous Gate",
        "Status → Previous Gate"
      );
      const next_gate_path = workflowConnectionPath(
        workflow,
        "Update Status to Previous Gate",
        "Status → Next Gate"
      );
      expect(blocker_path).not.toBeNull();
      expect(next_gate_path).toBeNull();
    });

    it("pointer comment path is still available for non-blocker success cases", () => {
      const path = workflowConnectionPath(workflow, "Format Pointer Comment", "Replace Doc Page");
      expect(path).not.toBeNull();
    });

    it("tag lifecycle nodes are unreachable from removed ready and needs review paths", () => {
      expect(workflowConnectionPath(workflow, "Staged or Ready?", "Add agent-working")).toBeNull();
      expect(workflowConnectionPath(workflow, "Needs Review?", "Clear activity tags")).toBeNull();
      expect(workflowConnectionPath(workflow, "Needs Review?", "Swap activity tags")).toBeNull();
    });

    it("Agent Output OK branches to Staged Success on success", () => {
      const agentOutputNode = nodeByName(workflow, "Agent Output OK?");
      expect(agentOutputNode).toBeDefined();
      const connections = workflow.connections["Agent Output OK?"]?.main ?? [];
      expect(connections[0]?.[0]?.node).toBe("Staged Success?");
    });

    it("investigate blocker path returns to backlog (previous gate)", () => {
      const code = updateStatusToPreviousGateJs();
      expect(code).toContain("investigate");
      expect(code).toContain("backlog");
      expect(code).toContain("Backlog");
      // Verify the mapping exists in the generated code
      expect(code).toContain("investigate");
    });

    it("write blocker path returns to brief review (previous gate)", () => {
      const code = updateStatusToPreviousGateJs();
      expect(code).toContain("write");
      expect(code).toContain("brief review");
      expect(code).toContain("Brief Review");
    });

    it("format blocker path returns to content review (previous gate)", () => {
      const code = updateStatusToPreviousGateJs();
      expect(code).toContain("format");
      expect(code).toContain("content review");
      expect(code).toContain("Content Review");
    });

    it("blocker topology reaches blocker comment then previous-gate status update for all stages", () => {
      const blocker_comment_path = workflowConnectionPath(
        workflow,
        "Format Blocker Comment",
        "POST Blocker Comment"
      );
      const status_update_path = workflowConnectionPath(
        workflow,
        "POST Blocker Comment",
        "Update Status to Previous Gate"
      );
      expect(blocker_comment_path).not.toBeNull();
      expect(status_update_path).not.toBeNull();
    });
  });
});
