import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "../load-env.js";
import {
  CALL_AGENT_FILENAME,
  MARKETING_PIPELINE_FILENAME,
  WORKFLOWS_DIR,
} from "../workflows/write-workflows.js";
import { N8N_API_URL_DEFAULT, createN8nClient } from "./client.js";

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
  const workflowsDir = resolve(repoRoot, WORKFLOWS_DIR);
  return {
    marketing: resolve(workflowsDir, MARKETING_PIPELINE_FILENAME),
    callAgent: resolve(workflowsDir, CALL_AGENT_FILENAME),
  };
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
  client: ReturnType<typeof createN8nClient>,
  workflows: Array<{ id: string; name: string }>,
  workflowName: string,
  localPath: string
): Promise<DeployWorkflowResult> {
  const match = workflows.find((wf) => wf.name.toLowerCase() === workflowName.toLowerCase());
  if (!match) {
    throw new Error(`Workflow "${workflowName}" not found on n8n — import ${localPath} first`);
  }

  const live = (await client.getWorkflow(match.id)) as N8nDeployWorkflow;
  const local = readLocalWorkflow(localPath);
  const nodes = mergeLiveBindings(live.nodes, local.nodes);
  await client.updateWorkflow(match.id, {
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
  const apiUrl = (options.apiUrl ?? N8N_API_URL_DEFAULT).replace(/\/+$/, "");
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const paths = workflowPaths(repoRoot);
  const client = createN8nClient({
    apiUrl,
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
  });
  const workflows = await client.listWorkflows(100);

  const callAgent = await deployWorkflowByName(client, workflows, "Call Agent", paths.callAgent);

  const marketing = await deployWorkflowByName(client, workflows, "Marketing Pipeline", paths.marketing);
  const marketingLive = (await client.getWorkflow(marketing.id)) as N8nDeployWorkflow;

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
