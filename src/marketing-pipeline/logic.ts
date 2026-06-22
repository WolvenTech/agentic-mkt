import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CallAgentInput } from "../types/call-agent-io.js";
import type { FieldMapping } from "../types/field-mapping.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIELD_MAPPING_PATH = resolve(REPO_ROOT, "clickup", "field-mapping.json");

export const DEFAULT_AGENT_ID = "linkedin-writer";
export const DEFAULT_MODEL = "gpt-4.1-mini";

export const COMMENT_SECTIONS = ["## LinkedIn Draft", "## Resumo", "## Autochecagem"] as const;

/** Expected main-workflow node order (happy path) for topology validation (task_09). */
export const HAPPY_PATH_NODE_SEQUENCE = [
  "ClickUp Webhook",
  "Ready to Work?",
  "Extract Webhook Context",
  "Dedup?",
  "Mark History Item Seen",
  "GET ClickUp Task",
  "Extract Task Fields",
  "Status → In Progress",
  "Prepare Call Agent Input",
  "Execute Call Agent",
  "Agent Output OK?",
  "Format Draft Comment",
  "POST Task Comment",
  "Status → Review",
] as const;

export interface WebhookHistoryItem {
  id?: unknown;
  field?: unknown;
  parent_id?: unknown;
  after?: unknown;
  [key: string]: unknown;
}

export interface ClickUpWebhookPayload {
  task_id?: unknown;
  webhook_id?: unknown;
  history_items?: WebhookHistoryItem[];
  received_at_ms?: unknown;
  [key: string]: unknown;
}

export interface WebhookContext {
  task_id: string;
  webhook_id: string;
  history_item_id: string;
  list_id: string;
  received_at_ms: unknown;
}

export interface IngressSkipRecord {
  event: "ingress_skipped";
  task_id: string;
  webhook_id: string;
  history_item_id: string;
  transition: string;
  reason: string;
}

export interface ClickUpCustomField {
  id?: unknown;
  value?: unknown;
  [key: string]: unknown;
}

export interface ClickUpTask {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  text_content?: unknown;
  custom_fields?: ClickUpCustomField[];
  [key: string]: unknown;
}

export interface TaskFields {
  task_id: string;
  task_title: string;
  task_description: string;
  criterios_de_aceite: string;
  agent_id: string;
}

export interface AgentOutputLike {
  deliverable_markdown: string;
  resumo: string;
  autochecagem: string;
  error?: unknown;
  [key: string]: unknown;
}

export interface N8nWorkflowExport {
  nodes: Array<{ name: string; [key: string]: unknown }>;
  connections: Record<string, { main?: Array<Array<{ node?: string; [key: string]: unknown }>> }>;
  [key: string]: unknown;
}

/** Read and parse `clickup/field-mapping.json` (or an override path). */
export function loadFieldMapping(path: string = FIELD_MAPPING_PATH): FieldMapping {
  return JSON.parse(readFileSync(path, "utf-8")) as FieldMapping;
}

/** n8n webhook nodes wrap JSON POST bodies under `body`; fixtures use the flat ClickUp shape. */
export function unwrapWebhookPayload(
  payload: ClickUpWebhookPayload & { body?: ClickUpWebhookPayload | Record<string, unknown> }
): ClickUpWebhookPayload {
  const inner = payload.body;
  if (inner !== null && typeof inner === "object" && !Array.isArray(inner) && "history_items" in inner) {
    return inner as ClickUpWebhookPayload;
  }
  return payload;
}

/** n8n expression root for ClickUp webhook payloads (flat fixture or live `body` wrapper). */
export function webhookPayloadRootExpression(): string {
  return "($json.body && $json.body.history_items ? $json.body : $json)";
}

function normalizeStatusValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function historyItemStatus(value: unknown): string {
  if (value !== null && typeof value === "object") {
    return normalizeStatusValue((value as Record<string, unknown>).status);
  }
  return normalizeStatusValue(value);
}

