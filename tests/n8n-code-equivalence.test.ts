import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_ID,
  DEFAULT_MODEL,
  buildCallAgentInput,
  buildRevisionTaskDescription,
  describeIngressSkipReason,
  extractTaskFields,
  extractWebhookContext,
  fieldId,
  formatCommentThread,
  formatClickupComment,
  loadFieldMapping,
} from "../src/marketing-pipeline/logic.js";
import type { ClickUpComment, ClickUpTask, ClickUpWebhookPayload } from "../src/marketing-pipeline/logic.js";
import { firstCodeNodeJson, loadCodeNodeSource, runN8nCodeNode } from "../src/workflows/n8n-codegen.js";

const REPO_ROOT = resolve(__dirname, "..");
const WEBHOOK_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-status-updated-ready-to-work.json");
const TASK_GET_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-get-response.json");
const TASK_COMMENTS_FIXTURE_PATH = resolve(REPO_ROOT, "clickup", "fixtures", "task-comments-response.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function fixtureFieldMapping() {
  const mapping = loadFieldMapping();
  mapping.custom_fields.criterios_de_aceite!.clickup_field_id = "cf_criterios_001";
  mapping.custom_fields.agent_id!.clickup_field_id = "cf_agent_id_001";
  return mapping;
}

describe("marketing pipeline n8n code equivalence", () => {
  const mapping = fixtureFieldMapping();
  const webhookPayload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
  const task = readJson<ClickUpTask>(TASK_GET_FIXTURE_PATH);
  const commentsFixture = readJson<{ comments: ClickUpComment[] }>(TASK_COMMENTS_FIXTURE_PATH);

  it("extractWebhookContext jsCode matches TypeScript logic", () => {
    const fixedNow = 1_700_000_000_000;
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "extract-webhook-context" });
    const jsResult = firstCodeNodeJson(runN8nCodeNode(jsCode, { input: webhookPayload, now: fixedNow }));
    const tsResult = extractWebhookContext(webhookPayload);

    expect(jsResult).toMatchObject({
      task_id: tsResult.task_id,
      webhook_id: tsResult.webhook_id,
      history_item_id: tsResult.history_item_id,
      list_id: tsResult.list_id,
      received_at_ms: fixedNow,
      ingress_mode: "first_draft",
    });
  });

  it("setIngressMode jsCode stamps first_draft or revision before branches merge", () => {
    const firstDraftCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "set-first-draft-ingress" });
    expect(firstCodeNodeJson(runN8nCodeNode(firstDraftCode, { input: { task_id: "t1" } }))).toMatchObject({
      task_id: "t1",
      ingress_mode: "first_draft",
    });

    const revisionCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "set-revision-ingress" });
    expect(firstCodeNodeJson(runN8nCodeNode(revisionCode, { input: { task_id: "t1" } }))).toMatchObject({
      task_id: "t1",
      ingress_mode: "revision",
    });
  });

  it("logIngressSkipped jsCode matches TypeScript skip records", () => {
    const selfEcho = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const historyItem = selfEcho.history_items?.[0];
    const after = historyItem?.after as Record<string, unknown>;
    const before = historyItem?.before as Record<string, unknown>;
    after.status = mapping.statuses.writing;
    before.status = mapping.statuses.ready;

    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "log-ingress-skipped" });
    const tsRecord = describeIngressSkipReason(selfEcho, { fieldMapping: mapping });
    const jsRecord = firstCodeNodeJson(runN8nCodeNode(jsCode, { input: selfEcho }));
    expect(jsRecord).toEqual(tsRecord);

    const revisionSkip = firstCodeNodeJson(
      runN8nCodeNode(jsCode, {
        input: { ...selfEcho, target_status_key: "needs_review" },
      })
    );
    expect(revisionSkip?.reason).toBe("not_entering_needs_review");
  });

  it("extractTaskFields jsCode matches TypeScript fields and omits revision_count", () => {
    const webhookContext = extractWebhookContext(webhookPayload);
    const tsFields = extractTaskFields(task, mapping);
    const jsCode = loadCodeNodeSource({
      workflowSlug: "marketing-pipeline",
      nodeSlug: "extract-task-fields",
      tokens: {
        FIELD_ID_CRITERIOS_DE_ACEITE: fieldId(mapping, "criterios_de_aceite"),
        FIELD_ID_AGENT_ID: fieldId(mapping, "agent_id"),
        DEFAULT_AGENT_ID: DEFAULT_AGENT_ID,
        DEFAULT_MODEL: DEFAULT_MODEL,
      },
    });
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(jsCode, {
        input: task,
        nodeOutputs: { "Extract Webhook Context": webhookContext as unknown as Record<string, unknown> },
      })
    );

    expect(jsResult).toMatchObject({
      task_id: tsFields.task_id,
      agent_id: tsFields.agent_id,
      task_title: tsFields.task_title,
      task_description: tsFields.task_description,
      criterios_de_aceite: tsFields.criterios_de_aceite,
      ingress_mode: "first_draft",
      model: "gpt-4.1-mini",
    });
    expect(jsResult).not.toHaveProperty("revision_count");
  });

  it("prepareCallAgentInput jsCode preserves first-draft input contract", () => {
    const fields = extractTaskFields(task, mapping);
    const expected = buildCallAgentInput(fields);
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "prepare-call-agent-input" });
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(jsCode, {
        input: {},
        nodeOutputs: { "Extract Task Fields": fields as unknown as Record<string, unknown> },
      })
    );
    expect(jsResult).toEqual({ ...expected, task_id: fields.task_id });
  });

  it("collectTaskComments jsCode filters generated draft comments out of feedback", () => {
    const fields = { ...extractTaskFields(task, mapping), ingress_mode: "revision" };
    const generated: ClickUpComment = {
      id: "generated",
      comment_text: "## LinkedIn Draft\n\nGenerated post\n\n## Resumo\n\nx\n\n## Autochecagem\n\nx",
      user: { username: "Lead" },
    };
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "collect-task-comments" });
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(jsCode, {
        allInputs: [generated, ...commentsFixture.comments] as unknown as Array<Record<string, unknown>>,
        nodeOutputs: { "Extract Task Fields": fields as unknown as Record<string, unknown> },
      })
    );

    expect(jsResult?.has_actionable_feedback).toBe(true);
    expect(jsResult?.comment_count).toBe(commentsFixture.comments.length + 1);
    expect(JSON.stringify(jsResult?.feedback_comments)).toContain("Shorten the hook");
    expect(JSON.stringify(jsResult?.feedback_comments)).not.toContain("Generated post");
  });

  it("prepareRevisionCallAgentInput jsCode embeds original brief, filtered feedback, and simple instructions", () => {
    const fields = { ...extractTaskFields(task, mapping), ingress_mode: "revision" };
    const feedback = commentsFixture.comments.filter((comment) => String(comment.comment_text ?? "").includes("Shorten"));
    const thread = formatCommentThread(feedback);
    const expectedDescription = buildRevisionTaskDescription(fields.task_description, thread);

    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "prepare-revision-call-agent-input" });
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(jsCode, {
        input: {},
        nodeOutputs: {
          "Extract Task Fields": fields as unknown as Record<string, unknown>,
          "Collect Task Comments": { comments: commentsFixture.comments, feedback_comments: feedback },
        },
      })
    );

    expect(jsResult).toEqual({
      agent_id: fields.agent_id,
      task_title: fields.task_title,
      task_description: expectedDescription,
      criterios_de_aceite: fields.criterios_de_aceite,
      task_id: fields.task_id,
    });
    expect(String(jsResult?.task_description)).not.toContain("revision round");
  });

  it("formatGuidanceComment jsCode posts a blocker comment for empty human feedback", () => {
    const fields = extractTaskFields(task, mapping);
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "format-empty-feedback-guidance" });
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(jsCode, {
        input: {},
        nodeOutputs: { "Extract Task Fields": fields as unknown as Record<string, unknown> },
      })
    );
    expect(jsResult).toEqual({
      task_id: fields.task_id,
      comment_text:
        "## Revision feedback needed\n\nI did not find actionable lead feedback in the comment thread, so I did not start an automated revision.\n\nPlease add a comment with the specific changes needed, then move the task back to Needs Review.",
    });
  });

  it("formatDraftComment jsCode matches TypeScript comment formatter", () => {
    const fields = extractTaskFields(task, mapping);
    const agentOutput = {
      deliverable_markdown: "Draft body",
      resumo: "Short summary",
      autochecagem: "- Criterion met",
    };
    const jsCode = loadCodeNodeSource({
      workflowSlug: "marketing-pipeline",
      nodeSlug: "format-draft-comment",
      tokens: {
        DEFAULT_AGENT_ID: DEFAULT_AGENT_ID,
        DEFAULT_MODEL: DEFAULT_MODEL,
      },
    });
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(jsCode, {
        input: {},
        nodeOutputs: {
          "Extract Task Fields": fields as unknown as Record<string, unknown>,
          "Execute Call Agent": agentOutput,
        },
      })
    );
    expect(jsResult?.comment_text).toBe(
      formatClickupComment(agentOutput, { agentId: fields.agent_id, model: "gpt-4.1-mini" })
    );
  });
});
