import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assembleSystemPrompt,
  parseStageOutput,
  pairSkillContentsFromFetch,
  pairReferenceContentsFromFetch,
} from "../src/call-agent/logic.js";
import type { AgentConfig } from "../src/types/agent-config.js";
import { isStageError } from "../src/types/call-agent-io.js";
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
  validateStagedArtifactJs,
} from "../src/workflows/marketing-pipeline-n8n.js";
import {
  assemblePromptJs,
  parseAgentConfigJs,
  parseCallAgentOutputJs,
  parseStageOutputJs,
} from "../src/workflows/call-agent-n8n.js";

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
  mapping.custom_fields.editorial_doc_url!.clickup_field_id = "cf_editorial_doc_url_001";
  return mapping;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("marketing pipeline n8n code equivalence", () => {
  const mapping = fixtureFieldMapping();
  const webhookPayload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
  const task = readJson<ClickUpTask>(TASK_GET_FIXTURE_PATH);
  const commentsFixture = readJson<{ comments: ClickUpComment[] }>(TASK_COMMENTS_FIXTURE_PATH);

  it("extractWebhookContext jsCode matches TypeScript logic", async () => {
    const fixedNow = 1_700_000_000_000;
    const jsResult = firstCodeNodeJson(await runN8nCodeNode(extractWebhookContextJs(), { input: webhookPayload, now: fixedNow }));
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

  it("setIngressMode jsCode stamps first_draft or revision before branches merge", async () => {
    expect(firstCodeNodeJson(await runN8nCodeNode(setIngressModeJs("first_draft"), { input: { task_id: "t1" } }))).toMatchObject({
      task_id: "t1",
      ingress_mode: "first_draft",
    });
    expect(firstCodeNodeJson(await runN8nCodeNode(setIngressModeJs("revision"), { input: { task_id: "t1" } }))).toMatchObject({
      task_id: "t1",
      ingress_mode: "revision",
    });
  });

  it("logIngressSkipped jsCode matches TypeScript skip records", async () => {
    const selfEcho = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const historyItem = selfEcho.history_items?.[0];
    const after = historyItem?.after as Record<string, unknown>;
    const before = historyItem?.before as Record<string, unknown>;
    after.status = mapping.statuses.writing;
    before.status = mapping.statuses.ready;

    const tsRecord = describeIngressSkipReason(selfEcho, { fieldMapping: mapping });
    const jsRecord = firstCodeNodeJson(await runN8nCodeNode(logIngressSkippedJs(mapping), { input: selfEcho }));
    expect(jsRecord).toEqual(tsRecord);

    const revisionSkip = firstCodeNodeJson(
      await runN8nCodeNode(logIngressSkippedJs(mapping), {
        input: { ...selfEcho, target_status_key: "needs_review" },
      })
    );
    expect(revisionSkip?.reason).toBe("not_entering_needs_review");
  });

  it("extractTaskFields jsCode matches TypeScript fields and omits revision_count", async () => {
    const webhookContext = extractWebhookContext(webhookPayload);
    const tsFields = extractTaskFields(task, mapping);
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(extractTaskFieldsJs(mapping), {
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
      editorial_doc_url: tsFields.editorial_doc_url,
      workspace_id: String(task.team_id ?? ""),
      ingress_mode: "first_draft",
      model: "gpt-4.1-mini",
    });
    expect(jsResult).not.toHaveProperty("revision_count");
  });

  it("prepareCallAgentInput jsCode preserves first-draft input contract", async () => {
    const fields = extractTaskFields(task, mapping);
    const expected = buildCallAgentInput(fields);
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(prepareCallAgentInputJs(), {
        input: {},
        nodeOutputs: { "Extract Task Fields": fields as unknown as Record<string, unknown> },
      })
    );
    expect(jsResult).toEqual({ ...expected, task_id: fields.task_id });
  });

  it("collectTaskComments jsCode filters generated draft comments out of feedback", async () => {
    const fields = { ...extractTaskFields(task, mapping), ingress_mode: "revision" };
    const generated: ClickUpComment = {
      id: "generated",
      comment_text: "## LinkedIn Draft\n\nGenerated post\n\n## Resumo\n\nx\n\n## Autochecagem\n\nx",
      user: { username: "Lead" },
    };
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(collectTaskCommentsJs(), {
        allInputs: [generated, ...commentsFixture.comments] as unknown as Array<Record<string, unknown>>,
        nodeOutputs: { "Extract Task Fields": fields as unknown as Record<string, unknown> },
      })
    );

    expect(jsResult?.has_actionable_feedback).toBe(true);
    expect(jsResult?.comment_count).toBe(commentsFixture.comments.length + 1);
    expect(JSON.stringify(jsResult?.feedback_comments)).toContain("Shorten the hook");
    expect(JSON.stringify(jsResult?.feedback_comments)).not.toContain("Generated post");
  });

  it("collectTaskComments jsCode filters [CQ-AI] pointer and [CQ-BLOCKER] blocker comments", async () => {
    const fields = { ...extractTaskFields(task, mapping), ingress_mode: "revision" };
    const pointerComment: ClickUpComment = {
      id: "pointer",
      comment_text: "[CQ-AI] Brief section updated with new angle",
      user: { username: "system" },
    };
    const blockerComment: ClickUpComment = {
      id: "blocker",
      comment_text: "[CQ-BLOCKER] Missing required acceptance criteria",
      user: { username: "system" },
    };
    const humanComment: ClickUpComment = {
      id: "human",
      comment_text: "Revise the CTA to focus on conversions.",
      user: { username: "Lead" },
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(collectTaskCommentsJs(), {
        allInputs: [pointerComment, blockerComment, humanComment] as unknown as Array<Record<string, unknown>>,
        nodeOutputs: { "Extract Task Fields": fields as unknown as Record<string, unknown> },
      })
    );

    expect(jsResult?.comment_count).toBe(3);
    expect(jsResult?.has_actionable_feedback).toBe(true);
    expect(JSON.stringify(jsResult?.feedback_comments)).toContain("Revise the CTA");
    expect(JSON.stringify(jsResult?.feedback_comments)).not.toContain("[CQ-AI]");
    expect(JSON.stringify(jsResult?.feedback_comments)).not.toContain("[CQ-BLOCKER]");
  });

  it("collectTaskComments jsCode normalizes an always-output empty comment item", async () => {
    const fields = { ...extractTaskFields(task, mapping), ingress_mode: "first_draft" };
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(collectTaskCommentsJs(), {
        allInputs: [{}],
        nodeOutputs: { "Extract Task Fields": fields as unknown as Record<string, unknown> },
      })
    );

    expect(jsResult).toMatchObject({
      task_id: fields.task_id,
      comments: [],
      feedback_comments: [],
      comment_count: 0,
      has_actionable_feedback: false,
    });
  });

  it("prepareRevisionCallAgentInput jsCode embeds original brief, filtered feedback, and simple instructions", async () => {
    const fields = { ...extractTaskFields(task, mapping), ingress_mode: "revision" };
    const feedback = commentsFixture.comments.filter((comment) => String(comment.comment_text ?? "").includes("Shorten"));
    const thread = formatCommentThread(feedback);
    const expectedDescription = buildRevisionTaskDescription(fields.task_description, thread);

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(prepareRevisionCallAgentInputJs(), {
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

  it("formatGuidanceComment jsCode posts a blocker comment for empty human feedback", async () => {
    const fields = extractTaskFields(task, mapping);
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(formatGuidanceCommentJs(), {
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

  it("formatDraftComment jsCode matches TypeScript comment formatter", async () => {
    const fields = extractTaskFields(task, mapping);
    const agentOutput = {
      deliverable_markdown: "Draft body",
      resumo: "Short summary",
      autochecagem: "- Criterion met",
    };
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(formatDraftCommentJs(), {
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

  it("assemblePromptJs generates staged agent prompt examples with staged keys, not legacy keys", async () => {
    const stagedAgentConfigWithStage: AgentConfig = {
      id: "investigative-brief",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["wolven-voice", "investigative-brief"],
      references: ["agents/references/editorial-brief.md"],
      output_schema: {
        stage: "investigate",
        artifact_markdown: "The investigative brief with narrowed topic and evidence inventory",
        resumo: "2-3 sentence summary of the brief",
        self_check: "Bullet list validating the brief",
        next_gate: "brief review",
        blocker_question: "One highest-impact question when research is incomplete",
      },
    };

    const skillContents = {
      "wolven-voice": "## Wolven Voice Skill\n\nPreserve all facts.",
      "investigative-brief": "## Investigative Brief Skill\n\nCreate a research brief.",
    };

    const referenceContents = {
      "agents/references/editorial-brief.md": "## Editorial Brief Template\n\nStructure: angles, evidence.",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(assemblePromptJs(), {
        input: { all: [{ json: { agent_config: stagedAgentConfigWithStage } }] },
        nodeOutputs: {
          "Parse Agent Config": [],
          "Merge Agent Files Fetch": [{ json: { agent_config: stagedAgentConfigWithStage } }],
        },
      })
    );

    if (jsResult?.system_prompt && typeof jsResult.system_prompt === "string") {
      const prompt = jsResult.system_prompt;
      // Verify staged keys are present
      expect(prompt).toContain("stage");
      expect(prompt).toContain("artifact_markdown");
      expect(prompt).toContain("self_check");
      expect(prompt).toContain("next_gate");
      // Verify legacy keys are NOT present in the output schema example
      expect(prompt).not.toContain("deliverable_markdown");
      expect(prompt).not.toContain("autochecagem");
      // Verify references are included
      expect(prompt).toContain("# References");
      expect(prompt).toContain("agents/references/editorial-brief.md");
    }
  });

  it("assemblePromptJs generates legacy agent prompt examples with legacy keys only", async () => {
    const legacyAgentConfig: AgentConfig = {
      id: "linkedin-writer",
      provider: "openai",
      model: "gpt-4.1-mini",
      temperature: 0.7,
      max_output_tokens: 1024,
      skills: ["wolven-voice", "linkedin-format"],
      output_schema: {
        deliverable_markdown: "One valid deliverable in markdown",
        resumo: "2-3 sentence summary",
        autochecagem: "Bullet list validating the output",
      },
    };

    const skillContents = {
      "wolven-voice": "## Wolven Voice Skill\n\nPreserve facts.",
      "linkedin-format": "## LinkedIn Format Skill\n\nFormat for LinkedIn.",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(assemblePromptJs(), {
        input: { all: [{ json: { agent_config: legacyAgentConfig } }] },
        nodeOutputs: {
          "Parse Agent Config": [],
          "Merge Agent Files Fetch": [{ json: { agent_config: legacyAgentConfig } }],
        },
      })
    );

    if (jsResult?.system_prompt && typeof jsResult.system_prompt === "string") {
      const prompt = jsResult.system_prompt;
      // Verify legacy keys are present
      expect(prompt).toContain("deliverable_markdown");
      expect(prompt).toContain("resumo");
      expect(prompt).toContain("autochecagem");
      // Verify staged keys are NOT present
      expect(prompt).not.toContain('"stage"');
      expect(prompt).not.toContain("artifact_markdown");
      expect(prompt).not.toContain("self_check");
      expect(prompt).not.toContain("next_gate");
    }
  });

  it("parseStageOutputJs accepts valid investigate stage output", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "## Brief\n\nKey findings from research.",
      resumo: "Summary of findings.",
      self_check: "- All research documented",
      next_gate: "brief review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseStageOutputJs(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
        },
      })
    );

    expect(jsResult?.stage).toBe("investigate");
    expect(jsResult?.next_gate).toBe("brief review");
    expect(jsResult?.artifact_markdown).toContain("Brief");
  });

  it("parseStageOutputJs accepts valid stage output with blocker_question", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "## Brief\n\nPartial research.",
      resumo: "Incomplete findings.",
      self_check: "- Missing sources",
      next_gate: "brief review",
      blocker_question: "Can you provide additional sources?",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseStageOutputJs(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
        },
      })
    );

    expect(jsResult?.blocker_question).toBe("Can you provide additional sources?");
  });

  it("parseStageOutputJs rejects unknown stage", async () => {
    const stageOutput = {
      stage: "unknown",
      artifact_markdown: "Brief",
      resumo: "Summary",
      self_check: "Checks",
      next_gate: "brief review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseStageOutputJs(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
        },
      })
    );

    expect(jsResult?.error).toContain("Unknown stage");
  });

  it("parseStageOutputJs rejects mismatched next_gate for stage", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "Brief",
      resumo: "Summary",
      self_check: "Checks",
      next_gate: "content review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseStageOutputJs(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
        },
      })
    );

    expect(jsResult?.error).toContain("Invalid next_gate");
    expect(jsResult?.error).toContain("investigate");
  });

  it("parseStageOutputJs returns error envelope for malformed JSON", async () => {
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseStageOutputJs(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: "not-json-at-all" }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
        },
      })
    );

    expect(jsResult?.error).toContain("Failed to parse StageAgentOutput");
    expect(jsResult?.raw_response).toBe("not-json-at-all");
  });

  it("parseStageOutputJs rejects missing required keys", async () => {
    const partial = {
      stage: "investigate",
      artifact_markdown: "Brief",
      resumo: "Summary",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseStageOutputJs(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(partial) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
        },
      })
    );

    expect(jsResult?.error).toContain("Missing required keys");
  });

  it("parseStageOutputJs rejects empty artifact_markdown", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "   ",
      resumo: "Summary",
      self_check: "Checks",
      next_gate: "brief review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseStageOutputJs(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
        },
      })
    );

    expect(jsResult?.error).toContain("Empty or non-string values");
  });

  it("parseCallAgentOutputJs stamps next_gate through for a staged agent_config (regression test for missing next_gate bug)", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "## Brief\n\nKey findings from research.",
      resumo: "Summary of findings.",
      self_check: "- All research documented",
      next_gate: "brief review",
    };
    const stagedAgentConfig = {
      output_schema: {
        stage: "investigate",
        artifact_markdown: "Brief",
        resumo: "Summary",
        self_check: "Checks",
        next_gate: "brief review",
      },
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseCallAgentOutputJs(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "investigative-brief", task_id: "test-task" },
          "Assemble Prompt": { agent_config: stagedAgentConfig },
        },
      })
    );

    expect(jsResult?.next_gate).toBe("brief review");
    expect(jsResult?.stage).toBe("investigate");
    expect(jsResult?.error).toBeUndefined();
  });

  it("parseCallAgentOutputJs uses the legacy AgentOutput contract for a non-staged agent_config", async () => {
    const legacyOutput = {
      deliverable_markdown: "## Hook\n\nDraft content.",
      resumo: "Summary of the draft.",
      autochecagem: "- Checks pass",
    };
    const legacyAgentConfig = {
      output_schema: {
        deliverable_markdown: "Draft",
        resumo: "Summary",
        autochecagem: "Checks",
      },
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseCallAgentOutputJs(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(legacyOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "linkedin-writer", task_id: "test-task" },
          "Assemble Prompt": { agent_config: legacyAgentConfig },
        },
      })
    );

    expect(jsResult?.deliverable_markdown).toBe(legacyOutput.deliverable_markdown);
    expect(jsResult?.next_gate).toBeUndefined();
    expect(jsResult?.error).toBeUndefined();
  });

  it("parseCallAgentOutputJs rejects staged output missing next_gate with a staged agent_config", async () => {
    const incomplete = {
      stage: "investigate",
      artifact_markdown: "Brief",
      resumo: "Summary",
      self_check: "Checks",
    };
    const stagedAgentConfig = {
      output_schema: { stage: "investigate", artifact_markdown: "x", resumo: "x", self_check: "x", next_gate: "x" },
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseCallAgentOutputJs(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(incomplete) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "investigative-brief", task_id: "test-task" },
          "Assemble Prompt": { agent_config: stagedAgentConfig },
        },
      })
    );

    expect(jsResult?.error).toContain("Missing required keys");
    expect(jsResult?.error).toContain("next_gate");
  });
});

