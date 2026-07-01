import { DEFAULT_AGENT_ID, DEFAULT_MODEL, fieldId } from "../marketing-pipeline/logic.js";
import type { FieldMapping } from "../types/field-mapping.js";
import { joinN8nJs } from "./n8n-codegen.js";

/** Mirrors `unwrapWebhookPayload` — n8n webhook POST bodies may nest under `body`. */
export const UNWRAP_WEBHOOK_PAYLOAD_JS = [
  "const raw = $input.first().json;",
  "const payload = (raw.body && raw.body.history_items) ? raw.body : raw;",
].join("\n");

/** n8n Code node: Extract Webhook Context (see `extractWebhookContext` in logic.ts). */
export function extractWebhookContextJs(): string {
  return joinN8nJs([
    UNWRAP_WEBHOOK_PAYLOAD_JS,
    "const items = payload.history_items || [];",
    "const first = items[0] || {};",
    "function statusValue(value) {",
    "  if (value !== null && typeof value === 'object') return String(value.status ?? '').trim().toLowerCase();",
    "  return String(value ?? '').trim().toLowerCase();",
    "}",
    "return [{",
    "  json: {",
    "    task_id: String(payload.task_id ?? ''),",
    "    webhook_id: String(payload.webhook_id ?? ''),",
    "    history_item_id: String(first.id ?? ''),",
    "    list_id: String(first.parent_id ?? ''),",
    "    received_at_ms: Date.now(),",
    "    ingress_mode: String(raw.ingress_mode ?? payload.ingress_mode ?? 'first_draft'),",
    "    transition_before: statusValue(first.before),",
    "    transition_after: statusValue(first.after),",
    "    stage: payload.stage || null,",
    "  },",
    "}];",
  ]);
}

/** Shared readCustomField helper — mirrors `extractCustomFieldValue` in logic.ts. */
export const READ_CUSTOM_FIELD_JS = [
  "function readCustomField(task, fieldId) {",
  "  if (!fieldId || fieldId === '<TBD>') return '';",
  "  const fields = task.custom_fields || [];",
  "  const match = fields.find((field) => String(field.id) === String(fieldId));",
  "  if (!match || match.value === null || match.value === undefined) return '';",
  "  if (typeof match.value === 'object') {",
  "    return String(match.value.value ?? match.value.name ?? match.value.label ?? '');",
  "  }",
  "  return String(match.value);",
  "}",
].join("\n");

