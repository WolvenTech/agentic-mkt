import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REQUIRED_OUTPUT_KEYS,
  REQUIRED_STAGE_OUTPUT_KEYS,
  assembleSystemPrompt,
  pairSkillContentsFromFetch,
  pairReferenceContentsFromFetch,
} from "../src/call-agent/logic.js";
import type { AgentConfig } from "../src/types/agent-config.js";
import {
  DEFAULT_AGENT_ID,
  DEFAULT_MODEL,
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
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "extract-webhook-context" });
    const jsResult = firstCodeNodeJson(await runN8nCodeNode(jsCode, { input: webhookPayload, now: fixedNow }));
    const tsResult = extractWebhookContext(webhookPayload);

    expect(jsResult).toMatchObject({
      task_id: tsResult.task_id,
      webhook_id: tsResult.webhook_id,
      history_item_id: tsResult.history_item_id,
      list_id: tsResult.list_id,
      received_at_ms: fixedNow,
      ingress_mode: "first_draft",
      stage: null,
    });
  });

  it("setStagedIngress jsCode stamps first_draft ingress_mode", async () => {
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "set-staged-ingress" });
    const jsResult = firstCodeNodeJson(await runN8nCodeNode(jsCode, { input: { task_id: "t1" } }));
    expect(jsResult).toMatchObject({
      task_id: "t1",
      ingress_mode: "first_draft",
    });
  });

  it("extractStage jsCode derives stage from a status transition matching the configured investigate status", async () => {
    const jsCode = loadCodeNodeSource({
      workflowSlug: "marketing-pipeline",
      nodeSlug: "extract-stage",
      tokens: {
        STATUS_INVESTIGATE: "investigate",
        STATUS_WRITE: "write",
        STATUS_FORMAT: "format",
      },
    });
    const payload = {
      history_items: [{ field: "status", after: { status: "investigate" } }],
    };
    const jsResult = firstCodeNodeJson(await runN8nCodeNode(jsCode, { input: payload }));
    expect(jsResult?.stage).toBe("investigate");
  });

  it("extractTaskFields jsCode matches TypeScript fields, dispatches agent by stage, and includes Doc pointer fields", async () => {
    const webhookContext = extractWebhookContext(webhookPayload);
    const tsFields = extractTaskFields(task, mapping);
    const jsCode = loadCodeNodeSource({
      workflowSlug: "marketing-pipeline",
      nodeSlug: "extract-task-fields",
      tokens: {
        FIELD_ID_CRITERIOS_DE_ACEITE: fieldId(mapping, "criterios_de_aceite"),
        FIELD_ID_AGENT_ID: fieldId(mapping, "agent_id"),
        FIELD_ID_EDITORIAL_DOC_URL: fieldId(mapping, "editorial_doc_url"),
        DEFAULT_AGENT_ID: DEFAULT_AGENT_ID,
        DEFAULT_MODEL: DEFAULT_MODEL,
      },
    });
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
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
      stage: null,
    });

    for (const [stage, expectedAgentId] of [
      ["investigate", "investigative-brief"],
      ["write", "long-form-argument"],
      ["format", "linkedin-format"],
    ] as const) {
      const staged = firstCodeNodeJson(
        await runN8nCodeNode(jsCode, {
          input: task,
          nodeOutputs: {
            "Extract Webhook Context": { ...webhookContext, stage } as unknown as Record<string, unknown>,
          },
        })
      );
      expect(staged?.agent_id).toBe(expectedAgentId);
      expect(staged?.stage).toBe(stage);
    }
  });

  it("collectTaskComments jsCode filters generated draft comments out of feedback", async () => {
    const fields = { ...extractTaskFields(task, mapping), ingress_mode: "revision" };
    const generated: ClickUpComment = {
      id: "generated",
      comment_text: "## LinkedIn Draft\n\nGenerated post\n\n## Resumo\n\nx\n\n## Autochecagem\n\nx",
      user: { username: "Lead" },
    };
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "collect-task-comments" });
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
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

    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "collect-task-comments" });
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
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
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "collect-task-comments" });
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
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

  it("extractLatestLeadFeedback jsCode surfaces the most recent actionable comment", async () => {
    const fields = extractTaskFields(task, mapping);
    const feedback = commentsFixture.comments.filter((comment) => String(comment.comment_text ?? "").includes("Shorten"));
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "extract-latest-lead-feedback" });
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
        input: {},
        nodeOutputs: {
          "Extract Task Fields": fields as unknown as Record<string, unknown>,
          "Collect Task Comments": { comments: commentsFixture.comments, feedback_comments: feedback },
        },
      })
    );

    expect(jsResult?.task_id).toBe(fields.task_id);
    expect(String(jsResult?.lead_feedback ?? "")).toContain("Shorten");
  });

  it("formatDraftComment jsCode matches TypeScript comment formatter", async () => {
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
      await runN8nCodeNode(jsCode, {
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

  it("formatPointerComment jsCode builds a [CQ-AI] pointer comment from staged output", async () => {
    const fields = extractTaskFields(task, mapping);
    const agentOutput = {
      artifact_markdown: "# Great Hook\n\nBody text.",
      resumo: "Short summary",
      self_check: "- Checks pass",
      next_gate: "brief review",
    };
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "format-pointer-comment" });
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
        input: {},
        nodeOutputs: {
          "Extract Task Fields": fields as unknown as Record<string, unknown>,
          "Execute Call Agent": agentOutput,
        },
      })
    );
    expect(jsResult?.comment_text).toContain("[CQ-AI]");
    expect(jsResult?.comment_text).toContain("Great Hook");
    expect(jsResult?.next_gate).toBe("brief review");
  });

  it("formatBlockerComment jsCode builds a [CQ-BLOCKER] comment with the stage's question", async () => {
    const fields = { ...extractTaskFields(task, mapping), stage: "investigate" };
    const agentOutput = { blocker_question: "What is the target audience?" };
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "format-blocker-comment" });
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
        input: {},
        nodeOutputs: {
          "Extract Task Fields": fields as unknown as Record<string, unknown>,
          "Execute Call Agent": agentOutput,
        },
      })
    );
    expect(jsResult?.comment_text).toContain("[CQ-BLOCKER]");
    expect(jsResult?.comment_text).toContain("What is the target audience?");
  });

  it("updateStatusToNextGate jsCode maps next_gate to the human review status", async () => {
    const fields = extractTaskFields(task, mapping);
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-next-gate" });
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
        input: {},
        nodeOutputs: {
          "Extract Task Fields": fields as unknown as Record<string, unknown>,
          "Format Pointer Comment": { task_id: fields.task_id, comment_text: "x" },
          "Execute Call Agent": { next_gate: "brief review" },
        },
      })
    );
    expect(jsResult?.status_to_set).toBe("Brief Review");
  });

  it("updateStatusToPreviousGate jsCode maps stage to its previous human gate status", async () => {
    const fields = { ...extractTaskFields(task, mapping), stage: "write" };
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "update-status-to-previous-gate" });
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
        input: {},
        nodeOutputs: { "Extract Task Fields": fields as unknown as Record<string, unknown> },
      })
    );
    expect(jsResult?.status_to_set).toBe("Brief Review");
    expect(jsResult?.previous_gate).toBe("brief review");
  });

  it("detectBlocker jsCode flags has_blocker true only when blocker_question is present", async () => {
    const jsCode = loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "detect-blocker" });

    const withBlocker = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
        input: {},
        nodeOutputs: { "Execute Call Agent": { blocker_question: "Need more info" } },
      })
    );
    expect(withBlocker?.has_blocker).toBe(true);

    const withoutBlocker = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
        input: {},
        nodeOutputs: { "Execute Call Agent": { artifact_markdown: "content" } },
      })
    );
    expect(withoutBlocker?.has_blocker).toBe(false);
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

  it("assembleSystemPrompt output structure matches local assembleSystemPrompt when processing staged config with references", () => {
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

  it("assemble-prompt jsCode generates staged agent prompt examples with staged keys, not legacy keys", async () => {
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

    const jsCode = loadCodeNodeSource({
      workflowSlug: "call-agent",
      nodeSlug: "assemble-prompt",
      tokens: {
        DEFAULT_TEMPERATURE: 0.7,
        DEFAULT_MAX_OUTPUT_TOKENS: 1024,
        DEFAULT_PROVIDER: "openai",
        DEFAULT_MODEL,
      },
    });

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
        input: { all: [{ json: { agent_config: stagedAgentConfigWithStage } }] },
        nodeOutputs: {
          "Parse Agent Config": [],
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

  it("assemble-prompt jsCode generates legacy agent prompt examples with legacy keys only", async () => {
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

    const jsCode = loadCodeNodeSource({
      workflowSlug: "call-agent",
      nodeSlug: "assemble-prompt",
      tokens: {
        DEFAULT_TEMPERATURE: 0.7,
        DEFAULT_MAX_OUTPUT_TOKENS: 1024,
        DEFAULT_PROVIDER: "openai",
        DEFAULT_MODEL,
      },
    });

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode, {
        input: { all: [{ json: { agent_config: legacyAgentConfig } }] },
        nodeOutputs: {
          "Parse Agent Config": [],
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

  function parseAgentOutputJsCode(): string {
    return loadCodeNodeSource({
      workflowSlug: "call-agent",
      nodeSlug: "parse-agent-output",
      tokens: { REQUIRED_OUTPUT_KEYS: [...REQUIRED_OUTPUT_KEYS], REQUIRED_STAGE_OUTPUT_KEYS: [...REQUIRED_STAGE_OUTPUT_KEYS] },
    });
  }

  const stagedDispatchAgentConfig = {
    output_schema: { stage: "investigate", artifact_markdown: "x", resumo: "x", self_check: "x", next_gate: "x" },
  };

  it("parse-agent-output jsCode accepts valid investigate stage output", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "## Brief\n\nKey findings from research.",
      resumo: "Summary of findings.",
      self_check: "- All research documented",
      next_gate: "brief review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseAgentOutputJsCode(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
          "Assemble Prompt": { agent_config: stagedDispatchAgentConfig },
        },
      })
    );

    expect(jsResult?.stage).toBe("investigate");
    expect(jsResult?.next_gate).toBe("brief review");
    expect(jsResult?.artifact_markdown).toContain("Brief");
  });

  it("parse-agent-output jsCode accepts valid stage output with blocker_question", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "## Brief\n\nPartial research.",
      resumo: "Incomplete findings.",
      self_check: "- Missing sources",
      next_gate: "brief review",
      blocker_question: "Can you provide additional sources?",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseAgentOutputJsCode(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
          "Assemble Prompt": { agent_config: stagedDispatchAgentConfig },
        },
      })
    );

    expect(jsResult?.blocker_question).toBe("Can you provide additional sources?");
  });

  it("parse-agent-output jsCode rejects unknown stage", async () => {
    const stageOutput = {
      stage: "unknown",
      artifact_markdown: "Brief",
      resumo: "Summary",
      self_check: "Checks",
      next_gate: "brief review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseAgentOutputJsCode(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
          "Assemble Prompt": { agent_config: stagedDispatchAgentConfig },
        },
      })
    );

    expect(jsResult?.error).toContain("Unknown stage");
  });

  it("parse-agent-output jsCode rejects mismatched next_gate for stage", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "Brief",
      resumo: "Summary",
      self_check: "Checks",
      next_gate: "content review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseAgentOutputJsCode(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
          "Assemble Prompt": { agent_config: stagedDispatchAgentConfig },
        },
      })
    );

    expect(jsResult?.error).toContain("Invalid next_gate");
    expect(jsResult?.error).toContain("investigate");
  });

  it("parse-agent-output jsCode returns error envelope for malformed JSON", async () => {
    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseAgentOutputJsCode(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: "not-json-at-all" }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
          "Assemble Prompt": { agent_config: stagedDispatchAgentConfig },
        },
      })
    );

    expect(jsResult?.error).toContain("Failed to parse StageAgentOutput");
    expect(jsResult?.raw_response).toBe("not-json-at-all");
  });

  it("parse-agent-output jsCode rejects missing required keys", async () => {
    const partial = {
      stage: "investigate",
      artifact_markdown: "Brief",
      resumo: "Summary",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseAgentOutputJsCode(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(partial) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
          "Assemble Prompt": { agent_config: stagedDispatchAgentConfig },
        },
      })
    );

    expect(jsResult?.error).toContain("Missing required keys");
  });

  it("parse-agent-output jsCode rejects empty artifact_markdown", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "   ",
      resumo: "Summary",
      self_check: "Checks",
      next_gate: "brief review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseAgentOutputJsCode(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "test-agent", task_id: "test-task" },
          "Assemble Prompt": { agent_config: stagedDispatchAgentConfig },
        },
      })
    );

    expect(jsResult?.error).toContain("Empty or non-string values");
  });

  it("parse-agent-output jsCode stamps next_gate through for a staged agent_config (regression test for missing next_gate bug)", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "## Brief\n\nKey findings from research.",
      resumo: "Summary of findings.",
      self_check: "- All research documented",
      next_gate: "brief review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseAgentOutputJsCode(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(stageOutput) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "investigative-brief", task_id: "test-task" },
          "Assemble Prompt": { agent_config: stagedDispatchAgentConfig },
        },
      })
    );

    expect(jsResult?.next_gate).toBe("brief review");
    expect(jsResult?.stage).toBe("investigate");
    expect(jsResult?.error).toBeUndefined();
  });

  it("parse-agent-output jsCode uses the legacy AgentOutput contract for a non-staged agent_config", async () => {
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
      await runN8nCodeNode(parseAgentOutputJsCode(), {
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

  it("parse-agent-output jsCode rejects staged output missing next_gate with a staged agent_config", async () => {
    const incomplete = {
      stage: "investigate",
      artifact_markdown: "Brief",
      resumo: "Summary",
      self_check: "Checks",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(parseAgentOutputJsCode(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(incomplete) }] }] },
        nodeOutputs: {
          "Store Input Context": { _started_at_ms: Date.now(), agent_id: "investigative-brief", task_id: "test-task" },
          "Assemble Prompt": { agent_config: stagedDispatchAgentConfig },
        },
      })
    );

    expect(jsResult?.error).toContain("Missing required keys");
    expect(jsResult?.error).toContain("next_gate");
  });
});

describe("validate-staged-artifact jsCode", () => {
  function jsCode(): string {
    return loadCodeNodeSource({ workflowSlug: "marketing-pipeline", nodeSlug: "validate-staged-artifact" });
  }

  it("validates non-empty artifact_markdown and passes it through", async () => {
    const stageOutput = {
      stage: "investigate",
      artifact_markdown: "## Brief\n\nKey findings from research.",
      resumo: "Summary of findings.",
      self_check: "- All research documented",
      next_gate: "brief review",
    };

    const jsResult = firstCodeNodeJson(
      await runN8nCodeNode(jsCode(), {
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
      await runN8nCodeNode(jsCode(), {
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
      await runN8nCodeNode(jsCode(), {
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
      await runN8nCodeNode(jsCode(), {
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
      await runN8nCodeNode(jsCode(), {
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
