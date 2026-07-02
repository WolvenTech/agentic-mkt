import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "../load-env.js";
import {
  CALL_AGENT_FILENAME,
  MARKETING_PIPELINE_FILENAME,
  WORKFLOWS_DIR,
} from "../workflows/write-workflows.js";
import { N8N_API_URL_DEFAULT, createN8nClient, type N8nClient } from "./client.js";

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
  workingTag?: string;
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
  "ingressFilter" | "workingTag" | "reviewStatus"
> {
  const ingress = workflow.nodes.find((n) => n.name === "ClickUp Webhook");
  const workingTag = workflow.nodes.find((n) => n.name === "Add agent-working");
  const review = workflow.nodes.find((n) => n.name === "Status → Review");
  const ingressValue = String((ingress?.parameters as { path?: string } | undefined)?.path ?? "");
  const reviewValue = (review?.parameters as { updateFields?: { status?: string } })?.updateFields?.status;
  return {
    ingressFilter: ingressValue,
    workingTag: workingTag ? "agent-working" : undefined,
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
  console.log(`  ingress path: ${report.marketingPipeline.ingressFilter}`);
  console.log(`  working tag: ${report.marketingPipeline.workingTag}`);
  console.log(`  review status: ${report.marketingPipeline.reviewStatus}`);
  console.log(`  active (unchanged): ${report.marketingPipeline.active}`);
}

export interface PublishWorkflowResult {
  id: string;
  name: string;
  active: boolean;
}

export interface PublishWorkflowsReport {
  apiUrl: string;
  newCallAgent: PublishWorkflowResult;
  newMarketingPipeline: PublishWorkflowResult;
  oldCallAgent: PublishWorkflowResult;
  oldMarketingPipeline: PublishWorkflowResult;
  unresolved_credentials?: string[];
}

export function collectCredentialsByType(nodes: N8nDeployNode[]): Record<string, { id?: string; name?: string }> {
  const credentials: Record<string, { id?: string; name?: string }> = {};
  const credentialTypes = ["clickUpApi", "githubApi", "openAiApi"] as const;
  for (const node of nodes) {
    if (!node.credentials) continue;
    for (const type of credentialTypes) {
      if (type in node.credentials && !(type in credentials)) {
        credentials[type] = node.credentials[type] as { id?: string; name?: string };
      }
    }
  }
  return credentials;
}

export function applyCredentialsByType(
  localNodes: N8nDeployNode[],
  credentialMap: Record<string, { id?: string; name?: string }>
): { nodes: N8nDeployNode[]; unresolvedCredentials: string[] } {
  const unresolved = new Set<string>();
  const updated = localNodes.map((node) => {
    if (!node.credentials) return node;
    const merged = { ...node.credentials };
    for (const [key, value] of Object.entries(merged)) {
      if (key in credentialMap && credentialMap[key]) {
        merged[key] = credentialMap[key];
      } else {
        unresolved.add(key);
      }
    }
    return { ...node, credentials: merged };
  });
  return { nodes: updated, unresolvedCredentials: Array.from(unresolved) };
}

export interface PublishWorkflowsOptions {
  apiUrl?: string;
  apiKey: string;
  repoRoot?: string;
  fetchImpl?: typeof fetch;
}

export async function publishNewWorkflows(options: PublishWorkflowsOptions): Promise<PublishWorkflowsReport> {
  const apiUrl = (options.apiUrl ?? N8N_API_URL_DEFAULT).replace(/\/+$/, "");
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const paths = {
    marketing: resolve(repoRoot, WORKFLOWS_DIR, MARKETING_PIPELINE_FILENAME),
    callAgent: resolve(repoRoot, WORKFLOWS_DIR, CALL_AGENT_FILENAME),
  };
  const client = createN8nClient({
    apiUrl,
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
  });

  // List existing workflows
  const workflows = await client.listWorkflows(100);
  const oldCallAgent = workflows.find((w) => w.name.toLowerCase() === "call agent");
  const oldMarketing = workflows.find((w) => w.name.toLowerCase() === "marketing pipeline");
  if (!oldCallAgent || !oldMarketing) {
    throw new Error(`Existing workflows not found: Call Agent or Marketing Pipeline not in n8n`);
  }

  // Fetch full live workflow bodies to harvest credentials
  const liveCallAgent = (await client.getWorkflow(oldCallAgent.id)) as N8nDeployWorkflow;
  const liveMarketing = (await client.getWorkflow(oldMarketing.id)) as N8nDeployWorkflow;

  // Harvest credentials by type
  const callAgentCreds = collectCredentialsByType(liveCallAgent.nodes);
  const marketingCreds = collectCredentialsByType(liveMarketing.nodes);
  const mergedCreds = { ...callAgentCreds, ...marketingCreds };

  // Read local workflow exports
  const localCallAgent = JSON.parse(readFileSync(paths.callAgent, "utf-8")) as N8nDeployWorkflow;
  const localMarketing = JSON.parse(readFileSync(paths.marketing, "utf-8")) as N8nDeployWorkflow;

  // Apply credentials to Call Agent and create
  const { nodes: callAgentNodes, unresolvedCredentials: callAgentUnresolved } = applyCredentialsByType(
    localCallAgent.nodes,
    mergedCreds
  );
  const newCallAgentResult = await client.createWorkflow({
    name: localCallAgent.name,
    nodes: callAgentNodes,
    connections: localCallAgent.connections,
    settings: allowedSettings(localCallAgent.settings as Record<string, unknown> | undefined),
  });
  const newCallAgentId = newCallAgentResult.id;

  // Apply credentials to Marketing Pipeline, update Call Agent workflow ID, and create
  const { nodes: marketingNodes, unresolvedCredentials: marketingUnresolved } = applyCredentialsByType(
    localMarketing.nodes,
    mergedCreds
  );
  const executeCallAgentNode = marketingNodes.find((n) => n.name === "Execute Call Agent");
  if (executeCallAgentNode && executeCallAgentNode.parameters) {
    executeCallAgentNode.parameters = {
      ...executeCallAgentNode.parameters,
      workflowId: { __rl: true, mode: "id", value: newCallAgentId },
    };
  }
  const newMarketingResult = await client.createWorkflow({
    name: localMarketing.name,
    nodes: marketingNodes,
    connections: localMarketing.connections,
    settings: allowedSettings(localMarketing.settings as Record<string, unknown> | undefined),
  });
  const newMarketingId = newMarketingResult.id;

  // Activate new Call Agent (n8n requires referenced sub-workflows to be published/active)
  await client.activateWorkflow(newCallAgentId);

  // Rename and deactivate old workflows
  await client.updateWorkflow(oldCallAgent.id, {
    name: "Call Agent (old)",
    nodes: liveCallAgent.nodes,
    connections: liveCallAgent.connections,
    settings: allowedSettings(liveCallAgent.settings as Record<string, unknown> | undefined),
    staticData: liveCallAgent.staticData ?? null,
  });
  await client.deactivateWorkflow(oldCallAgent.id);

  await client.updateWorkflow(oldMarketing.id, {
    name: "Marketing Pipeline (old)",
    nodes: liveMarketing.nodes,
    connections: liveMarketing.connections,
    settings: allowedSettings(liveMarketing.settings as Record<string, unknown> | undefined),
    staticData: liveMarketing.staticData ?? null,
  });
  await client.deactivateWorkflow(oldMarketing.id);

  // Activate new Marketing Pipeline (after old one is deactivated, webhook path is free)
  await client.activateWorkflow(newMarketingId);

  // Fetch final state to confirm
  const finalNewCallAgent = (await client.getWorkflow(newCallAgentId)) as N8nDeployWorkflow;
  const finalNewMarketing = (await client.getWorkflow(newMarketingId)) as N8nDeployWorkflow;

  const allUnresolved = new Set([...callAgentUnresolved, ...marketingUnresolved]);

  return {
    apiUrl,
    newCallAgent: {
      id: newCallAgentId,
      name: finalNewCallAgent.name ?? "Call Agent",
      active: finalNewCallAgent.active ?? false,
    },
    newMarketingPipeline: {
      id: newMarketingId,
      name: finalNewMarketing.name ?? "Marketing Pipeline",
      active: finalNewMarketing.active ?? false,
    },
    oldCallAgent: {
      id: oldCallAgent.id,
      name: "Call Agent (old)",
      active: false,
    },
    oldMarketingPipeline: {
      id: oldMarketing.id,
      name: "Marketing Pipeline (old)",
      active: false,
    },
    ...(allUnresolved.size > 0 ? { unresolved_credentials: Array.from(allUnresolved) } : {}),
  };
}

export function printPublishReport(report: PublishWorkflowsReport): void {
  console.log(`Created new Call Agent (${report.newCallAgent.id}) on ${report.apiUrl}`);
  console.log(`  name: ${report.newCallAgent.name}`);
  console.log(`  active: ${report.newCallAgent.active}`);
  console.log(`Created new Marketing Pipeline (${report.newMarketingPipeline.id}) on ${report.apiUrl}`);
  console.log(`  name: ${report.newMarketingPipeline.name}`);
  console.log(`  active: ${report.newMarketingPipeline.active}`);
  console.log(`Renamed old workflows:`);
  console.log(`  ${report.oldCallAgent.id} → ${report.oldCallAgent.name} (active: ${report.oldCallAgent.active})`);
  console.log(`  ${report.oldMarketingPipeline.id} → ${report.oldMarketingPipeline.name} (active: ${report.oldMarketingPipeline.active})`);
  if (report.unresolved_credentials?.length) {
    console.warn(`Warning: unresolved credential keys (check n8n binding manually): ${report.unresolved_credentials.join(", ")}`);
  }
}