/** n8n Code node: Extract Task Fields (see `extractTaskFields` in logic.ts). */
export function extractTaskFieldsJs(fieldMapping: FieldMapping): string {
  const criteriosId = fieldId(fieldMapping, "criterios_de_aceite");
  const agentFieldId = fieldId(fieldMapping, "agent_id");
  const docUrlId = fieldId(fieldMapping, "editorial_doc_url");
  const defaultAgentId = String(fieldMapping.custom_fields.agent_id?.default ?? DEFAULT_AGENT_ID);
  return joinN8nJs([
    "const FIELD_IDS = {",
    `  criterios_de_aceite: ${JSON.stringify(criteriosId)},`,
    `  agent_id: ${JSON.stringify(agentFieldId)},`,
    `  editorial_doc_url: ${JSON.stringify(docUrlId)},`,
    `  default_agent_id: ${JSON.stringify(defaultAgentId)},`,
    "};",
    "",
    "const STAGE_TO_AGENT = {",
    "  investigate: 'investigative-brief',",
    "  write: 'long-form-argument',",
    "  format: 'linkedin-format',",
    "};",
    "",
    READ_CUSTOM_FIELD_JS,
    "",
    "const task = $input.first().json;",
    "const webhook = $('Extract Webhook Context').first().json;",
    "const stage = webhook.stage || null;",
    "const agentId = stage && STAGE_TO_AGENT[stage] ? STAGE_TO_AGENT[stage] : (readCustomField(task, FIELD_IDS.agent_id).trim() || FIELD_IDS.default_agent_id);",
    "",
    "return [{",
    "  json: {",
    "    task_id: String(task.id ?? webhook.task_id ?? ''),",
    "    stage: stage,",
    "    agent_id: agentId,",
    "    task_title: String(task.name ?? ''),",
    "    task_description: String(task.description ?? task.text_content ?? ''),",
    "    criterios_de_aceite: readCustomField(task, FIELD_IDS.criterios_de_aceite),",
    "    editorial_doc_url: readCustomField(task, FIELD_IDS.editorial_doc_url),",
    "    ingress_mode: String(webhook.ingress_mode ?? 'first_draft'),",
    `    model: ${JSON.stringify(DEFAULT_MODEL)},`,
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Set Ingress Mode (see `IngressMode` in logic.ts). */
export function setIngressModeJs(mode: "first_draft" | "revision" | "skip"): string {
  return joinN8nJs([
    "const item = $input.first().json;",
    "return [{",
    "  json: {",
    "    ...item,",
    `    ingress_mode: ${JSON.stringify(mode)},`,
    "  },",
    "}];",
  ]);
}

/** Shared revision comment helpers — mirror comment helpers in logic.ts. */
export const REVISION_COMMENT_HELPERS_JS = [
  "function normalizeComments(input) {",
  "  const values = Array.isArray(input) ? input : [input];",
  "  return values.flatMap((value) => {",
  "    if (Array.isArray(value)) return normalizeComments(value);",
  "    if (Array.isArray(value?.comments)) return value.comments;",
  "    if (Array.isArray(value?.json?.comments)) return value.json.comments;",
  "    if (value && typeof value === 'object' && 'comment_text' in value) return [value];",
  "    if (value?.json && typeof value.json === 'object' && 'comment_text' in value.json) return [value.json];",
  "    return [];",
  "  });",
  "}",
  "",
  "function commentBody(comment) {",
  "  return String(comment?.comment_text ?? '').trim();",
  "}",
  "",
  "function isAgentDraftComment(comment) {",
  "  const body = commentBody(comment);",
  "  return body.includes('## LinkedIn Draft') ||",
  "    body.includes('## Resumo') ||",
  "    body.includes('## Autochecagem') ||",
  "    /_Generated by [^)]+\\(.*\\)_/i.test(body);",
  "}",
  "",
  "function isSystemComment(comment) {",
  "  const username = String(comment?.user?.username ?? '').trim().toLowerCase();",
  "  if (!username) return true;",
  "  return username === 'system' || username.includes('clickup') || username.includes('automation');",
  "}",
  "",
  "function isCqPointerComment(comment) {",
  "  const body = commentBody(comment);",
  "  return body.startsWith('[CQ-AI]');",
  "}",
  "",
  "function isCqBlockerComment(comment) {",
  "  const body = commentBody(comment);",
  "  return body.startsWith('[CQ-BLOCKER]');",
  "}",
  "",
  "function isActionableComment(comment) {",
  "  return commentBody(comment) !== '' && !isSystemComment(comment) && !isAgentDraftComment(comment) &&",
  "    !isCqPointerComment(comment) && !isCqBlockerComment(comment);",
  "}",
  "",
  "function actionableComments(comments) {",
  "  return comments.filter((comment) => isActionableComment(comment));",
  "}",
  "",
  "function hasActionableFeedback(comments) {",
  "  return actionableComments(comments).length > 0;",
  "}",
  "",
  "function commentTimestamp(comment) {",
  "  const date = comment?.date;",
  "  if (!date) return 0;",
  "  const numeric = Number(date);",
  "  if (Number.isFinite(numeric)) return numeric;",
  "  const parsed = Date.parse(date);",
  "  return Number.isFinite(parsed) ? parsed : 0;",
  "}",
  "",
  "function formatCommentDate(date) {",
  "  if (!date) return '';",
  "  const numeric = Number(date);",
  "  if (Number.isFinite(numeric)) return new Date(numeric).toISOString();",
  "  return String(date);",
  "}",
  "",
  "function formatCommentThread(comments) {",
  "  return [...comments]",
  "    .sort((left, right) => commentTimestamp(left) - commentTimestamp(right))",
  "    .map((comment) => {",
  "      const username = String(comment?.user?.username ?? 'Unknown').trim() || 'Unknown';",
  "      const date = formatCommentDate(comment?.date);",
  "      const suffix = date ? ` (${date})` : '';",
  "      return `- **${username}**${suffix}: ${commentBody(comment)}`;",
  "    })",
  "    .join('\\n');",
  "}",
].join("\n");

/** Shared revision task-description helper — see `buildRevisionTaskDescription` in logic.ts. */
export const BUILD_REVISION_TASK_DESCRIPTION_JS = [
  "function buildRevisionTaskDescription(brief, thread) {",
  "  return `# Original Brief\\n${String(brief ?? '').trim()}\\n\\n` +",
  "    `# Revision Feedback (Comment Thread)\\n${String(thread ?? '').trim()}\\n\\n` +",
  "    '# Revision Instructions\\n' +",
  "    'Incorporate the actionable lead feedback above. Produce a revised LinkedIn draft that preserves the original brief, acceptance criteria, and Wolven voice.';",
  "}",
].join("\n");

/** n8n Code node: Collect Task Comments from the ClickUp comment getAll output. */
export function collectTaskCommentsJs(): string {
  return joinN8nJs([
    REVISION_COMMENT_HELPERS_JS,
    "",
    "const fields = $('Extract Task Fields').first().json;",
    "const comments = normalizeComments($input.all().map((item) => item.json));",
    "const feedback = actionableComments(comments);",
    "return [{",
    "  json: {",
    "    task_id: fields.task_id,",
    "    comments,",
    "    feedback_comments: feedback,",
    "    comment_count: comments.length,",
    "    has_actionable_feedback: feedback.length > 0,",
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Prepare Revision Call Agent Input (see `buildRevisionTaskDescription` in logic.ts). */
export function prepareRevisionCallAgentInputJs(): string {
  return joinN8nJs([
    REVISION_COMMENT_HELPERS_JS,
    "",
    BUILD_REVISION_TASK_DESCRIPTION_JS,
    "",
    "const fields = $('Extract Task Fields').first().json;",
    "const collected = $('Collect Task Comments').first().json;",
    "const comments = normalizeComments(collected.feedback_comments ?? collected.comments ?? []);",
    "const thread = formatCommentThread(comments);",
    "const taskDescription = buildRevisionTaskDescription(fields.task_description, thread);",
    "",
    "return [{",
    "  json: {",
    "    agent_id: fields.agent_id,",
    "    task_title: fields.task_title,",
    "    task_description: taskDescription,",
    "    criterios_de_aceite: fields.criterios_de_aceite,",
    "    task_id: fields.task_id,",
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Format Empty-Feedback Guidance Comment. */
export function formatGuidanceCommentJs(): string {
  return joinN8nJs([
    "const fields = $('Extract Task Fields').first().json;",
    "const commentText = [",
    "  '## Revision feedback needed',",
    "  '',",
    "  'I did not find actionable lead feedback in the comment thread, so I did not start an automated revision.',",
    "  '',",
    "  'Please add a comment with the specific changes needed, then move the task back to Needs Review.',",
    "].join('\\n');",
    "return [{ json: { task_id: fields.task_id, comment_text: commentText } }];",
  ]);
}

/** n8n Code node: Log Empty Feedback Guidance. */
export function logEmptyFeedbackGuidanceJs(): string {
  return joinN8nJs([
    "const fields = $('Extract Task Fields').first().json;",
    "const record = {",
    "  event: 'empty_feedback_guidance',",
    "  task_id: fields.task_id,",
    "};",
    "console.log(JSON.stringify(record));",
    "return [{ json: record }];",
  ]);
}

/** n8n Code node: Prepare Call Agent Input (see `buildCallAgentInput` in logic.ts). */
export function prepareCallAgentInputJs(): string {
  return joinN8nJs([
    "const fields = $('Extract Task Fields').first().json;",
    "return [{",
    "  json: {",
    "    agent_id: fields.agent_id,",
    "    task_title: fields.task_title,",
    "    task_description: fields.task_description,",
    "    criterios_de_aceite: fields.criterios_de_aceite,",
    "    task_id: fields.task_id,",
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Format Draft Comment (see `formatClickupComment` in logic.ts). */
export function formatDraftCommentJs(): string {
  return joinN8nJs([
    "const agentOutput = $('Execute Call Agent').first().json;",
    "const taskFields = $('Extract Task Fields').first().json;",
    `const agentId = taskFields.agent_id ?? ${JSON.stringify(DEFAULT_AGENT_ID)};`,
    `const model = taskFields.model ?? ${JSON.stringify(DEFAULT_MODEL)};`,
    "",
    "const commentText = [",
    "  '## LinkedIn Draft',",
    "  '',",
    "  agentOutput.deliverable_markdown ?? '',",
    "  '',",
    "  '---',",
    "  '',",
    "  '## Resumo',",
    "  '',",
    "  agentOutput.resumo ?? '',",
    "  '',",
    "  '---',",
    "  '',",
    "  '## Autochecagem',",
    "  '',",
    "  agentOutput.autochecagem ?? '',",
    "  '',",
    "  '---',",
    "  `_Generated by ${agentId} (${model})_`,",
    "].join('\\n');",
    "",
    "return [{",
    "  json: {",
    "    task_id: taskFields.task_id,",
    "    agent_id: agentId,",
    "    model,",
    "    comment_text: commentText,",
    "    deliverable_markdown: agentOutput.deliverable_markdown,",
    "    resumo: agentOutput.resumo,",
    "    autochecagem: agentOutput.autochecagem,",
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Agent Parse Failure. */
export function agentParseFailureJs(): string {
  return joinN8nJs([
    "const output = $input.first().json;",
    "const taskFields = $('Extract Task Fields').first().json;",
    "console.log(JSON.stringify({",
    "  task_id: taskFields.task_id,",
    "  agent_id: taskFields.agent_id,",
    "  execution_id: $execution.id,",
    "  parse_success: false,",
    "  error: output.error ?? 'Agent returned error envelope',",
    "}));",
    "throw new Error(`Call Agent failed: ${output.error ?? 'unknown error'}`);",
  ]);
}

/** Status helpers — mirrors `formatIngressTransition` / `deriveIngressSkipReason` in logic.ts. */
export const INGRESS_STATUS_HELPERS_JS = [
  "function statusValue(value) {",
  "  if (value !== null && typeof value === 'object') return String(value.status ?? '').trim().toLowerCase();",
  "  return String(value ?? '').trim().toLowerCase();",
  "}",
].join("\n");

/** n8n Code node: Log Ingress Skipped (see `describeIngressSkipReason` in logic.ts). */
export function logIngressSkippedJs(_fieldMapping: FieldMapping): string {
  return joinN8nJs([
    UNWRAP_WEBHOOK_PAYLOAD_JS,
    "const items = payload.history_items || [];",
    "const first = items[0] || {};",
    "const targetStatusKey = String(raw.target_status_key ?? 'ready');",
    "",
    INGRESS_STATUS_HELPERS_JS,
    "",
    "const before = statusValue(first.before);",
    "const after = statusValue(first.after);",
    "const transition = before || after ? `${before}->${after}` : '';",
    "",
    "let reason = targetStatusKey === 'needs_review' ? 'not_entering_needs_review' : 'not_entering_ready';",
    "if (!items.length) reason = 'no_history_items';",
    "else if (first.field !== 'status') reason = 'field_not_status';",
    "",
    "const record = {",
    "  event: 'ingress_skipped',",
    "  task_id: String(payload.task_id ?? ''),",
    "  webhook_id: String(payload.webhook_id ?? ''),",
    "  history_item_id: String(first.id ?? ''),",
    "  transition,",
    "  reason,",
    "};",
    "console.log(JSON.stringify(record));",
    "return [{ json: record }];",
  ]);
}

export function dedupIfExpression(): string {
  return (
    `={{ (() => { ` +
    `const staticData = $getWorkflowStaticData('global'); ` +
    `const key = String($json.history_item_id ?? ''); ` +
    `if (!key) return false; ` +
    `staticData.seenHistoryItems = staticData.seenHistoryItems || {}; ` +
    `return Boolean(staticData.seenHistoryItems[key]); ` +
    `})() }}`
  );
}

export function markHistoryItemSeenJs(): string {
  return joinN8nJs([
    "const staticData = $getWorkflowStaticData('global');",
    "staticData.seenHistoryItems = staticData.seenHistoryItems || {};",
    "const key = String($json.history_item_id ?? '');",
    "if (key) staticData.seenHistoryItems[key] = Date.now();",
    "return [{ json: $json }];",
  ]);
}

export function logDuplicateIngressJs(): string {
  return joinN8nJs([
    "const context = $input.first().json;",
    "const before = String(context.transition_before ?? '').trim().toLowerCase();",
    "const after = String(context.transition_after ?? '').trim().toLowerCase();",
    "const transition = before || after ? `${before}->${after}` : '';",
    "const record = {",
    "  event: 'ingress_skipped',",
    "  task_id: context.task_id,",
    "  webhook_id: context.webhook_id,",
    "  history_item_id: context.history_item_id,",
    "  transition,",
    "  reason: 'duplicate_history_item',",
    "};",
    "console.log(JSON.stringify(record));",
    "return [{ json: record }];",
  ]);
}

/** n8n Code node: Mark Needs Review false branch before shared skip logging. */
export function setNeedsReviewSkipTargetJs(): string {
  return joinN8nJs([
    "const item = $input.first().json;",
    "return [{ json: { ...item, target_status_key: 'needs_review' } }];",
  ]);
}

/** Shared ClickUp Docs v3 API helpers — mirrors createClickUpDoc, listDocPages, etc. from docs-helpers.ts */
export const CLICKUP_DOCS_V3_HELPERS_JS = [
  "async function docsV3Request(method, path, token, body) {",
  "  const baseUrl = 'https://api.clickup.com';",
  "  const headers = {",
  "    'Authorization': token,",
  "    'Accept': 'application/json',",
  "  };",
  "  if (body) headers['Content-Type'] = 'application/json';",
  "  ",
  "  try {",
  "    const response = await fetch(`${baseUrl}${path}`, {",
  "      method,",
  "      headers,",
  "      body: body ? JSON.stringify(body) : undefined,",
  "    });",
  "    ",
  "    if (!response.ok) {",
  "      const text = await response.text().catch(() => '');",
  "      return {",
  "        success: false,",
  "        error: `HTTP ${response.status}${text ? ': ' + text.slice(0, 200) : ''}`,",
  "      };",
  "    }",
  "    ",
  "    if (response.status === 204) return { success: true, data: undefined };",
  "    ",
  "    const data = await response.json();",
  "    return { success: true, data };",
  "  } catch (err) {",
  "    return { success: false, error: String(err) };",
  "  }",
  "}",
  "",
  "async function createClickUpDoc(workspaceId, listId, taskId, token) {",
  "  const path = `/api/v3/workspaces/${workspaceId}/docs`;",
  "  const body = {",
  "    name: `Editorial workspace for ${taskId}`,",
  "    parent: { id: listId, type: 6 },",
  "    visibility: 'PRIVATE',",
  "    create_page: true,",
  "  };",
  "  const result = await docsV3Request('POST', path, token, body);",
  "  if (!result.success) return result;",
  "  if (!result.data?.id) {",
  "    return { success: false, error: 'Doc created but response did not include id' };",
  "  }",
  "  return { success: true, data: result.data.id };",
  "}",
  "",
  "async function listDocPages(workspaceId, docId, token) {",
  "  const path = `/api/v3/workspaces/${workspaceId}/docs/${docId}/pages`;",
  "  const result = await docsV3Request('GET', path, token);",
  "  if (!result.success) return result;",
  "  const pages = result.data?.pages ?? [];",
  "  return { success: true, data: pages };",
  "}",
  "",
  "async function readPageContent(workspaceId, docId, pageId, token) {",
  "  const path = `/api/v3/workspaces/${workspaceId}/docs/${docId}/pages/${pageId}?content_format=text/md`;",
  "  const result = await docsV3Request('GET', path, token);",
  "  if (!result.success) return result;",
  "  if (result.data?.content === undefined) {",
  "    return { success: false, error: 'Page fetched but response did not include content' };",
  "  }",
  "  return { success: true, data: result.data.content };",
  "}",
  "",
  "async function replacePage(workspaceId, docId, pageId, content, token) {",
  "  const path = `/api/v3/workspaces/${workspaceId}/docs/${docId}/pages/${pageId}`;",
  "  const body = {",
  "    content,",
  "    content_edit_mode: 'replace',",
  "    content_format: 'text/md',",
  "  };",
  "  const result = await docsV3Request('PUT', path, token, body);",
  "  return result;",
  "}",
  "",
  "async function getOrCreatePageByName(workspaceId, docId, pageName, token) {",
  "  const listResult = await listDocPages(workspaceId, docId, token);",
  "  if (!listResult.success) return listResult;",
  "  ",
  "  const pages = listResult.data ?? [];",
  "  const existing = pages.find((p) => p.name === pageName);",
  "  if (existing?.id) return { success: true, data: existing.id };",
  "  ",
  "  const path = `/api/v3/workspaces/${workspaceId}/docs/${docId}/pages`;",
  "  const body = {",
  "    name: pageName,",
  "    content: `# ${pageName}\\n\\n*Initial placeholder content for ${pageName}.*`,",
  "    content_format: 'text/md',",
  "  };",
  "  const createResult = await docsV3Request('POST', path, token, body);",
  "  if (!createResult.success) return createResult;",
  "  if (!createResult.data?.id) {",
  "    return { success: false, error: `Page '${pageName}' created but response did not include id` };",
  "  }",
  "  return { success: true, data: createResult.data.id };",
  "}",
].join("\n");

/** n8n Code node: Create ClickUp Doc if needed (task_12 step 1). */
export function createDocIfNeededJs(): string {
  return joinN8nJs([
    CLICKUP_DOCS_V3_HELPERS_JS,
    "",
    "const fields = $('Extract Task Fields').first().json;",
    "const token = process.env.CLICKUP_API_TOKEN || process.env.CLICKUP_TOKEN;",
    "if (!token) throw new Error('CLICKUP_API_TOKEN not set');",
    "",
    "let docId = String(fields.editorial_doc_url ?? '').trim();",
    "if (docId) {",
    "  return [{",
    "    json: {",
    "      ...fields,",
    "      doc_id: docId,",
    "      doc_created: false,",
    "      operation: 'use_existing_doc',",
    "    },",
    "  }];",
    "}",
    "",
    "const webhook = $('Extract Webhook Context').first().json;",
    "const workspaceId = fields.workspace_id;",
    "const listId = webhook.list_id;",
    "if (!workspaceId || !listId) {",
    "  throw new Error('workspace_id and list_id required for Doc creation');",
    "}",
    "",
    "const result = await createClickUpDoc(workspaceId, listId, fields.task_id, token);",
    "if (!result.success) {",
    "  throw new Error(`Doc creation failed: ${result.error}`);",
    "}",
    "",
    "return [{",
    "  json: {",
    "    ...fields,",
    "    doc_id: result.data,",
    "    doc_created: true,",
    "    operation: 'created_doc',",
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Get or Create Stage Page (task_12 step 2). */
export function getOrCreateStagePage(stageName: string, pageName: string): string {
  return joinN8nJs([
    CLICKUP_DOCS_V3_HELPERS_JS,
    "",
    "const fields = $input.first().json;",
    "const token = process.env.CLICKUP_API_TOKEN || process.env.CLICKUP_TOKEN;",
    "if (!token) throw new Error('CLICKUP_API_TOKEN not set');",
    "",
    "const workspaceId = fields.workspace_id;",
    "const docId = fields.doc_id;",
    "if (!workspaceId || !docId) {",
    "  throw new Error('workspace_id and doc_id required');",
    "}",
    "",
    "const result = await getOrCreatePageByName(workspaceId, docId, " + JSON.stringify(pageName) + ", token);",
    "if (!result.success) {",
    "  throw new Error(`Page lookup/create failed: ${result.error}`);",
    "}",
    "",
    "return [{",
    "  json: {",
    "    ...fields,",
    `    stage: ${JSON.stringify(stageName)},`,
    `    page_name: ${JSON.stringify(pageName)},`,
    "    page_id: result.data,",
    "    operation: 'have_page_id',",
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Read Current Page Content (task_12 step 3). */
export function readCurrentPageJs(): string {
  return joinN8nJs([
    CLICKUP_DOCS_V3_HELPERS_JS,
    "",
    "const fields = $input.first().json;",
    "const token = process.env.CLICKUP_API_TOKEN || process.env.CLICKUP_TOKEN;",
    "if (!token) throw new Error('CLICKUP_API_TOKEN not set');",
    "",
    "const workspaceId = fields.workspace_id;",
    "const docId = fields.doc_id;",
    "const pageId = fields.page_id;",
    "if (!workspaceId || !docId || !pageId) {",
    "  throw new Error('workspace_id, doc_id, and page_id required');",
    "}",
    "",
    "const result = await readPageContent(workspaceId, docId, pageId, token);",
    "if (!result.success) {",
    "  throw new Error(`Page read failed: ${result.error}`);",
    "}",
    "",
    "return [{",
    "  json: {",
    "    ...fields,",
    "    page_content: result.data,",
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Replace Stage Page Content (task_12 step 3). */
export function replacePageJs(): string {
  return joinN8nJs([
    CLICKUP_DOCS_V3_HELPERS_JS,
    "",
    "const fields = $input.first().json;",
    "const token = process.env.CLICKUP_API_TOKEN || process.env.CLICKUP_TOKEN;",
    "if (!token) throw new Error('CLICKUP_API_TOKEN not set');",
    "",
    "const workspaceId = fields.workspace_id;",
    "const docId = fields.doc_id;",
    "const pageId = fields.page_id;",
    "const content = fields.artifact_markdown || '';",
    "if (!workspaceId || !docId || !pageId) {",
    "  throw new Error('workspace_id, doc_id, and page_id required');",
    "}",
    "",
    "const result = await replacePage(workspaceId, docId, pageId, content, token);",
    "if (!result.success) {",
    "  throw new Error(`Page replacement failed: ${result.error}`);",
    "}",
    "",
    "return [{",
    "  json: {",
    "    ...fields,",
    "    page_replaced: true,",
    "    operation: 'page_replaced',",
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Select Prior Doc Page by Stage (task_13 step 2). */
export function selectPriorDocPageJs(): string {
  return joinN8nJs([
    "const fields = $('Extract Task Fields').first().json;",
    "const stage = fields.stage || 'investigate';",
    "",
    "let priorPageName = null;",
    "if (stage === 'write') priorPageName = 'Brief';",
    "if (stage === 'format') priorPageName = 'Argument';",
    "",
    "return [{",
    "  json: {",
    "    ...fields,",
    "    prior_page_name: priorPageName,",
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Extract Latest Lead Feedback Comment (task_13 step 3). */
export function extractLatestLeadFeedbackJs(): string {
  return joinN8nJs([
    REVISION_COMMENT_HELPERS_JS,
    "",
    "const taskFields = $('Extract Task Fields').first().json;",
    "const collected = $('Collect Task Comments').first().json || {};",
    "const comments = normalizeComments(collected.feedback_comments ?? collected.comments ?? []);",
    "",
    "const actionable = comments.filter((comment) => isActionableComment(comment));",
    "if (actionable.length === 0) {",
    "  return [{",
    "    json: {",
    "      ...taskFields,",
    "      lead_feedback: undefined,",
    "    },",
    "  }];",
    "}",
    "",
    "const sorted = [...actionable].sort((left, right) => commentTimestamp(left) - commentTimestamp(right));",
    "const latestFeedback = commentBody(sorted[sorted.length - 1]);",
    "",
    "return [{",
    "  json: {",
    "    ...taskFields,",
    "    lead_feedback: latestFeedback || undefined,",
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Prepare Staged Call Agent Input (task_13 step 4). */
export function prepareStagedCallAgentInputJs(): string {
  return joinN8nJs([
    `const DEFAULT_MODEL = ${JSON.stringify(DEFAULT_MODEL)};`,
    "",
    "const fields = $('Extract Task Fields').first().json;",
    "const priorDoc = $('Read Current Page').first()?.json;",
    "const feedbackFields = $('Extract Latest Lead Feedback').first()?.json || {};",
    "",
    "const stage = fields.stage || 'investigate';",
    "const priorArtifact = priorDoc?.page_content || '';",
    "const leadFeedback = feedbackFields.lead_feedback || undefined;",
    "",
    "return [{",
    "  json: {",
    "    agent_id: fields.agent_id,",
    "    stage,",
    "    task_title: fields.task_title,",
    "    task_description: fields.task_description,",
    "    criterios_de_aceite: fields.criterios_de_aceite,",
    "    prior_stage_artifact: priorArtifact || undefined,",
    "    lead_feedback: leadFeedback,",
    "    model: fields.model || DEFAULT_MODEL,",
    "    task_id: fields.task_id,",
    "  },",
    "}];",
  ]);
}

/** n8n Code node: Extract stage from webhook and store in context for routing. */
export function extractStageJs(fieldMapping: FieldMapping): string {
  const investigateStatus = String(fieldMapping.statuses?.investigate ?? "investigate").trim().toLowerCase();
  const writeStatus = String(fieldMapping.statuses?.write ?? "write").trim().toLowerCase();
  const formatStatus = String(fieldMapping.statuses?.format ?? "format").trim().toLowerCase();

  return joinN8nJs([
    UNWRAP_WEBHOOK_PAYLOAD_JS,
    "",
    "const items = payload.history_items || [];",
    "const item = items[0];",
    "if (!item || item.field !== 'status') {",
    "  return [{ json: { ...payload, stage: null } }];",
    "}",
    "",
    "const after = item.after;",
    "const status = (after !== null && typeof after === 'object') ? String(after.status ?? '').trim().toLowerCase() : String(after ?? '').trim().toLowerCase();",
    "",
    `const investigateMatch = status === ${JSON.stringify(investigateStatus)};`,
    `const writeMatch = status === ${JSON.stringify(writeStatus)};`,
    `const formatMatch = status === ${JSON.stringify(formatStatus)};`,
    "",
    "let stage = null;",
    "if (investigateMatch) stage = 'investigate';",
    "else if (writeMatch) stage = 'write';",
    "else if (formatMatch) stage = 'format';",
    "",
    "return [{",
    "  json: {",
    "    ...payload,",
    "    stage: stage,",
    "  },",
    "}];",
  ]);
}

/** n8n IF node expression: check if payload has any staged status (investigate, write, or format). */
export function stagedIngressIfExpression(fieldMapping: FieldMapping = {}): string {
  const investigateStatus = String(fieldMapping.statuses?.investigate ?? "investigate").trim().toLowerCase();
  const writeStatus = String(fieldMapping.statuses?.write ?? "write").trim().toLowerCase();
  const formatStatus = String(fieldMapping.statuses?.format ?? "format").trim().toLowerCase();

  return (
    `={{ (() => { ` +
    `const payload = $json.body && $json.body.history_items ? $json.body : $json; ` +
    `const item = payload?.history_items?.[0]; ` +
    `if (!item || item.field !== "status") return false; ` +
    `const after = item.after; ` +
    `const status = (after !== null && typeof after === "object") ? String(after.status ?? "").trim().toLowerCase() : String(after ?? "").trim().toLowerCase(); ` +
    `return status === ${JSON.stringify(investigateStatus)} || status === ${JSON.stringify(writeStatus)} || status === ${JSON.stringify(formatStatus)}; ` +
    `})() }}`
  );
}

/** n8n IF node expression: check if stage is investigate. */
export function routeInvestigateIfExpression(): string {
  return "={{ $json.stage === 'investigate' }}";
}

/** n8n IF node expression: check if stage is write. */
export function routeWriteIfExpression(): string {
  return "={{ $json.stage === 'write' }}";
}

/** n8n IF node expression: check if stage is format. */
export function routeFormatIfExpression(): string {
  return "={{ $json.stage === 'format' }}";
}
