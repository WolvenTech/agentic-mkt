import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowedSettings,
  applyCredentialsByType,
  collectCredentialsByType,
  deployWorkflows,
  mergeLiveBindings,
  publishNewWorkflows,
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
      resolve(REPO_ROOT, "marketing-pipelines/call-agent-subworkflow.json"),
      "utf-8"
    );
    const marketingLocal = readFileSync(
      resolve(REPO_ROOT, "marketing-pipelines/marketing-pipeline-main.json"),
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

describe("collectCredentialsByType", () => {
  it("collects one credential per type from multiple nodes", () => {
    const nodes: N8nDeployNode[] = [
      {
        name: "ClickUp 1",
        credentials: { clickUpApi: { id: "cred-1", name: "ClickUp Marketing Pipeline" } },
      },
      {
        name: "ClickUp 2",
        credentials: { clickUpApi: { id: "cred-2", name: "ClickUp Other" } },
      },
      {
        name: "GitHub",
        credentials: { githubApi: { id: "cred-3", name: "GitHub PAT" } },
      },
    ];

    const creds = collectCredentialsByType(nodes);
    expect(creds.clickUpApi?.id).toBe("cred-1");
    expect(creds.githubApi?.id).toBe("cred-3");
  });

  it("returns empty object when no credentials found", () => {
    const nodes: N8nDeployNode[] = [{ name: "Node 1" }, { name: "Node 2", parameters: {} }];
    const creds = collectCredentialsByType(nodes);
    expect(creds).toEqual({});
  });
});

describe("applyCredentialsByType", () => {
  it("applies live credentials to nodes by type", () => {
    const localNodes: N8nDeployNode[] = [
      {
        name: "ClickUp 1",
        credentials: { clickUpApi: { id: "PLACEHOLDER", name: "placeholder" } },
      },
      {
        name: "OpenAI",
        credentials: { openAiApi: { id: "OPENAI_PLACEHOLDER", name: "placeholder" } },
      },
    ];
    const credMap = {
      clickUpApi: { id: "live-cred-1", name: "Live ClickUp" },
      openAiApi: { id: "live-openai", name: "Live OpenAI" },
    };

    const { nodes, unresolvedCredentials } = applyCredentialsByType(localNodes, credMap);
    expect(nodes[0]?.credentials?.clickUpApi?.id).toBe("live-cred-1");
    expect(nodes[1]?.credentials?.openAiApi?.id).toBe("live-openai");
    expect(unresolvedCredentials).toHaveLength(0);
  });

  it("records unresolved credentials when not in map", () => {
    const localNodes: N8nDeployNode[] = [
      {
        name: "Node",
        credentials: { githubApi: { id: "GITHUB_PLACEHOLDER" }, someOtherCred: { id: "OTHER" } },
      },
    ];
    const credMap: Record<string, { id?: string; name?: string }> = {};

    const { unresolvedCredentials } = applyCredentialsByType(localNodes, credMap);
    expect(unresolvedCredentials).toContain("githubApi");
    expect(unresolvedCredentials).toContain("someOtherCred");
  });
});

describe("publishNewWorkflows", () => {
  it("creates new workflows, renames and deactivates old ones, activates new Marketing Pipeline", async () => {
    const callAgentLocal = readFileSync(resolve(REPO_ROOT, "marketing-pipelines/call-agent-subworkflow.json"), "utf-8");
    const marketingLocal = readFileSync(resolve(REPO_ROOT, "marketing-pipelines/marketing-pipeline-main.json"), "utf-8");

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/v1/workflows?limit=100") && init?.method !== "POST") {
        return jsonResponse({
          data: [
            { id: "old-call-agent", name: "Call Agent" },
            { id: "old-marketing", name: "Marketing Pipeline" },
          ],
        });
      }
      if (url.endsWith("/api/v1/workflows/old-call-agent") && init?.method !== "POST" && init?.method !== "PUT") {
        return jsonResponse({
          id: "old-call-agent",
          name: "Call Agent",
          active: true,
          nodes: [{ name: "GitHub", credentials: { githubApi: { id: "live-github", name: "Live GitHub" } } }],
          connections: {},
        });
      }
      if (url.endsWith("/api/v1/workflows/old-marketing") && init?.method !== "POST" && init?.method !== "PUT") {
        return jsonResponse({
          id: "old-marketing",
          name: "Marketing Pipeline",
          active: true,
          nodes: [
            { name: "ClickUp 1", credentials: { clickUpApi: { id: "live-clickup", name: "Live ClickUp" } } },
            { name: "ClickUp 2", credentials: { clickUpApi: { id: "live-clickup", name: "Live ClickUp" } } },
          ],
          connections: {},
        });
      }
      if (url.endsWith("/api/v1/workflows") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        const isCallAgent = body.name === "Call Agent";
        const id = isCallAgent ? "new-call-agent" : "new-marketing";
        return jsonResponse({ id });
      }
      if (url.includes("/api/v1/workflows/") && init?.method === "PUT") {
        return jsonResponse({ ok: true });
      }
      if (url.includes("/api/v1/workflows/") && init?.method === "POST") {
        if (url.includes("/activate") || url.includes("/deactivate")) {
          return jsonResponse({ ok: true });
        }
      }
      if ((url.includes("/api/v1/workflows/new-call-agent") || url.includes("/api/v1/workflows/new-marketing")) && init?.method !== "POST" && init?.method !== "PUT") {
        const isCallAgent = url.includes("/new-call-agent");
        return jsonResponse({
          id: isCallAgent ? "new-call-agent" : "new-marketing",
          name: isCallAgent ? "Call Agent" : "Marketing Pipeline",
          active: !isCallAgent,
          nodes: [],
          connections: {},
        });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const report = await publishNewWorkflows({
      apiUrl: "https://n8n.example.test",
      apiKey: "test-key",
      repoRoot: REPO_ROOT,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(report.newCallAgent.id).toBe("new-call-agent");
    expect(report.newMarketingPipeline.id).toBe("new-marketing");
    expect(report.newMarketingPipeline.active).toBe(true);
    expect(report.oldCallAgent.name).toBe("Call Agent (old)");
    expect(report.oldMarketingPipeline.name).toBe("Marketing Pipeline (old)");
    expect(report.oldCallAgent.active).toBe(false);
    expect(report.oldMarketingPipeline.active).toBe(false);

    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(putCalls.length).toBeGreaterThanOrEqual(2);

    const deactivateCalls = fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/deactivate") && init?.method === "POST");
    expect(deactivateCalls).toHaveLength(2);

    const activateCalls = fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/activate") && init?.method === "POST");
    expect(activateCalls).toHaveLength(2);
  });

  it("throws when existing workflows not found", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/v1/workflows?limit=100")) {
        return jsonResponse({ data: [{ id: "wf-other", name: "Some Other Workflow" }] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      publishNewWorkflows({
        apiUrl: "https://n8n.example.test",
        apiKey: "test-key",
        repoRoot: REPO_ROOT,
        fetchImpl: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toThrow("Existing workflows not found");
  });
});
