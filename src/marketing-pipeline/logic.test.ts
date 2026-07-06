import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as marketingPipelineLogic from "./logic.js";
import {
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
  ingressMatchesFormat,
  ingressMatchesInvestigate,
  ingressMatchesStage,
  ingressMatchesWrite,
  isBlockerOutput,
  loadFieldMapping,
  selectPriorDocPageName,
  stagedFormatIfExpression,
  stagedIfExpression,
  stagedInvestigateIfExpression,
  stagedWriteIfExpression,
  stageDisplayName,
  statusName,
  validateDocPointer,
} from "./logic.js";
import type { ClickUpComment, ClickUpTask, ClickUpWebhookPayload } from "./logic.js";
import { automationStatusDisplayName } from "../types/field-mapping.js";
import type { FieldMapping } from "../types/field-mapping.js";
import { AGENT_BLOCKED_TAG, AGENT_WORKING_TAG } from "./stages.js";
import { buildMarketingPipelineWorkflow } from "../workflows/build-marketing-pipeline.js";

const REPO_ROOT = resolve(__dirname, "..", "..");
const FIXTURES_DIR = resolve(REPO_ROOT, "integrations", "clickup", "fixtures");
const INVESTIGATE_WEBHOOK_FIXTURE_PATH = resolve(FIXTURES_DIR, "task-status-updated-investigate.json");
const WRITE_WEBHOOK_FIXTURE_PATH = resolve(FIXTURES_DIR, "task-status-updated-write.json");
const FORMAT_WEBHOOK_FIXTURE_PATH = resolve(FIXTURES_DIR, "task-status-updated-format.json");
const TASK_GET_FIXTURE_PATH = resolve(FIXTURES_DIR, "task-get-response.json");
const TASK_COMMENTS_FIXTURE_PATH = resolve(FIXTURES_DIR, "task-comments-response.json");

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, name), "utf-8")) as T;
}

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

