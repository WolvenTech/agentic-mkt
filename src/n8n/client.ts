import { unwrapWebhookPayload, type ClickUpWebhookPayload } from "../marketing-pipeline/logic.js";

export const N8N_API_URL_DEFAULT = "https://n8n.wolven.com.br";

const DEFAULT_TIMEOUT_MS = 30_000;
const FILTERED_PATH_NODES = ["Log Ingress Skipped", "Ignore Non-Matching Webhook"] as const;
const FULL_PATH_MARKERS = ["Extract Webhook Context", "GET ClickUp Task", "Execute Call Agent"] as const;

export type ExecutionPathType = "full" | "filtered" | "error";

export interface N8nClientOptions {
  apiUrl?: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active?: boolean;
}

export interface N8nWorkflow extends N8nWorkflowSummary {
  nodes?: unknown[];
  connections?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: unknown;
  [key: string]: unknown;
}

export interface N8nExecution {
  id: string;
  finished?: boolean;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string;
  workflowId?: string;
  status?: string;
  data?: N8nExecutionData;
  [key: string]: unknown;
}

export interface N8nExecutionData {
  resultData?: {
    runData?: Record<string, N8nRunNodeEntry[]>;
    lastNodeExecuted?: string;
    error?: {
      node?: { name?: string };
      message?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface N8nRunNodeEntry {
  startTime?: number;
  executionTime?: number;
  data?: {
    main?: Array<Array<{ json?: Record<string, unknown> }>>;
    [key: string]: unknown;
  };
  error?: { message?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface ExecutionSummary {
  execution_id: string;
  task_id: string;
  transition: string;
  path: ExecutionPathType;
  duration_ms: number;
  failed_node?: string;
}

export interface N8nClient {
  listWorkflows(limit?: number): Promise<N8nWorkflowSummary[]>;
  getWorkflow(id: string): Promise<N8nWorkflow>;
  updateWorkflow(id: string, body: Record<string, unknown>): Promise<void>;
  getExecution(id: string, includeData?: boolean): Promise<N8nExecution>;
  listExecutions(options?: { workflowId?: string; limit?: number }): Promise<N8nExecution[]>;
}

/** HTTP error response from the n8n API — carries status and a truncated body for diagnostics. */
export class N8nHttpError extends Error {
  readonly status: number;
  readonly bodySnippet: string;

  constructor(status: number, bodySnippet: string) {
    super(`n8n API error: HTTP ${status}${bodySnippet ? ` - ${bodySnippet}` : ""}`);
    this.name = "N8nHttpError";
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

/** Transport-level failure (timeout or network error) — the request never produced an HTTP response. */
export class N8nRequestError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "N8nRequestError";
  }
}

function resolveApiUrl(apiUrl?: string): string {
  return (apiUrl ?? N8N_API_URL_DEFAULT).replace(/\/+$/, "");
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "X-N8N-API-KEY": apiKey,
    Accept: "application/json",
  };
}

async function request<T>(
  method: "GET" | "PUT",
  path: string,
  options: N8nClientOptions,
  body?: Record<string, unknown>
): Promise<T> {
  const apiUrl = resolveApiUrl(options.apiUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(`${apiUrl}${path}`, {
      method,
      headers: {
        ...authHeaders(options.apiKey),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new N8nRequestError(`n8n request timed out after ${timeoutMs}ms: ${method} ${path}`, err);
    }
    throw new N8nRequestError(`n8n request failed: ${method} ${path}`, err);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new N8nHttpError(res.status, text.slice(0, 200));
  }

  if (method === "PUT") {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/** Build an n8n client from explicit options. */
export function createN8nClient(options: N8nClientOptions): N8nClient {
  return {
    async listWorkflows(limit = 100): Promise<N8nWorkflowSummary[]> {
      const data = await request<{ data?: N8nWorkflowSummary[] }>(
        "GET",
        `/api/v1/workflows?limit=${limit}`,
        options
      );
      return data.data ?? [];
    },

    async getWorkflow(id: string): Promise<N8nWorkflow> {
      return request<N8nWorkflow>("GET", `/api/v1/workflows/${id}`, options);
    },

    async updateWorkflow(id: string, body: Record<string, unknown>): Promise<void> {
      await request<void>("PUT", `/api/v1/workflows/${id}`, options, body);
    },

    async getExecution(id: string, includeData = false): Promise<N8nExecution> {
      const query = includeData ? "?includeData=true" : "";
      return request<N8nExecution>("GET", `/api/v1/executions/${id}${query}`, options);
    },

    async listExecutions(params: { workflowId?: string; limit?: number } = {}): Promise<N8nExecution[]> {
      const search = new URLSearchParams();
      if (params.workflowId) {
        search.set("workflowId", params.workflowId);
      }
      search.set("limit", String(params.limit ?? 50));
      const query = search.toString();
      const data = await request<{ data?: N8nExecution[] }>("GET", `/api/v1/executions?${query}`, options);
      return data.data ?? [];
    },
  };
}

/** Build an n8n client from process env (`N8N_API_URL`, `N8N_API_KEY`). */
export function n8nClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<N8nClientOptions> = {}
): N8nClient {
  const apiKey = (env.N8N_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("N8N_API_KEY is required");
  }
  return createN8nClient({
    apiUrl: (env.N8N_API_URL ?? N8N_API_URL_DEFAULT).trim(),
    apiKey,
    ...overrides,
  });
}

function executionDurationMs(execution: N8nExecution): number {
  const started = execution.startedAt ? Date.parse(execution.startedAt) : Number.NaN;
  const stopped = execution.stoppedAt ? Date.parse(execution.stoppedAt) : Number.NaN;
  if (Number.isFinite(started) && Number.isFinite(stopped) && stopped >= started) {
    return stopped - started;
  }

  const runData = execution.data?.resultData?.runData ?? {};
  let total = 0;
  for (const entries of Object.values(runData)) {
    for (const entry of entries) {
      if (typeof entry.executionTime === "number") {
        total += entry.executionTime;
      }
    }
  }
  return total;
}

function webhookPayloadFromExecution(execution: N8nExecution): ClickUpWebhookPayload | undefined {
  const runData = execution.data?.resultData?.runData;
  if (!runData) {
    return undefined;
  }

  const webhookRuns = runData["ClickUp Webhook"];
  if (!webhookRuns?.length) {
    return undefined;
  }

  const firstItem = webhookRuns[0]?.data?.main?.[0]?.[0]?.json;
  if (!firstItem || typeof firstItem !== "object") {
    return undefined;
  }

  return unwrapWebhookPayload(firstItem as ClickUpWebhookPayload & { body?: ClickUpWebhookPayload });
}

function statusLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return String(record.status ?? record.name ?? record.label ?? "").trim().toLowerCase();
  }
  return String(value).trim().toLowerCase();
}

function formatTransition(payload: ClickUpWebhookPayload | undefined): string {
  const item = payload?.history_items?.[0];
  if (!item || item.field !== "status") {
    return "";
  }
  const before = statusLabel(item.before);
  const after = statusLabel(item.after);
  if (!before && !after) {
    return "";
  }
  if (!before) {
    return `→ ${after}`;
  }
  if (!after) {
    return `${before} →`;
  }
  return `${before} → ${after}`;
}

function runDataNodeNames(execution: N8nExecution): Set<string> {
  return new Set(Object.keys(execution.data?.resultData?.runData ?? {}));
}

function failedNodeName(execution: N8nExecution): string | undefined {
  const errorNode = execution.data?.resultData?.error?.node?.name;
  if (errorNode) {
    return String(errorNode);
  }

  const runData = execution.data?.resultData?.runData ?? {};
  for (const [nodeName, entries] of Object.entries(runData)) {
    if (entries.some((entry) => entry.error)) {
      return nodeName;
    }
  }
  return undefined;
}

function classifyExecutionPath(execution: N8nExecution, nodeNames: Set<string>): ExecutionPathType {
  const status = String(execution.status ?? "").toLowerCase();
  if (status === "error" || status === "crashed" || failedNodeName(execution)) {
    return "error";
  }

  const ranFiltered = FILTERED_PATH_NODES.some((name) => nodeNames.has(name));
  const ranFullMarker = FULL_PATH_MARKERS.some((name) => nodeNames.has(name));
  if (ranFiltered && !ranFullMarker) {
    return "filtered";
  }

  if (ranFullMarker) {
    return status === "success" || status === "running" || status === "waiting" ? "full" : "error";
  }

  return status === "success" ? "filtered" : "error";
}

/** Summarize a Marketing Pipeline execution for operator inspection. */
export function summarizeExecution(execution: N8nExecution): ExecutionSummary {
  const payload = webhookPayloadFromExecution(execution);
  const taskId = String(payload?.task_id ?? "");
  const transition = formatTransition(payload);
  const path = classifyExecutionPath(execution, runDataNodeNames(execution));
  const duration_ms = executionDurationMs(execution);
  const failed_node = path === "error" ? failedNodeName(execution) : undefined;

  return {
    execution_id: String(execution.id),
    task_id: taskId,
    transition,
    path,
    duration_ms,
    ...(failed_node ? { failed_node } : {}),
  };
}
