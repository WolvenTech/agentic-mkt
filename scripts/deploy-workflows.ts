import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadRepoDotenv, REPO_ROOT } from "../src/load-env.js";

const N8N_API_URL_DEFAULT = "https://n8n.wolven.com.br";
const MARKETING_PIPELINE_PATH = resolve(REPO_ROOT, "n8n", "workflows", "marketing-pipeline-main.json");
const CALL_AGENT_PATH = resolve(REPO_ROOT, "n8n", "workflows", "call-agent-subworkflow.json");

interface N8nNode {
  name: string;
  credentials?: Record<string, { id?: string; name?: string }>;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

interface N8nWorkflow {
  id?: string;
  name: string;
  active?: boolean;
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: unknown;
}

const LLM_NODE_TYPES = new Set([
  "@n8n/n8n-nodes-langchain.openAi",
  "@n8n/n8n-nodes-langchain.googleGemini",
  "@n8n/n8n-nodes-langchain.anthropic",
]);

function mergeLiveBindings(liveNodes: N8nNode[], localNodes: N8nNode[]): N8nNode[] {
  const liveByName = new Map(liveNodes.map((node) => [node.name, node]));
  const liveLlmByType = new Map<string, N8nNode>();
  for (const node of liveNodes) {
    if (node.type && LLM_NODE_TYPES.has(node.type)) {
      liveLlmByType.set(node.type, node);
    }
  }
  return localNodes.map((local) => {
    let live = liveByName.get(local.name);
    if (!live && local.type && liveLlmByType.has(local.type)) {
      live = liveLlmByType.get(local.type);
    }
    if (!live) {
      return local;
    }
    const merged: N8nNode = { ...local };
    if (live.credentials) {
      merged.credentials = live.credentials;
    }
    if (local.name === "Execute Call Agent" && live.parameters?.workflowId) {
      merged.parameters = { ...local.parameters, workflowId: live.parameters.workflowId };
    }
    if (local.type === "n8n-nodes-base.webhook" && live.webhookId) {
      merged.webhookId = live.webhookId;
    }
    return merged;
  });
}

function allowedSettings(settings: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!settings) {
    return undefined;
  }
  const allowed = ["executionOrder", "callerPolicy", "availableInMCP", "errorWorkflow", "timezone"] as const;
  const picked: Record<string, unknown> = {};
  for (const key of allowed) {
    if (settings[key] !== undefined) {
      picked[key] = settings[key];
    }
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
}

async function fetchWorkflow(apiUrl: string, apiKey: string, id: string): Promise<N8nWorkflow> {
  const res = await fetch(`${apiUrl}/api/v1/workflows/${id}`, {
    headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`GET workflow ${id} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as N8nWorkflow;
}

async function listWorkflows(apiUrl: string, apiKey: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${apiUrl}/api/v1/workflows?limit=100`, {
    headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`List workflows failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { data?: Array<{ id: string; name: string }> };
  return data.data ?? [];
}

async function updateWorkflow(apiUrl: string, apiKey: string, id: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${apiUrl}/api/v1/workflows/${id}`, {
    method: "PUT",
    headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PUT workflow ${id} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
}

async function deployWorkflowByName(
  apiUrl: string,
  apiKey: string,
  workflows: Array<{ id: string; name: string }>,
  workflowName: string,
  localPath: string
): Promise<{ id: string; active: boolean }> {
  const match = workflows.find((wf) => wf.name.toLowerCase() === workflowName.toLowerCase());
  if (!match) {
    throw new Error(`Workflow "${workflowName}" not found on n8n — import ${localPath} first`);
  }

  const live = await fetchWorkflow(apiUrl, apiKey, match.id);
  const local = JSON.parse(readFileSync(localPath, "utf-8")) as N8nWorkflow;
  const nodes = mergeLiveBindings(live.nodes, local.nodes);
  await updateWorkflow(apiUrl, apiKey, match.id, {
    name: local.name,
    nodes,
    connections: local.connections,
    settings: allowedSettings(live.settings as Record<string, unknown> | undefined),
    staticData: live.staticData ?? null,
  });
  return { id: match.id, active: live.active ?? false };
}

async function main(): Promise<number> {
  loadRepoDotenv();
  const apiUrl = (process.env.N8N_API_URL ?? N8N_API_URL_DEFAULT).replace(/\/+$/, "");
  const apiKey = (process.env.N8N_API_KEY ?? "").trim();
  if (!apiKey) {
    console.error("Set N8N_API_KEY in .env");
    return 1;
  }

  const workflows = await listWorkflows(apiUrl, apiKey);

  const callAgent = await deployWorkflowByName(apiUrl, apiKey, workflows, "Call Agent", CALL_AGENT_PATH);
  console.log(`Updated Call Agent (${callAgent.id}) on ${apiUrl}`);
  console.log(`  active (unchanged): ${callAgent.active}`);

  const marketing = await deployWorkflowByName(apiUrl, apiKey, workflows, "Marketing Pipeline", MARKETING_PIPELINE_PATH);
  const marketingLive = await fetchWorkflow(apiUrl, apiKey, marketing.id);
  const ingress = marketingLive.nodes.find((n) => n.name === "Ready to Work?");
  const writing = marketingLive.nodes.find((n) => n.name === "Status → In Progress");
  const review = marketingLive.nodes.find((n) => n.name === "Status → Review");
  const ingressConditions =
    (ingress?.parameters as { conditions?: { conditions?: Array<{ leftValue?: string; rightValue?: string }> } })
      ?.conditions?.conditions ?? [];
  const ingressValue = ingressConditions.find((c) => String(c.leftValue ?? "").includes("after.status"))?.rightValue;
  const writingValue = (writing?.parameters as { updateFields?: { status?: string } })?.updateFields?.status;
  const reviewValue = (review?.parameters as { updateFields?: { status?: string } })?.updateFields?.status;

  console.log(`Updated Marketing Pipeline (${marketing.id}) on ${apiUrl}`);
  console.log(`  ingress filter: ${ingressValue}`);
  console.log(`  writing status: ${writingValue}`);
  console.log(`  review status: ${reviewValue}`);
  console.log(`  active (unchanged): ${marketing.active}`);
  return 0;
}

try {
  const code = await main();
  process.exitCode = code;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
