import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HAPPY_PATH_NODE_SEQUENCE,
  REVISION_PATH_NODE_SEQUENCE,
  buildCallAgentInput,
  buildRevisionTaskDescription,
  extractTaskFields,
  formatCommentThread,
  hasActionableFeedback,
  ingressMatchesNeedsReview,
  ingressMatchesReadyToWork,
  loadFieldMapping,
  statusName,
  workflowConnectionPath,
} from "../src/marketing-pipeline/logic.js";
import type { ClickUpComment, ClickUpTask, ClickUpWebhookPayload } from "../src/marketing-pipeline/logic.js";
import type { FieldMapping } from "../src/types/field-mapping.js";
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
