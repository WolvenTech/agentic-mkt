import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleSystemPrompt,
  pairSkillContentsFromFetch,
  pairReferenceContentsFromFetch,
} from "../src/call-agent/logic.js";
import type { AgentConfig } from "../src/types/agent-config.js";
import {
  buildCallAgentInput,
  buildRevisionTaskDescription,
  describeIngressSkipReason,
  extractTaskFields,
  extractWebhookContext,
  formatCommentThread,
  formatClickupComment,
  loadFieldMapping,
} from "../src/marketing-pipeline/logic.js";
import type { ClickUpComment, ClickUpTask, ClickUpWebhookPayload } from "../src/marketing-pipeline/logic.js";
import { firstCodeNodeJson, runN8nCodeNode } from "../src/workflows/n8n-codegen.js";
import {
  collectTaskCommentsJs,
  extractTaskFieldsJs,
  extractWebhookContextJs,
  formatDraftCommentJs,
  formatGuidanceCommentJs,
  logIngressSkippedJs,
  prepareCallAgentInputJs,
  prepareRevisionCallAgentInputJs,
  setIngressModeJs,
} from "../src/workflows/marketing-pipeline-n8n.js";
import { assemblePromptJs, parseAgentConfigJs } from "../src/workflows/call-agent-n8n.js";

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
    const jsResult = firstCodeNodeJson(runN8nCodeNode(extractWebhookContextJs(), { input: webhookPayload, now: fixedNow }));
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
    expect(firstCodeNodeJson(runN8nCodeNode(setIngressModeJs("first_draft"), { input: { task_id: "t1" } }))).toMatchObject({
      task_id: "t1",
      ingress_mode: "first_draft",
    });
    expect(firstCodeNodeJson(runN8nCodeNode(setIngressModeJs("revision"), { input: { task_id: "t1" } }))).toMatchObject({
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

    const tsRecord = describeIngressSkipReason(selfEcho, { fieldMapping: mapping });
    const jsRecord = firstCodeNodeJson(runN8nCodeNode(logIngressSkippedJs(mapping), { input: selfEcho }));
    expect(jsRecord).toEqual(tsRecord);

    const revisionSkip = firstCodeNodeJson(
      runN8nCodeNode(logIngressSkippedJs(mapping), {
        input: { ...selfEcho, target_status_key: "needs_review" },
      })
    );
    expect(revisionSkip?.reason).toBe("not_entering_needs_review");
  });

  it("extractTaskFields jsCode matches TypeScript fields and omits revision_count", () => {
    const webhookContext = extractWebhookContext(webhookPayload);
    const tsFields = extractTaskFields(task, mapping);
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(extractTaskFieldsJs(mapping), {
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
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(prepareCallAgentInputJs(), {
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
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(collectTaskCommentsJs(), {
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

    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(prepareRevisionCallAgentInputJs(), {
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
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(formatGuidanceCommentJs(), {
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
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(formatDraftCommentJs(), {
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

describe("Call Agent n8n code equivalence", () => {
  function githubFilePayload(text: string): { content: string; encoding: string } {
    return { content: Buffer.from(text, "utf-8").toString("base64"), encoding: "base64" };
  }

  const stagedAgentConfig: AgentConfig = {
    id: "investigate-agent",
    provider: "openai",
    model: "gpt-4.1-mini",
    temperature: 0.7,
    max_output_tokens: 1024,
    skills: ["wolven-voice", "investigative-brief"],
    references: ["agents/references/editorial-brief.md", "agents/references/example-brief.md"],
    output_schema: {
      deliverable_markdown: "Brief findings in markdown",
      resumo: "Summary of findings",
      autochecagem: "Self-check validation",
    },
  };

  it("assemblePromptJs output structure matches local assembleSystemPrompt when processing staged config with references", () => {
    const skillContents = {
      "wolven-voice": "## Wolven Voice Skill\n\nPreserve all facts while rewriting in Wolven voice.",
      "investigative-brief": "## Investigative Brief Skill\n\nCreate a research brief with angles and evidence.",
    };

    const referenceContents = {
      "agents/references/editorial-brief.md": "## Editorial Brief Template\n\nStructure: angles, evidence, key findings.",
      "agents/references/example-brief.md": "## Example Brief\n\nHere is an example of a well-structured brief.",
    };

    const localPrompt = assembleSystemPrompt(stagedAgentConfig, skillContents, referenceContents);

    expect(localPrompt).toContain("# Agent Role");
    expect(localPrompt).toContain("# Skills");
    expect(localPrompt).toContain("# References");
    expect(localPrompt).toContain("# Required Output Format");

    for (const skill of stagedAgentConfig.skills) {
      expect(localPrompt).toContain(skill);
      expect(localPrompt).toContain(skillContents[skill]);
    }

    for (const reference of stagedAgentConfig.references) {
      expect(localPrompt).toContain(reference);
      expect(localPrompt).toContain(referenceContents[reference]);
    }

    for (const key of Object.keys(stagedAgentConfig.output_schema)) {
      expect(localPrompt).toContain(key);
    }
  });

  it("pairSkillContentsFromFetch and pairReferenceContentsFromFetch extract contents correctly for staged config", () => {
    const skillParseItems = [
      { skill: "wolven-voice" },
      { skill: "investigative-brief" },
    ];

    const skillFetchItems = [
      githubFilePayload("## Wolven Voice\n\nPreserve facts."),
      githubFilePayload("## Investigative Brief\n\nResearch brief."),
    ];

    const skillContents = pairSkillContentsFromFetch(skillParseItems, skillFetchItems);

    expect(skillContents["wolven-voice"]).toContain("Preserve facts");
    expect(skillContents["investigative-brief"]).toContain("Research brief");

    const refParseItems = [
      { reference: "agents/references/editorial-brief.md" },
      { reference: "agents/references/example-brief.md" },
    ];

    const refFetchItems = [
      githubFilePayload("## Editorial Brief\n\nStructure and angles."),
      githubFilePayload("## Example\n\nSample brief format."),
    ];

    const refContents = pairReferenceContentsFromFetch(refParseItems, refFetchItems);

    expect(refContents["agents/references/editorial-brief.md"]).toContain("Structure and angles");
    expect(refContents["agents/references/example-brief.md"]).toContain("Sample brief format");
  });
});
