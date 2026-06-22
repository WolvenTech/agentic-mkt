import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "../load-env.js";
import { N8N_API_URL_DEFAULT } from "./client.js";

export const MARKETING_PIPELINE_FILENAME = "marketing-pipeline-main.json";
export const CALL_AGENT_FILENAME = "call-agent-subworkflow.json";

export interface N8nDeployNode {
  name: string;
  type?: string;
  credentials?: Record<string, { id?: string; name?: string }>;
  parameters?: Record<string, unknown>;
  webhookId?: string;
  [key: string]: unknown;
}

export interface N8nDeployWorkflow {
  id?: string;
  name: string;
  active?: boolean;
  nodes: N8nDeployNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: unknown;
}

export interface DeployWorkflowResult {
  id: string;
  active: boolean;
  ingressFilter?: string;
  writingStatus?: string;
  reviewStatus?: string;
}

export interface DeployWorkflowsOptions {
  apiUrl?: string;
  apiKey: string;
  repoRoot?: string;
  fetchImpl?: typeof fetch;
}

export interface DeployWorkflowsReport {
  apiUrl: string;
  callAgent: DeployWorkflowResult;
  marketingPipeline: DeployWorkflowResult;
}

const LLM_NODE_TYPES = new Set([
  "@n8n/n8n-nodes-langchain.openAi",
  "@n8n/n8n-nodes-langchain.googleGemini",
  "@n8n/n8n-nodes-langchain.anthropic",
]);

export function mergeLiveBindings(liveNodes: N8nDeployNode[], localNodes: N8nDeployNode[]): N8nDeployNode[] {
  const liveByName = new Map(liveNodes.map((node) => [node.name, node]));
  const liveLlmByType = new Map<string, N8nDeployNode>();
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
    const merged: N8nDeployNode = { ...local };
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

export function allowedSettings(settings: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
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

function workflowPaths(repoRoot: string): { marketing: string; callAgent: string } {
  const workflowsDir = resolve(repoRoot, "n8n", "workflows");
  return {
    marketing: resolve(workflowsDir, MARKETING_PIPELINE_FILENAME),
    callAgent: resolve(workflowsDir, CALL_AGENT_FILENAME),
  };
}

async function fetchWorkflow(
  fetchImpl: typeof fetch,
  apiUrl: string,
  apiKey: string,
  id: string
): Promise<N8nDeployWorkflow> {
  const res = await fetchImpl(`${apiUrl}/api/v1/workflows/${id}`, {
    headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`GET workflow ${id} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as N8nDeployWorkflow;
}

async function listWorkflows(
  fetchImpl: typeof fetch,
  apiUrl: string,
  apiKey: string
): Promise<Array<{ id: string; name: string }>> {
  const res = await fetchImpl(`${apiUrl}/api/v1/workflows?limit=100`, {
    headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`List workflows failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { data?: Array<{ id: string; name: string }> };
  return data.data ?? [];
}

async function updateWorkflow(
  fetchImpl: typeof fetch,
  apiUrl: string,
  apiKey: string,
  id: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetchImpl(`${apiUrl}/api/v1/workflows/${id}`, {
    method: "PUT",
    headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PUT workflow ${id} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
}

function readLocalWorkflow(path: string): N8nDeployWorkflow {
  return JSON.parse(readFileSync(path, "utf-8")) as N8nDeployWorkflow;
}

function marketingStatusSummary(workflow: N8nDeployWorkflow): Pick<
  DeployWorkflowResult,
  "ingressFilter" | "writingStatus" | "reviewStatus"
> {
  const ingress = workflow.nodes.find((n) => n.name === "Ready to Work?");
  const writing = workflow.nodes.find((n) => n.name === "Status → In Progress");
  const review = workflow.nodes.find((n) => n.name === "Status → Review");
  const ingressConditions =
    (ingress?.parameters as { conditions?: { conditions?: Array<{ leftValue?: string; rightValue?: string }> } })
      ?.conditions?.conditions ?? [];
  const ingressValue = ingressConditions.find((c) => String(c.leftValue ?? "").includes("after.status"))?.rightValue;
  const writingValue = (writing?.parameters as { updateFields?: { status?: string } })?.updateFields?.status;
  const reviewValue = (review?.parameters as { updateFields?: { status?: string } })?.updateFields?.status;
  return {
    ingressFilter: ingressValue,
    writingStatus: writingValue,
    reviewStatus: reviewValue,
  };
}

async function deployWorkflowByName(
  fetchImpl: typeof fetch,
  apiUrl: string,
  apiKey: string,
  workflows: Array<{ id: string; name: string }>,
  workflowName: string,
  localPath: string
): Promise<DeployWorkflowResult> {
  const match = workflows.find((wf) => wf.name.toLowerCase() === workflowName.toLowerCase());
  if (!match) {
    throw new Error(`Workflow "${workflowName}" not found on n8n — import ${localPath} first`);
  }

  const live = await fetchWorkflow(fetchImpl, apiUrl, apiKey, match.id);
  const local = readLocalWorkflow(localPath);
  const nodes = mergeLiveBindings(live.nodes, local.nodes);
  await updateWorkflow(fetchImpl, apiUrl, apiKey, match.id, {
    name: local.name,
    nodes,
    connections: local.connections,
    settings: allowedSettings(live.settings as Record<string, unknown> | undefined),
    staticData: live.staticData ?? null,
  });
  return { id: match.id, active: live.active ?? false };
}

/** Push committed workflow JSON to n8n, preserving live credential and webhook bindings. */
export async function deployWorkflows(options: DeployWorkflowsOptions): Promise<DeployWorkflowsReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiUrl = (options.apiUrl ?? N8N_API_URL_DEFAULT).replace(/\/+$/, "");
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const paths = workflowPaths(repoRoot);
  const workflows = await listWorkflows(fetchImpl, apiUrl, options.apiKey);

  const callAgent = await deployWorkflowByName(
    fetchImpl,
    apiUrl,
    options.apiKey,
    workflows,
    "Call Agent",
    paths.callAgent
  );

  const marketing = await deployWorkflowByName(
    fetchImpl,
    apiUrl,
    options.apiKey,
    workflows,
    "Marketing Pipeline",
    paths.marketing
  );
  const marketingLive = await fetchWorkflow(fetchImpl, apiUrl, options.apiKey, marketing.id);

  return {
    apiUrl,
    callAgent,
    marketingPipeline: {
      ...marketing,
      ...marketingStatusSummary(marketingLive),
    },
  };
}

export function printDeployReport(report: DeployWorkflowsReport): void {
  console.log(`Updated Call Agent (${report.callAgent.id}) on ${report.apiUrl}`);
  console.log(`  active (unchanged): ${report.callAgent.active}`);
  console.log(`Updated Marketing Pipeline (${report.marketingPipeline.id}) on ${report.apiUrl}`);
  console.log(`  ingress filter: ${report.marketingPipeline.ingressFilter}`);
  console.log(`  writing status: ${report.marketingPipeline.writingStatus}`);
  console.log(`  review status: ${report.marketingPipeline.reviewStatus}`);
  console.log(`  active (unchanged): ${report.marketingPipeline.active}`);
}