/** Format `before->after` status transition from a webhook history item. */
export function formatIngressTransition(item: WebhookHistoryItem | undefined): string {
  if (!item) {
    return "";
  }
  const before = historyItemStatus(item.before);
  const after = historyItemStatus(item.after);
  if (!before && !after) {
    return "";
  }
  return `${before}->${after}`;
}

/** Derive ingress skip reason for payloads that fail `ingressMatchesReadyToWork`. */
export function deriveIngressSkipReason(
  payload: ClickUpWebhookPayload,
  fieldMapping: FieldMapping = loadFieldMapping()
): string {
  const event = unwrapWebhookPayload(payload);
  const items = event.history_items ?? [];
  const item = items[0];
  if (!item) {
    return "no_history_items";
  }
  if (item.field !== "status") {
    return "field_not_status";
  }
  const after = item.after;
  const status = after !== null && typeof after === "object" ? (after as Record<string, unknown>).status : after;
  if (normalizeStatusValue(status) !== normalizeStatusValue(statusName(fieldMapping, "ready"))) {
    return "not_entering_ready";
  }
  return "not_entering_ready";
}

/** Build structured ingress skip record for filtered webhook executions. */
export function describeIngressSkipReason(
  payload: ClickUpWebhookPayload,
  options: { reason?: string; fieldMapping?: FieldMapping } = {}
): IngressSkipRecord {
  const fieldMapping = options.fieldMapping ?? loadFieldMapping();
  const event = unwrapWebhookPayload(payload);
  const items = event.history_items ?? [];
  const first = items[0];
  return {
    event: "ingress_skipped",
    task_id: String(event.task_id ?? ""),
    webhook_id: String(event.webhook_id ?? ""),
    history_item_id: String(first?.id ?? ""),
    transition: formatIngressTransition(first),
    reason: options.reason ?? deriveIngressSkipReason(payload, fieldMapping),
  };
}

/** Return true when webhook payload enters the automation ingress status (ClickUp taskStatusUpdated shape). */
export function ingressMatchesReadyToWork(
  payload: ClickUpWebhookPayload,
  fieldMapping: FieldMapping = loadFieldMapping()
): boolean {
  const event = unwrapWebhookPayload(payload);
  const items = event.history_items ?? [];
  const item = items[0];
  if (!item || item.field !== "status") {
    return false;
  }
  const after = item.after;
  const status = after !== null && typeof after === "object" ? (after as Record<string, unknown>).status : after;
  return normalizeStatusValue(status) === normalizeStatusValue(statusName(fieldMapping, "ready"));
}

/** n8n IF node expression per clickup/webhook-contract.md. */
export function webhookIfExpression(fieldMapping: FieldMapping = loadFieldMapping()): string {
  const readyStatus = normalizeStatusValue(statusName(fieldMapping, "ready"));
  const root = webhookPayloadRootExpression();
  return (
    `={{ (() => { ` +
    `const payload = ${root}; ` +
    `const item = payload?.history_items?.[0]; ` +
    `if (!item || item.field !== "status") return false; ` +
    `const after = item.after; ` +
    `const status = (after !== null && typeof after === "object") ? after.status : after; ` +
    `return String(status ?? "").trim().toLowerCase() === ${JSON.stringify(readyStatus)}; ` +
    `})() }}`
  );
}

/** Normalize webhook payload into task context for downstream nodes. */
export function extractWebhookContext(
  payload: ClickUpWebhookPayload & { body?: ClickUpWebhookPayload | Record<string, unknown> }
): WebhookContext {
  const event = unwrapWebhookPayload(payload);
  const items = event.history_items ?? [];
  const first = items[0] ?? {};
  return {
    task_id: String(event.task_id ?? ""),
    webhook_id: String(event.webhook_id ?? ""),
    history_item_id: String(first.id ?? ""),
    list_id: String(first.parent_id ?? ""),
    received_at_ms: payload.received_at_ms,
  };
}

