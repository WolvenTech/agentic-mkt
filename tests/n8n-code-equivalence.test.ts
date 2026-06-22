import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractOpenAIText,
  parseAgentOutput,
  stripJsonFences,
} from "../src/call-agent/logic.js";
import { isAgentError } from "../src/types/call-agent-io.js";
import {
  DEFAULT_AGENT_ID,
  DEFAULT_MODEL,
  buildCallAgentInput,
  describeIngressSkipReason,
  extractTaskFields,
  extractWebhookContext,
  formatClickupComment,
  loadFieldMapping,
} from "../src/marketing-pipeline/logic.js";
import type { ClickUpTask, ClickUpWebhookPayload } from "../src/marketing-pipeline/logic.js";
import { buildCallAgentWorkflow } from "../src/workflows/build-call-agent.js";
import {
  EXTRACT_OPENAI_TEXT_JS,
  STRIP_JSON_FENCES_JS,
  parseAgentOutputJs,
} from "../src/workflows/call-agent-n8n.js";
import { buildMarketingPipelineWorkflow } from "../src/workflows/build-marketing-pipeline.js";
import { firstCodeNodeJson, runN8nCodeNode } from "../src/workflows/n8n-codegen.js";
import {
  extractTaskFieldsJs,
  extractWebhookContextJs,
  formatDraftCommentJs,
  logIngressSkippedJs,
  prepareCallAgentInputJs,
} from "../src/workflows/marketing-pipeline-n8n.js";

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

function fixtureFieldMapping() {
  const mapping = loadFieldMapping();
  mapping.custom_fields.criterios_de_aceite!.clickup_field_id = "cf_criterios_001";
  mapping.custom_fields.agent_id!.clickup_field_id = "cf_agent_id_001";
  return mapping;
}

function jsCodeFromWorkflow(
  workflow: ReturnType<typeof buildMarketingPipelineWorkflow>,
  nodeName: string
): string {
  const node = workflow.nodes.find((n) => n.name === nodeName);
  return String((node?.parameters as { jsCode?: string }).jsCode ?? "");
}

function runHelperJs(body: string, vars: Record<string, unknown>): unknown {
  const keys = Object.keys(vars);
  const fn = new Function(...keys, body);
  return fn(...keys.map((key) => vars[key]));
}

describe("marketing pipeline Code node equivalence", () => {
  const mapping = fixtureFieldMapping();
  const workflow = buildMarketingPipelineWorkflow(mapping);
  const webhookPayload = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
  const task = readJson<ClickUpTask>(TASK_GET_FIXTURE_PATH);

  it("extractWebhookContext jsCode matches extractWebhookContext()", () => {
    const fixedNow = 1_700_000_000_000;
    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(extractWebhookContextJs(), { input: webhookPayload, now: fixedNow })
    );
    const tsResult = extractWebhookContext(webhookPayload);

    expect(jsResult).toMatchObject({
      task_id: tsResult.task_id,
      webhook_id: tsResult.webhook_id,
      history_item_id: tsResult.history_item_id,
      list_id: tsResult.list_id,
      received_at_ms: fixedNow,
    });
    expect(jsCodeFromWorkflow(workflow, "Extract Webhook Context")).toBe(extractWebhookContextJs());
  });

  it("logIngressSkipped jsCode matches describeIngressSkipReason()", () => {
    const selfEcho = readJson<ClickUpWebhookPayload>(WEBHOOK_FIXTURE_PATH);
    const historyItem = selfEcho.history_items?.[0];
    const after = historyItem?.after as Record<string, unknown>;
    const before = historyItem?.before as Record<string, unknown>;
    after.status = mapping.statuses.writing;
    before.status = mapping.statuses.ready;

    const tsRecord = describeIngressSkipReason(selfEcho, { fieldMapping: mapping });
    const jsRecord = firstCodeNodeJson(runN8nCodeNode(logIngressSkippedJs(mapping), { input: selfEcho }));

    expect(jsRecord).toEqual(tsRecord);
  });

  it("extractTaskFields jsCode matches extractTaskFields()", () => {
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
      model: DEFAULT_MODEL,
    });
  });

  it("prepareCallAgentInput jsCode matches buildCallAgentInput()", () => {
    const tsFields = extractTaskFields(task, mapping);
    const tsInput = buildCallAgentInput(tsFields);

    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(prepareCallAgentInputJs(), {
        input: {},
        nodeOutputs: {
          "Extract Task Fields": {
            ...tsFields,
            model: DEFAULT_MODEL,
          },
        },
      })
    );

    expect(jsResult).toEqual({ ...tsInput, task_id: tsFields.task_id });
  });

  it("formatDraftComment jsCode comment_text matches formatClickupComment()", () => {
    const tsFields = extractTaskFields(task, mapping);
    const expectedComment = formatClickupComment(SAMPLE_AGENT_OUTPUT, {
      agentId: tsFields.agent_id,
      model: DEFAULT_MODEL,
    });

    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(formatDraftCommentJs(), {
        input: {},
        nodeOutputs: {
          "Execute Call Agent": SAMPLE_AGENT_OUTPUT,
          "Extract Task Fields": { ...tsFields, model: DEFAULT_MODEL },
        },
      })
    );

    expect(jsResult?.comment_text).toBe(expectedComment);
    expect(jsResult?.agent_id).toBe(tsFields.agent_id);
  });
});