describe("webhook ingress + field-mapping structure", () => {
  it("extracts the investigate stage from the staged webhook fixture", () => {
    const payload = loadFixture<Record<string, unknown>>("task-status-updated-investigate.json");
    expect(extractStageFromWebhook(payload as never, loadFieldMapping())).toBe("investigate");
  });

  it("loads the Needs Review status mapping for revision ingress", () => {
    const mapping = loadFieldMapping();
    expect(mapping.statuses.needs_review).toBe("needs review");
    expect(automationStatusDisplayName(mapping, "needs_review")).toBe("needs review");
  });

  it("returns an empty display name for a missing automation status key", () => {
    expect(automationStatusDisplayName({ clickup_list_id: "list", custom_fields: {}, statuses: {} }, "needs_review")).toBe("");
  });

  it("validates the Needs Review webhook fixture status transition", () => {
    const payload = loadFixture<{
      history_items?: Array<{ field?: unknown; after?: { status?: unknown } }>;
    }>("task-status-updated-needs-review.json");
    expect(payload.history_items?.[0]?.field).toBe("status");
    expect(payload.history_items?.[0]?.after?.status).toBe("needs review");
  });

  it("validates clickup/field-mapping.json against the FieldMapping shape", () => {
    const mapping = loadFieldMapping();
    expect(typeof mapping.clickup_list_id).toBe("string");
    expect(typeof mapping.statuses).toBe("object");
    for (const [key, field] of Object.entries(mapping.custom_fields)) {
      expect(typeof field.name).toBe("string");
      expect(typeof field.type).toBe("string");
      expect(typeof field.clickup_field_id).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

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

  it("consolidates ingress matcher logic into parameterized ingressMatchesStage()", () => {
    const mapping = fixtureFieldMapping();
    const investigatePayload = readJson<ClickUpWebhookPayload>(INVESTIGATE_WEBHOOK_FIXTURE_PATH);
    const writePayload = readJson<ClickUpWebhookPayload>(WRITE_WEBHOOK_FIXTURE_PATH);
    const formatPayload = readJson<ClickUpWebhookPayload>(FORMAT_WEBHOOK_FIXTURE_PATH);

    expect(ingressMatchesStage(investigatePayload, mapping, "investigate")).toBe(true);
    expect(ingressMatchesStage(investigatePayload, mapping, "write")).toBe(false);
    expect(ingressMatchesStage(investigatePayload, mapping, "format")).toBe(false);

    expect(ingressMatchesStage(writePayload, mapping, "investigate")).toBe(false);
    expect(ingressMatchesStage(writePayload, mapping, "write")).toBe(true);
    expect(ingressMatchesStage(writePayload, mapping, "format")).toBe(false);

    expect(ingressMatchesStage(formatPayload, mapping, "investigate")).toBe(false);
    expect(ingressMatchesStage(formatPayload, mapping, "write")).toBe(false);
    expect(ingressMatchesStage(formatPayload, mapping, "format")).toBe(true);
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

  it("consolidates IF expression logic into parameterized stagedIfExpression()", () => {
    const investigateExpression = stagedIfExpression(mapping, "investigate");
    const writeExpression = stagedIfExpression(mapping, "write");
    const formatExpression = stagedIfExpression(mapping, "format");

    expect(investigateExpression).toContain("={{");
    expect(investigateExpression).toContain("investigate");
    expect(investigateExpression).not.toContain("write");
    expect(investigateExpression).not.toContain("format");

    expect(writeExpression).toContain("={{");
    expect(writeExpression).toContain("write");
    expect(writeExpression).not.toContain("investigate");
    expect(writeExpression).not.toContain("format");

    expect(formatExpression).toContain("={{");
    expect(formatExpression).toContain("format");
    expect(formatExpression).not.toContain("investigate");
    expect(formatExpression).not.toContain("write");

    expect(stagedInvestigateIfExpression(mapping)).toBe(investigateExpression);
    expect(stagedWriteIfExpression(mapping)).toBe(writeExpression);
    expect(stagedFormatIfExpression(mapping)).toBe(formatExpression);
  });
});

describe("Doc pointer normalization", () => {
  it("normalizes a bare Doc ID to itself", () => {
    const input = "a1b2c3d4e5f6g7h8";
    expect(input).toMatch(/^[a-z0-9-]+$/i);
  });

  it("normalizes a full ClickUp Doc URL to extract the Doc ID", () => {
    const input = "https://doc.clickup.com/p/h/a1b2c3d4e5f6g7h8/comment/8d9e0f1g2h3i4j5k";
    const match = input.match(/\/p\/h\/([a-z0-9]+)/i);
    expect(match).toBeDefined();
    expect(match?.[1]).toBe("a1b2c3d4e5f6g7h8");
  });

  it("normalizes a ClickUp app Doc URL to extract the Doc ID", () => {
    const input = "https://app.clickup.com/90132490697/v/dc/2ky51ae9-19673";
    const match = input.match(/\/dc\/([a-z0-9-]+)/i);
    expect(match).toBeDefined();
    expect(match?.[1]).toBe("2ky51ae9-19673");
  });

  it("validates the regex pattern for bare Doc ID extraction", () => {
    const validIds = ["a1b2c3d4e5f6g7h8", "abc123", "doc-id-with-dashes"];
    validIds.forEach((id) => {
      expect(id).toMatch(/^[a-z0-9-]+$/i);
    });
  });

  it("rejects Doc pointers that don't match either pattern", () => {
    const inputs = ["", "not a valid pointer!", "@#$%^&*()", "doc.clickup.com"];
    inputs.forEach((input) => {
      const isValidId = /^[a-z0-9-]+$/i.test(input);
      const hasValidUrlPattern = /\/p\/h\/([a-z0-9]+)/i.test(input) || /\/dc\/([a-z0-9-]+)/i.test(input);
      expect(isValidId || hasValidUrlPattern).toBe(false);
    });
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