/** Read a ClickUp custom field value by field id from GET /task response. */
export function extractCustomFieldValue(task: ClickUpTask, fieldId: string): string {
  if (!fieldId || fieldId === "<TBD>") {
    return "";
  }
  for (const field of task.custom_fields ?? []) {
    if (String(field.id) !== String(fieldId)) {
      continue;
    }
    const value = field.value;
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      for (const key of ["value", "name", "label"]) {
        const candidate = record[key];
        if (candidate !== null && candidate !== undefined && candidate !== "") {
          return String(candidate);
        }
      }
      return "";
    }
    return String(value);
  }
  return "";
}

/** Map ClickUp task response to CallAgentInput fields plus task_id. */
export function extractTaskFields(task: ClickUpTask, fieldMapping: FieldMapping): TaskFields {
  const custom = fieldMapping.custom_fields ?? {};
  const criteriosId = String(custom.criterios_de_aceite?.clickup_field_id ?? "");
  const agentIdField = custom.agent_id;
  const agentIdValue = extractCustomFieldValue(task, String(agentIdField?.clickup_field_id ?? ""));
  const defaultAgent = String(agentIdField?.default ?? DEFAULT_AGENT_ID);
  return {
    task_id: String(task.id ?? ""),
    task_title: String(task.name ?? ""),
    task_description: String(task.description ?? task.text_content ?? ""),
    criterios_de_aceite: extractCustomFieldValue(task, criteriosId),
    agent_id: agentIdValue.trim() || defaultAgent,
  };
}

/** Build CallAgentInput envelope for the Call Agent sub-workflow. */
export function buildCallAgentInput(taskFields: TaskFields): CallAgentInput {
  return {
    agent_id: taskFields.agent_id,
    task_title: taskFields.task_title,
    task_description: taskFields.task_description,
    criterios_de_aceite: taskFields.criterios_de_aceite,
  };
}

export function agentOutputHasError(agentOutput: Record<string, unknown>): boolean {
  return Boolean(agentOutput.error);
}

/** Format ClickUp task comment per agents/harness/io-contract.md. */
export function formatClickupComment(
  agentOutput: { deliverable_markdown: string; resumo: string; autochecagem: string },
  options: { agentId?: string; model?: string } = {}
): string {
  const { agentId = DEFAULT_AGENT_ID, model = DEFAULT_MODEL } = options;
  return (
    "## LinkedIn Draft\n\n" +
    `${agentOutput.deliverable_markdown}\n\n` +
    "---\n\n" +
    "## Resumo\n\n" +
    `${agentOutput.resumo}\n\n` +
    "---\n\n" +
    "## Autochecagem\n\n" +
    `${agentOutput.autochecagem}\n\n` +
    "---\n" +
    `_Generated by ${agentId} (${model})_`
  );
}

export function commentIncludesRequiredSections(comment: string): boolean {
  return COMMENT_SECTIONS.every((section) => comment.includes(section));
}

export function commentFooter(agentId: string, model: string): string {
  return `_Generated by ${agentId} (${model})_`;
}

export function statusName(fieldMapping: FieldMapping, key: string): string {
  return String(fieldMapping.statuses?.[key] ?? "");
}

export function fieldId(fieldMapping: FieldMapping, key: string): string {
  return String(fieldMapping.custom_fields?.[key]?.clickup_field_id ?? "");
}

/** Return first node path from start to end following main connections, or null. */
export function workflowConnectionPath(
  workflow: N8nWorkflowExport,
  start: string,
  end: string
): string[] | null {
  const connections = workflow.connections ?? {};
  const nodesByName = new Set(workflow.nodes.map((node) => node.name));

  function walk(current: string, visited: Set<string>): string[] | null {
    if (current === end) {
      return [current];
    }
    if (visited.has(current)) {
      return null;
    }
    const nextVisited = new Set(visited);
    nextVisited.add(current);
    const outputs = connections[current]?.main ?? [];
    for (const branch of outputs) {
      for (const link of branch) {
        const target = link.node;
        if (typeof target !== "string" || !nodesByName.has(target)) {
          continue;
        }
        const subpath = walk(target, nextVisited);
        if (subpath !== null) {
          return [current, ...subpath];
        }
      }
    }
    return null;
  }

  if (!nodesByName.has(start) || !nodesByName.has(end)) {
    return null;
  }
  return walk(start, new Set());
}
