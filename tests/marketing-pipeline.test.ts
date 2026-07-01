import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HAPPY_PATH_NODE_SEQUENCE,
  REVISION_PATH_NODE_SEQUENCE,
  buildCallAgentInput,
  buildRevisionTaskDescription,
  buildStageInput,
  extractLatestLeadFeedback,
  extractTaskFields,
  formatCommentThread,
  hasActionableFeedback,
  ingressMatchesNeedsReview,
  ingressMatchesReadyToWork,
  loadFieldMapping,
  selectPriorDocPageName,
  statusName,
  stagedStatusName,
  validateStageStatus,
  validateAllStageStatuses,
  validateDocPointer,
  workflowConnectionPath,
} from "../src/marketing-pipeline/logic.js";
import {
  CLICKUP_DOCS_V3_HELPERS_JS,
  createDocIfNeededJs,
  extractLatestLeadFeedbackJs,
  getOrCreateStagePage,
  prepareStagedCallAgentInputJs,
  readCurrentPageJs,
  replacePageJs,
  selectPriorDocPageJs,
} from "../src/workflows/marketing-pipeline-n8n.js";
import type { ClickUpComment, ClickUpTask, ClickUpWebhookPayload } from "../src/marketing-pipeline/logic.js";
import type { FieldMapping } from "../src/types/field-mapping.js";
import {
  INVESTIGATE_STAGE,
  WRITE_STAGE,
  FORMAT_STAGE,
  ALL_STAGES,
  getStageDefinition,
  isKnownStage,
} from "../src/marketing-pipeline/stages.js";
import { buildMarketingPipelineWorkflow } from "../src/workflows/build-marketing-pipeline.js";

const REPO_ROOT = resolve(__dirname, "..");
const READY_WEBHOOK_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-status-updated-ready-to-work.json");
const NEEDS_REVIEW_WEBHOOK_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-status-updated-needs-review.json");
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

function jsCodeFromWorkflow(workflow: ReturnType<typeof buildMarketingPipelineWorkflow>, nodeName: string): string {
  return String((nodeByName(workflow, nodeName)?.parameters as { jsCode?: string } | undefined)?.jsCode ?? "");
}

describe("marketing pipeline ingress logic", () => {
  it("accepts backlog -> ready for first drafts and approval -> needs review for revisions", () => {
    const mapping = fixtureFieldMapping();
    const readyPayload = readJson<ClickUpWebhookPayload>(READY_WEBHOOK_FIXTURE_PATH);
    const revisionPayload = readJson<ClickUpWebhookPayload>(NEEDS_REVIEW_WEBHOOK_FIXTURE_PATH);

    expect(ingressMatchesReadyToWork(readyPayload, mapping)).toBe(true);
    expect(ingressMatchesNeedsReview(readyPayload, mapping)).toBe(false);
    expect(ingressMatchesReadyToWork(revisionPayload, mapping)).toBe(false);
    expect(ingressMatchesNeedsReview(revisionPayload, mapping)).toBe(true);
  });

  it("filters self-echo and non-ingress status transitions", () => {
    const mapping = fixtureFieldMapping();
    const payload = readJson<ClickUpWebhookPayload>(READY_WEBHOOK_FIXTURE_PATH);
    const item = payload.history_items?.[0];
    const before = item?.before as Record<string, unknown>;
    const after = item?.after as Record<string, unknown>;

    before.status = statusName(mapping, "needs_review");
    after.status = statusName(mapping, "review");
    expect(ingressMatchesReadyToWork(payload, mapping)).toBe(false);
    expect(ingressMatchesNeedsReview(payload, mapping)).toBe(false);

    before.status = statusName(mapping, "ready");
    after.status = statusName(mapping, "writing");
    expect(ingressMatchesReadyToWork(payload, mapping)).toBe(false);
    expect(ingressMatchesNeedsReview(payload, mapping)).toBe(false);
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
          name: "Editorial Doc URL",
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

  it("has exactly two ingress trigger branches: ready and needs review", () => {
    expect(workflow.connections["Ready to Work?"]?.main).toEqual([
      [{ node: "Set First Draft Ingress", type: "main", index: 0 }],
      [{ node: "Needs Review?", type: "main", index: 0 }],
    ]);
    expect(workflow.connections["Needs Review?"]?.main).toEqual([
      [{ node: "Set Revision Ingress", type: "main", index: 0 }],
      [{ node: "Set Needs Review Skip Target", type: "main", index: 0 }],
    ]);
  });

  it("keeps first-draft and revision happy paths reachable", () => {
    for (let index = 0; index < HAPPY_PATH_NODE_SEQUENCE.length - 1; index += 1) {
      const start = HAPPY_PATH_NODE_SEQUENCE[index];
      const end = HAPPY_PATH_NODE_SEQUENCE[index + 1];
      expect(workflowConnectionPath(workflow, start as string, end as string), `${start} -> ${end}`).not.toBeNull();
    }
    for (let index = 0; index < REVISION_PATH_NODE_SEQUENCE.length - 1; index += 1) {
      const start = REVISION_PATH_NODE_SEQUENCE[index];
      const end = REVISION_PATH_NODE_SEQUENCE[index + 1];
      expect(workflowConnectionPath(workflow, start as string, end as string), `${start} -> ${end}`).not.toBeNull();
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

  it("posts guidance and returns to approval when revision feedback is empty", () => {
    expect(workflow.connections["Actionable Feedback?"]?.main?.[1]?.[0]?.node).toBe("Log Empty Feedback Guidance");
    expect(workflowConnectionPath(workflow, "Log Empty Feedback Guidance", "Empty Feedback → Approval")).toEqual([
      "Log Empty Feedback Guidance",
      "Format Empty Feedback Guidance",
      "POST Empty Feedback Guidance",
      "Empty Feedback → Approval",
    ]);
    expect(workflowConnectionPath(workflow, "Log Empty Feedback Guidance", "Execute Call Agent")).toBeNull();
    expect(jsCodeFromWorkflow(workflow, "Format Empty Feedback Guidance")).toContain("did not find actionable lead feedback");
  });

  it("converges first drafts and revisions into the shared Call Agent, comment, and approval path", () => {
    expect(workflowConnectionPath(workflow, "Set First Draft Ingress", "Status → Review")).toContain("Execute Call Agent");
    expect(workflowConnectionPath(workflow, "Set Revision Ingress", "Status → Review")).toEqual([
      "Set Revision Ingress",
      "Extract Webhook Context",
      "Dedup?",
      "Mark History Item Seen",
      "GET ClickUp Task",
      "Extract Task Fields",
      "Revision Ingress?",
      "GET Task Comments",
      "Collect Task Comments",
      "Actionable Feedback?",
      "Status → In Progress",
      "Prepare Revision Input?",
      "Prepare Revision Call Agent Input",
      "Execute Call Agent",
      "Agent Output OK?",
      "Format Draft Comment",
      "POST Task Comment",
      "Status → Review",
    ]);
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
