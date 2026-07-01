import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CallAgentInput, StageInput } from "../types/call-agent-io.js";
import type { FieldMapping } from "../types/field-mapping.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIELD_MAPPING_PATH = resolve(REPO_ROOT, "clickup", "field-mapping.json");

export const DEFAULT_AGENT_ID = "linkedin-writer";
export const DEFAULT_MODEL = "gpt-4.1-mini";

export const COMMENT_SECTIONS = ["## LinkedIn Draft", "## Resumo", "## Autochecagem"] as const;

export type IngressMode = "first_draft" | "revision" | "skip";

/** Expected main-workflow node order (happy path) for topology validation (task_09). */
export const HAPPY_PATH_NODE_SEQUENCE = [
  "ClickUp Webhook",
  "Ready to Work?",
  "Set First Draft Ingress",
  "Extract Webhook Context",
  "Dedup?",
  "Mark History Item Seen",
  "GET ClickUp Task",
  "Extract Task Fields",
  "Revision Ingress?",
  "Status → In Progress",
  "Prepare Revision Input?",
  "Prepare Call Agent Input",
  "Execute Call Agent",
  "Agent Output OK?",
  "Format Draft Comment",
  "POST Task Comment",
  "Status → Review",
] as const;

/** Revision happy-path node order for topology validation. */
export const REVISION_PATH_NODE_SEQUENCE = [
  "ClickUp Webhook",
  "Ready to Work?",
  "Needs Review?",
  "Set Revision Ingress",
  "Extract Webhook Context",
  "Dedup?",
  "Mark History Item Seen",
  "GET ClickUp Task",
  "Extract Task Fields",
  "Revision Ingress?",
  "GET Task Comments",
  "Collect Task Comments",
  "Actionable Feedback?",
  "Status → In Progress",
  "Prepare Revision Input?",
  "Prepare Revision Call Agent Input",
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

export interface ClickUpComment {
  id: string;
  comment_text: string;
  user?: { username?: string };
  date?: string;
}

export interface TaskFields {
  task_id: string;
  task_title: string;
  task_description: string;
  criterios_de_aceite: string;
  agent_id: string;
  editorial_doc_url: string;
  ingress_mode?: IngressMode;
}

export interface DocPointerValidation {
  valid: boolean;
  error?: string;
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
  fieldMapping: FieldMapping = loadFieldMapping(),
  targetStatusKey: "ready" | "needs_review" = "ready"
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
  const reason = targetStatusKey === "needs_review" ? "not_entering_needs_review" : "not_entering_ready";
  if (normalizeStatusValue(status) !== normalizeStatusValue(statusName(fieldMapping, targetStatusKey))) {
    return reason;
  }
  return reason;
}

/** Build structured ingress skip record for filtered webhook executions. */
export function describeIngressSkipReason(
  payload: ClickUpWebhookPayload,
  options: { reason?: string; fieldMapping?: FieldMapping; targetStatusKey?: "ready" | "needs_review" } = {}
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
    reason: options.reason ?? deriveIngressSkipReason(payload, fieldMapping, options.targetStatusKey ?? "ready"),
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

/** Return true when webhook payload enters the Needs Review revision ingress status. */
export function ingressMatchesNeedsReview(
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
  return normalizeStatusValue(status) === normalizeStatusValue(statusName(fieldMapping, "needs_review"));
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

/** n8n IF node expression for Needs Review revision ingress. */
export function needsReviewIfExpression(fieldMapping: FieldMapping = loadFieldMapping()): string {
  const needsReviewStatus = normalizeStatusValue(statusName(fieldMapping, "needs_review"));
  const root = webhookPayloadRootExpression();
  return (
    `={{ (() => { ` +
    `const payload = ${root}; ` +
    `const item = payload?.history_items?.[0]; ` +
    `if (!item || item.field !== "status") return false; ` +
    `const after = item.after; ` +
    `const status = (after !== null && typeof after === "object") ? after.status : after; ` +
    `return String(status ?? "").trim().toLowerCase() === ${JSON.stringify(needsReviewStatus)}; ` +
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

/** Validate ClickUp Doc pointer URL/ID for presence and format. */
export function validateDocPointer(pointer: string): DocPointerValidation {
  if (!pointer) {
    return { valid: false, error: "missing_pointer" };
  }
  const isUrl = pointer.match(/^https?:\/\//) !== null;
  const isDocId = pointer.match(/^[a-zA-Z0-9-]+$/) !== null;
  if (!isUrl && !isDocId) {
    return { valid: false, error: "malformed_pointer" };
  }
  return { valid: true };
}

/** Map ClickUp task response to CallAgentInput fields plus task_id. */
export function extractTaskFields(task: ClickUpTask, fieldMapping: FieldMapping): TaskFields {
  const custom = fieldMapping.custom_fields ?? {};
  const criteriosId = String(custom.criterios_de_aceite?.clickup_field_id ?? "");
  const agentIdField = custom.agent_id;
  const agentIdValue = extractCustomFieldValue(task, String(agentIdField?.clickup_field_id ?? ""));
  const defaultAgent = String(agentIdField?.default ?? DEFAULT_AGENT_ID);
  const docUrlId = String(custom.editorial_doc_url?.clickup_field_id ?? "");
  return {
    task_id: String(task.id ?? ""),
    task_title: String(task.name ?? ""),
    task_description: String(task.description ?? task.text_content ?? ""),
    criterios_de_aceite: extractCustomFieldValue(task, criteriosId),
    agent_id: agentIdValue.trim() || defaultAgent,
    editorial_doc_url: extractCustomFieldValue(task, docUrlId),
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

function commentBody(comment: ClickUpComment): string {
  return String(comment.comment_text ?? "").trim();
}

function isAgentDraftComment(comment: ClickUpComment): boolean {
  const body = commentBody(comment);
  return (
    body.includes("## LinkedIn Draft") ||
    body.includes("## Resumo") ||
    body.includes("## Autochecagem") ||
    /_Generated by [^)]+\(.*\)_/i.test(body)
  );
}

function isSystemComment(comment: ClickUpComment): boolean {
  const username = String(comment.user?.username ?? "").trim().toLowerCase();
  if (!username) {
    return true;
  }
  return username === "system" || username.includes("clickup") || username.includes("automation");
}

function isCqPointerComment(comment: ClickUpComment): boolean {
  const body = commentBody(comment);
  return body.startsWith("[CQ-AI]");
}

function isCqBlockerComment(comment: ClickUpComment): boolean {
  const body = commentBody(comment);
  return body.startsWith("[CQ-BLOCKER]");
}

/** Return true when at least one non-system, non-agent, non-AI-pointer, non-blocker comment can guide a revision. */
export function hasActionableFeedback(comments: ClickUpComment[]): boolean {
  return comments.some(
    (comment) =>
      commentBody(comment) !== "" &&
      !isSystemComment(comment) &&
      !isAgentDraftComment(comment) &&
      !isCqPointerComment(comment) &&
      !isCqBlockerComment(comment)
  );
}

function commentTimestamp(comment: ClickUpComment): number {
  const date = comment.date;
  if (!date) {
    return 0;
  }
  const numeric = Number(date);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCommentDate(date: string | undefined): string {
  if (!date) {
    return "";
  }
  const numeric = Number(date);
  if (Number.isFinite(numeric)) {
    return new Date(numeric).toISOString();
  }
  return date;
}

/** Format comments oldest-first for embedded revision context. */
export function formatCommentThread(comments: ClickUpComment[]): string {
  return [...comments]
    .sort((left, right) => commentTimestamp(left) - commentTimestamp(right))
    .map((comment) => {
      const username = String(comment.user?.username ?? "Unknown").trim() || "Unknown";
      const date = formatCommentDate(comment.date);
      const suffix = date ? ` (${date})` : "";
      return `- **${username}**${suffix}: ${commentBody(comment)}`;
    })
    .join("\n");
}

/** Embed revision context in task_description without changing CallAgentInput. */
export function buildRevisionTaskDescription(brief: string, thread: string): string {
  return (
    `# Original Brief\n${brief.trim()}\n\n` +
    `# Revision Feedback (Comment Thread)\n${thread.trim()}\n\n` +
    "# Revision Instructions\n" +
    "Incorporate the actionable lead feedback above. Produce a revised LinkedIn draft that preserves the original brief, acceptance criteria, and Wolven voice."
  );
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

/**
 * Resolve a stage status name from field mapping.
 * Throws descriptive error if the status key is not in the mapping.
 */
export function stagedStatusName(fieldMapping: FieldMapping, statusKey: string): string {
  const name = statusName(fieldMapping, statusKey);
  if (!name) {
    throw new Error(
      `Missing status '${statusKey}' in field mapping. ` +
      `Available statuses: ${Object.keys(fieldMapping.statuses ?? {}).join(", ")}`
    );
  }
  return name;
}

/**
 * Validate that a stage status key exists in the field mapping.
 * Throws descriptive error if missing.
 */
export function validateStageStatus(fieldMapping: FieldMapping, statusKey: string): void {
  const name = statusName(fieldMapping, statusKey);
  if (!name) {
    throw new Error(
      `Missing staged status '${statusKey}' in field mapping. ` +
      `Staged statuses required: investigate, brief_review, write, content_review, format, final_review. ` +
      `Available: ${Object.keys(fieldMapping.statuses ?? {}).join(", ")}`
    );
  }
}

export function fieldId(fieldMapping: FieldMapping, key: string): string {
  return String(fieldMapping.custom_fields?.[key]?.clickup_field_id ?? "");
}

/**
 * Validate that all required stage statuses are present in the field mapping.
 * Throws descriptive error if any required status is missing.
 */
export function validateAllStageStatuses(fieldMapping: FieldMapping): void {
  const requiredStatuses = ["investigate", "brief_review", "write", "content_review", "format", "final_review"];
  const missing: string[] = [];
  for (const statusKey of requiredStatuses) {
    if (!statusName(fieldMapping, statusKey)) {
      missing.push(statusKey);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing staged statuses in field mapping: ${missing.join(", ")}. ` +
      `Required: ${requiredStatuses.join(", ")}. ` +
      `Available: ${Object.keys(fieldMapping.statuses ?? {}).join(", ")}`
    );
  }
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

/** Extract latest actionable lead feedback comment from thread. Filters out pointer comments and agent drafts. */
export function extractLatestLeadFeedback(comments: ClickUpComment[]): string {
  const actionable = comments.filter(
    (comment) =>
      commentBody(comment) !== "" &&
      !isSystemComment(comment) &&
      !isAgentDraftComment(comment) &&
      !isCqPointerComment(comment) &&
      !isCqBlockerComment(comment)
  );
  if (actionable.length === 0) {
    return "";
  }
  const sorted = [...actionable].sort((left, right) => commentTimestamp(left) - commentTimestamp(right));
  const latest = sorted[sorted.length - 1];
  return latest ? commentBody(latest) : "";
}

/** Select prior stage Doc page name based on current stage. */
export function selectPriorDocPageName(stage: string): string | null {
  if (stage === "write") return "Brief";
  if (stage === "format") return "Argument";
  return null;
}

/** Build StageInput envelope from task fields, Doc content, and comments. */
export function buildStageInput(
  taskFields: TaskFields,
  stage: string,
  priorDocContent: string = "",
  comments: ClickUpComment[] = [],
  model: string = DEFAULT_MODEL
): StageInput {
  const feedback = extractLatestLeadFeedback(comments);
  return {
    agent_id: taskFields.agent_id,
    stage: stage as "investigate" | "write" | "format",
    task_title: taskFields.task_title,
    task_description: taskFields.task_description,
    criterios_de_aceite: taskFields.criterios_de_aceite,
    prior_stage_artifact: priorDocContent || undefined,
    lead_feedback: feedback || undefined,
    model,
  };
}
