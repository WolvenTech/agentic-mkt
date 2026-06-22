import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowedSettings,
  deployWorkflows,
  mergeLiveBindings,
  type N8nDeployNode,
} from "../src/n8n/deploy-workflows.js";

const REPO_ROOT = resolve(__dirname, "..");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function localWorkflow(name: string, nodes: N8nDeployNode[]) {
  return {
    name,
    nodes,
    connections: {},
    active: false,
    settings: { executionOrder: "v1" },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mergeLiveBindings", () => {
  it("preserves live credentials and webhookId while keeping local node definitions", () => {
    const live: N8nDeployNode[] = [
      {
        name: "ClickUp Webhook",
        type: "n8n-nodes-base.webhook",
        webhookId: "live-webhook-id",
        credentials: { clickUpApi: { id: "live-cred", name: "Live ClickUp" } },
      },
      {
        name: "Message GPT-4.1-MINI",
        type: "@n8n/n8n-nodes-langchain.openAi",
        credentials: { openAiApi: { id: "live-openai", name: "Live OpenAI" } },
      },
      {
        name: "Execute Call Agent",
        type: "n8n-nodes-base.executeWorkflow",
        parameters: { workflowId: { __rl: true, mode: "id", value: "wf-99" } },
      },
    ];
    const local: N8nDeployNode[] = [
      {
        name: "ClickUp Webhook",
        type: "n8n-nodes-base.webhook",
        webhookId: "placeholder-webhook-id",
        parameters: { path: "marketing-pipeline-ready-to-work" },
      },
      {
        name: "Message GPT-4.1-MINI",
        type: "@n8n/n8n-nodes-langchain.openAi",
        parameters: { resource: "text" },
      },
      {
        name: "Execute Call Agent",
        type: "n8n-nodes-base.executeWorkflow",
        parameters: { workflowId: { __rl: true, mode: "id", value: "CALL_AGENT_WORKFLOW_ID" } },
      },
    ];

    const merged = mergeLiveBindings(live, local);
    expect(merged[0]?.webhookId).toBe("live-webhook-id");
    expect(merged[0]?.parameters).toEqual(local[0]?.parameters);
    expect(merged[1]?.credentials).toEqual(live[1]?.credentials);
    expect(merged[1]?.parameters).toEqual(local[1]?.parameters);
    expect(merged[2]?.parameters?.workflowId).toEqual(live[2]?.parameters?.workflowId);
  });
});

describe("allowedSettings", () => {
  it("keeps only n8n-allowed settings keys", () => {
    expect(
      allowedSettings({
        executionOrder: "v1",
        timezone: "America/Sao_Paulo",
        saveManualExecutions: true,
      })
    ).toEqual({
      executionOrder: "v1",
      timezone: "America/Sao_Paulo",
    });
  });
});

describe("deployWorkflows", () => {
  it("PUTs merged local workflow JSON for Call Agent and Marketing Pipeline", async () => {
    const callAgentLocal = readFileSync(
      resolve(REPO_ROOT, "n8n/workflows/call-agent-subworkflow.json"),
      "utf-8"
    );
    const marketingLocal = readFileSync(
      resolve(REPO_ROOT, "n8n/workflows/marketing-pipeline-main.json"),
      "utf-8"
    );

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/v1/workflows?limit=100") && init?.method !== "PUT") {
        return jsonResponse({
          data: [
            { id: "wf-call", name: "Call Agent" },
            { id: "wf-main", name: "Marketing Pipeline" },
          ],
        });
      }
      if (url.endsWith("/api/v1/workflows/wf-call") && init?.method !== "PUT") {
        return jsonResponse({
          id: "wf-call",
          name: "Call Agent",
          active: false,
          nodes: [{ name: "Message GPT-4.1-MINI", type: "@n8n/n8n-nodes-langchain.openAi", credentials: { openAiApi: { id: "live-openai", name: "Live OpenAI" } } }],
          connections: {},
          settings: { executionOrder: "v1", saveManualExecutions: true },
          staticData: null,
        });
      }
      if (url.endsWith("/api/v1/workflows/wf-main") && init?.method !== "PUT") {
        return jsonResponse({
          id: "wf-main",
          name: "Marketing Pipeline",
          active: true,
          nodes: [
            {
              name: "Ready to Work?",
              parameters: {
                conditions: {
                  conditions: [{ leftValue: "={{$json.after.status}}", rightValue: "ready" }],
                },
              },
            },
            {
              name: "Status → In Progress",
              parameters: { updateFields: { status: "writing" } },
            },
            { name: "Status → Review", parameters: { updateFields: { status: "approval" } } },
            {
              name: "ClickUp Webhook",
              type: "n8n-nodes-base.webhook",
              webhookId: "live-webhook",
            },
            {
              name: "Execute Call Agent",
              type: "n8n-nodes-base.executeWorkflow",
              parameters: { workflowId: { __rl: true, mode: "id", value: "wf-call" } },
            },
          ],
          connections: {},
          settings: { executionOrder: "v1" },
          staticData: { seenHistoryItems: { "hist-1": 1 } },
        });
      }
      if (init?.method === "PUT") {
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const report = await deployWorkflows({
      apiUrl: "https://n8n.example.test",
      apiKey: "test-key",
      repoRoot: REPO_ROOT,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(report.callAgent.id).toBe("wf-call");
    expect(report.marketingPipeline.ingressFilter).toBe("ready");
    expect(report.marketingPipeline.writingStatus).toBe("writing");
    expect(report.marketingPipeline.reviewStatus).toBe("approval");

    const puts = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts).toHaveLength(2);

    const marketingPut = puts.find(([url]) => String(url).endsWith("/api/v1/workflows/wf-main"));
    expect(marketingPut).toBeDefined();
    const marketingBody = JSON.parse(String(marketingPut?.[1]?.body));
    expect(marketingBody.name).toBe("Marketing Pipeline");
    expect(marketingBody.staticData).toEqual({ seenHistoryItems: { "hist-1": 1 } });
    expect(marketingBody.settings).toEqual({ executionOrder: "v1" });
    expect(JSON.stringify(marketingBody.nodes)).toContain("live-webhook");
    expect(JSON.stringify(marketingBody.nodes)).toContain(JSON.parse(marketingLocal).nodes[0].name);

    const callAgentPut = puts.find(([url]) => String(url).endsWith("/api/v1/workflows/wf-call"));
    expect(callAgentPut).toBeDefined();
    const callAgentBody = JSON.parse(String(callAgentPut?.[1]?.body));
    expect(callAgentBody.name).toBe("Call Agent");
    expect(JSON.stringify(callAgentBody.nodes)).toContain("live-openai");
    expect(JSON.stringify(callAgentBody.nodes)).toContain(JSON.parse(callAgentLocal).nodes[0].name);
  });

  it("throws when a workflow name is missing on n8n", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/v1/workflows?limit=100")) {
        return jsonResponse({ data: [{ id: "wf-main", name: "Marketing Pipeline" }] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deployWorkflows({
        apiUrl: "https://n8n.example.test",
        apiKey: "test-key",
        repoRoot: REPO_ROOT,
        fetchImpl: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toThrow('Workflow "Call Agent" not found on n8n');
  });
});