describe("validateStagedArtifactJs", () => {
  it("validates non-empty artifact_markdown and passes it through", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "## Brief\n\nKey findings from research.",
      resumo: "Summary of findings.",
      self_check: "- All research documented",
      next_gate: "brief review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(validateStagedArtifactJs(), {
        input: stageOutput,
        nodeOutputs: {
          "Execute Call Agent": stageOutput,
          "Extract Task Fields": { task_id: "test-123", stage: "investigate" },
        },
      })
    );

    expect(jsResult?.error).toBeUndefined();
    expect(jsResult?.artifact_markdown).toBe(stageOutput.artifact_markdown);
    expect(jsResult?.next_gate).toBe("brief review");
  });

  it("rejects empty artifact_markdown with descriptive error", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "",
      resumo: "Summary of findings.",
      self_check: "- All research documented",
      next_gate: "brief review",
    };

    try {
      await runN8nCodeNode(validateStagedArtifactJs(), {
        input: stageOutput,
        nodeOutputs: {
          "Execute Call Agent": stageOutput,
          "Extract Task Fields": { task_id: "test-123", stage: "investigate" },
        },
      });
      expect.fail("Should have thrown an error");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      expect(errorMessage).toContain("artifact_markdown");
      expect(errorMessage).toContain("Cannot proceed");
    }
  });

  it("rejects whitespace-only artifact_markdown with descriptive error", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "   \n\t  ",
      resumo: "Summary of findings.",
      self_check: "- All research documented",
      next_gate: "brief review",
    };

    try {
      await runN8nCodeNode(validateStagedArtifactJs(), {
        input: stageOutput,
        nodeOutputs: {
          "Execute Call Agent": stageOutput,
          "Extract Task Fields": { task_id: "test-123", stage: "investigate" },
        },
      });
      expect.fail("Should have thrown an error");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      expect(errorMessage).toContain("artifact_markdown");
    }
  });

  it("rejects missing artifact_markdown with descriptive error", async () => {
    const stageOutput = {
      stage: "investigate",
      resumo: "Summary of findings.",
      self_check: "- All research documented",
      next_gate: "brief review",
    };

    try {
      await runN8nCodeNode(validateStagedArtifactJs(), {
        input: stageOutput as any,
        nodeOutputs: {
          "Execute Call Agent": stageOutput,
          "Extract Task Fields": { task_id: "test-123", stage: "investigate" },
        },
      });
      expect.fail("Should have thrown an error");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      expect(errorMessage).toContain("artifact_markdown");
    }
  });

  it("trims and normalizes artifact_markdown when valid", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "  \n## Brief\n\nContent.  \n  ",
      resumo: "Summary",
      self_check: "Checks",
      next_gate: "brief review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(validateStagedArtifactJs(), {
        input: stageOutput,
        nodeOutputs: {
          "Execute Call Agent": stageOutput,
          "Extract Task Fields": { task_id: "test-123", stage: "investigate" },
        },
      })
    );

    expect(jsResult?.artifact_markdown).toBe("## Brief\n\nContent.");
  });
});