describe("call agent Code node equivalence", () => {
  const workflow = buildCallAgentWorkflow();
  const parseNodeCode = String(
    (workflow.nodes.find((n) => n.name === "Parse Agent Output")?.parameters as { jsCode?: string }).jsCode ?? ""
  );

  it("embedded parseAgentOutput js matches parseAgentOutput() for valid JSON", () => {
    const raw = JSON.stringify(SAMPLE_AGENT_OUTPUT);
    const tsResult = parseAgentOutput(raw);

    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(parseAgentOutputJs(), {
        input: { output: [{ type: "message", content: [{ type: "output_text", text: raw }] }] },
        nodeOutputs: {
          "Store Input Context": {
            agent_id: DEFAULT_AGENT_ID,
            task_id: "task-1",
            _started_at_ms: Date.now() - 100,
          },
        },
        executionId: "exec-99",
      })
    );

    expect(isAgentError(tsResult)).toBe(false);
    expect(jsResult).toMatchObject({
      deliverable_markdown: SAMPLE_AGENT_OUTPUT.deliverable_markdown,
      resumo: SAMPLE_AGENT_OUTPUT.resumo,
      autochecagem: SAMPLE_AGENT_OUTPUT.autochecagem,
    });
    expect(parseNodeCode).toBe(parseAgentOutputJs());
  });

  it("embedded parseAgentOutput js matches parseAgentOutput() for error envelopes", () => {
    const raw = "not-json";
    const tsResult = parseAgentOutput(raw);

    const jsResult = firstCodeNodeJson(
      runN8nCodeNode(parseAgentOutputJs(), {
        input: { text: raw },
        nodeOutputs: {
          "Store Input Context": { agent_id: "a", task_id: "t", _started_at_ms: Date.now() },
        },
      })
    );

    expect(isAgentError(tsResult)).toBe(true);
    expect(jsResult?.error).toBe((tsResult as { error: string }).error);
    expect(jsResult?.raw_response).toBe(raw);
  });

  it("stripFences helper in embedded JS matches stripJsonFences()", () => {
    const fenced = `\`\`\`json\n${JSON.stringify(SAMPLE_AGENT_OUTPUT)}\n\`\`\``;
    expect(runHelperJs(STRIP_JSON_FENCES_JS, { input: fenced })).toBe(stripJsonFences(fenced));
    expect(runHelperJs(STRIP_JSON_FENCES_JS, { input: "plain" })).toBe(stripJsonFences("plain"));
  });

  it("extractOpenAIText helper in embedded JS matches extractOpenAIText()", () => {
    const response = {
      output: [{ content: [{ type: "output_text", text: "hello" }] }],
    };
    expect(runHelperJs(EXTRACT_OPENAI_TEXT_JS, { input: response })).toBe(extractOpenAIText(response));
  });
});
