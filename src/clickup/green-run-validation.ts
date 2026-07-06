import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  COMMENT_SECTIONS,
  commentIncludesRequiredSections,
  loadFieldMapping,
} from "../marketing-pipeline/logic.js";
import type { FieldMapping } from "../types/field-mapping.js";
import { AUTOMATION_STATUS_KEYS, automationStatusDisplayName, automationStatusDisplayNames } from "../types/field-mapping.js";
import { loadRepoDotenv, REPO_ROOT } from "../load-env.js";
import {
  N8N_API_URL_DEFAULT,
  N8nHttpError,
  N8nRequestError,
  createN8nClient,
  n8nClientFromEnv,
  summarizeExecution,
  type N8nClient,
  type N8nExecution,
  type N8nWorkflowSummary,
} from "../n8n/client.js";
import { ClickUpHttpError, clickupDelete, clickupGet, clickupPost, clickupPut } from "./client.js";
import type { ClickUpClientOptions } from "./client.js";
import { runGate } from "./vendor-gate.js";

export { COMMENT_SECTIONS, N8N_API_URL_DEFAULT };
export const EVIDENCE_PATH = resolve(REPO_ROOT, "agents", "harness", "green-run-evidence.json");
export const RUN_LOG_ROOT = resolve(REPO_ROOT, "logs", "green-run");

export const GREEN_RUN_CHECKLIST = [
  "field_mapping_synced",
  "clickup_list_configured",
  "clickup_custom_fields_present",
  "clickup_statuses_present",
  "n8n_call_agent_workflow_present",
  "n8n_main_workflow_present",
  "n8n_main_workflow_active",
  "test_task_brief_complete",
  "status_in_progress_within_5s",
  "comment_has_three_sections",
  "latency_under_60s",
  "final_status_review",
  "n8n_execution_success",
  "marketing_lead_usability",
  "revision_draft_posted",
  "revision_latency_under_60s",
] as const;

const REQUIRED_FIELDS = ["ACs", "Agent"];

const RUNTIME_STEPS = [
  "test_task_brief_complete",
  "status_in_progress_within_5s",
  "comment_has_three_sections",
  "latency_under_60s",
  "final_status_review",
  "n8n_execution_success",
  "marketing_lead_usability",
];

export const LEAD_FEEDBACK_COMMENT = "Shorten the hook, add a customer quote, keep the CTA as is.";

export const DEFAULT_TEST_BRIEF = {
  name: "[M1 green run] Launch post for Q3 product update",
  description:
    "Announce the new dashboard feature for marketing leads. Angle: productivity win for remote teams.",
  criterios_de_aceite: "- Mention the dashboard\n- CTA to sign up\n- Under 300 words",
};

export interface CheckResult {
  step: string;
  passed: boolean;
  detail: string;
}

interface ChecklistEntry {
  step: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

/** Accumulates green-run preflight checks; mirrors Python's `PreflightReport` dataclass. */
export class PreflightReport {
  results: CheckResult[] = [];

  get blockers(): string[] {
    return this.results.filter((r) => !r.passed).map((r) => r.detail);
  }

  get coveragePercent(): number {
    if (this.results.length === 0) {
      return 0;
    }
    const passed = this.results.filter((r) => r.passed).length;
    return Math.round((1000 * passed) / this.results.length) / 10;
  }

  toDict(): { checklist: ChecklistEntry[]; coverage_percent: number; blockers: string[] } {
    return {
      checklist: this.results.map((r) => ({ step: r.step, status: r.passed ? "pass" : "fail", detail: r.detail })),
      coverage_percent: this.coveragePercent,
      blockers: this.blockers,
    };
  }
}

export function commentHasSections(commentText: string): boolean {
  return commentIncludesRequiredSections(commentText);
}

export function fieldMappingSynced(mapping: FieldMapping): CheckResult {
  const listId = String(mapping.clickup_list_id ?? "");
  if (!listId || listId === "<TBD>") {
    return { step: "field_mapping_synced", passed: false, detail: "clickup_list_id is unset — run pnpm clickup:sync" };
  }
  for (const [key, spec] of Object.entries(mapping.custom_fields)) {
    const fieldId = String(spec.clickup_field_id ?? "");
    if (!fieldId || fieldId === "<TBD>") {
      return {
        step: "field_mapping_synced",
        passed: false,
        detail: `custom field '${key}' has unset clickup_field_id — run pnpm clickup:sync`,
      };
    }
  }
  return { step: "field_mapping_synced", passed: true, detail: `field-mapping.json synced for list ${listId}` };
}

async function clickupListConfigured(
  clientOptions: ClickUpClientOptions,
  listId: string,
  mapping: FieldMapping
): Promise<CheckResult> {
  const expected = mapping.list_name ?? "Marketing Pipeline";
  try {
    const data = await clickupGet<{ name?: string }>(`/list/${listId}`, clientOptions);
    const actual = data.name ?? "";
    if (actual !== expected) {
      return {
        step: "clickup_list_configured",
        passed: false,
        detail: `List name is '${actual}', expected '${expected}' — use Marketing Pipeline list per clickup/list-schema.md`,
      };
    }
    return { step: "clickup_list_configured", passed: true, detail: `List '${listId}' is '${actual}'` };
  } catch (err) {
    if (err instanceof ClickUpHttpError) {
      return {
        step: "clickup_list_configured",
        passed: false,
        detail: `ClickUp list ${listId} not reachable: HTTP ${err.status}`,
      };
    }
    throw err;
  }
}

async function clickupCustomFieldsPresent(clientOptions: ClickUpClientOptions, listId: string): Promise<CheckResult> {
  try {
    const data = await clickupGet<{ fields?: Array<{ name?: string }> }>(`/list/${listId}/field`, clientOptions);
    const names = new Set((data.fields ?? []).map((f) => f.name));
    const missing = REQUIRED_FIELDS.filter((name) => !names.has(name));
    if (missing.length > 0) {
      return {
        step: "clickup_custom_fields_present",
        passed: false,
        detail: `Missing custom fields (create in ClickUp UI): ${missing.join(", ")}`,
      };
    }
    return { step: "clickup_custom_fields_present", passed: true, detail: "All M1 custom fields present" };
  } catch (err) {
    if (err instanceof ClickUpHttpError) {
      return { step: "clickup_custom_fields_present", passed: false, detail: `Cannot list fields: HTTP ${err.status}` };
    }
    throw err;
  }
}

async function clickupStatusesPresent(
  clientOptions: ClickUpClientOptions,
  listId: string,
  mapping: FieldMapping
): Promise<CheckResult> {
  const required = automationStatusDisplayNames(mapping);
  const missingKeys = AUTOMATION_STATUS_KEYS.filter((key) => !automationStatusDisplayName(mapping, key));
  if (missingKeys.length > 0) {
    return {
      step: "clickup_statuses_present",
      passed: false,
      detail: `field-mapping.json missing automation status keys: ${missingKeys.join(", ")}`,
    };
  }
  try {
    const data = await clickupGet<{ statuses?: Array<{ status?: string }> }>(`/list/${listId}`, clientOptions);
    const names = new Set((data.statuses ?? []).map((s) => String(s.status ?? "").trim().toLowerCase()));
    const missing = required.filter((name) => !names.has(String(name).trim().toLowerCase()));
    if (missing.length > 0) {
      return { step: "clickup_statuses_present", passed: false, detail: `Missing statuses on list: ${missing.join(", ")}` };
    }
    return {
      step: "clickup_statuses_present",
      passed: true,
      detail: `${required.join(" / ")} present`,
    };
  } catch (err) {
    if (err instanceof ClickUpHttpError) {
      return { step: "clickup_statuses_present", passed: false, detail: `Cannot read list statuses: HTTP ${err.status}` };
    }
    throw err;
  }
}

interface N8nWorkflowCheckSummary extends Pick<N8nWorkflowSummary, "name" | "active"> {}

function findN8nWorkflow(workflows: N8nWorkflowCheckSummary[], ...names: string[]): N8nWorkflowCheckSummary | undefined {
  const lowered = new Set(names.map((n) => n.toLowerCase()));
  return workflows.find((wf) => lowered.has((wf.name ?? "").toLowerCase()));
}

function n8nWorkflowErrorDetail(err: unknown): string {
  if (err instanceof N8nHttpError) {
    return `n8n API error: HTTP ${err.status} ${err.bodySnippet}`;
  }
  if (err instanceof N8nRequestError) {
    return `n8n API error: ${err.message}`;
  }
  return `n8n API error: ${err instanceof Error ? err.message : String(err)}`;
}

async function n8nWorkflowChecks(apiUrl: string, apiKey: string): Promise<CheckResult[]> {
  let workflows: N8nWorkflowCheckSummary[];
  try {
    const client = createN8nClient({ apiUrl, apiKey });
    workflows = await client.listWorkflows(100);
  } catch (err) {
    const detail = n8nWorkflowErrorDetail(err);
    return [
      { step: "n8n_call_agent_workflow_present", passed: false, detail },
      { step: "n8n_main_workflow_present", passed: false, detail },
      { step: "n8n_main_workflow_active", passed: false, detail },
    ];
  }

  const callAgent = findN8nWorkflow(workflows, "Call Agent");
  const main = findN8nWorkflow(workflows, "Marketing Pipeline");
  return [
    {
      step: "n8n_call_agent_workflow_present",
      passed: callAgent !== undefined,
      detail: callAgent ? "Call Agent sub-workflow imported" : "Import marketing-pipelines/call-agent-subworkflow.json",
    },
    {
      step: "n8n_main_workflow_present",
      passed: main !== undefined,
      detail: main ? "Marketing Pipeline main workflow imported" : "Import marketing-pipelines/marketing-pipeline-main.json",
    },
    {
      step: "n8n_main_workflow_active",
      passed: Boolean(main?.active),
      detail: main?.active ? "Marketing Pipeline workflow is active" : "Activate Marketing Pipeline after binding credentials",
    },
  ];
}

export interface RunPreflightOptions {
  clickupToken: string;
  clickupListId: string;
  n8nApiUrl: string;
  n8nApiKey: string;
  fieldMappingPath?: string;
}

/** Run the M1 green-run preflight checklist against ClickUp + n8n. */
export async function runPreflight(options: RunPreflightOptions): Promise<PreflightReport> {
  const mapping = loadFieldMapping(options.fieldMappingPath);
  const report = new PreflightReport();
  report.results.push(fieldMappingSynced(mapping));

  const listId = String(mapping.clickup_list_id || options.clickupListId || "");
  if (listId && listId !== "<TBD>") {
    const clientOptions: ClickUpClientOptions = { token: options.clickupToken };
    report.results.push(await clickupListConfigured(clientOptions, listId, mapping));
    report.results.push(await clickupCustomFieldsPresent(clientOptions, listId));
    report.results.push(await clickupStatusesPresent(clientOptions, listId, mapping));
  } else {
    report.results.push(
      { step: "clickup_list_configured", passed: false, detail: "CLICKUP_LIST_ID / clickup_list_id unset" },
      { step: "clickup_custom_fields_present", passed: false, detail: "Skipped — list ID unset" },
      { step: "clickup_statuses_present", passed: false, detail: "Skipped — list ID unset" }
    );
  }

  report.results.push(...(await n8nWorkflowChecks(options.n8nApiUrl, options.n8nApiKey)));
  return report;
}

export interface MainWorkflowResult {
  verified: boolean;
  clickup_task_id?: string;
  clickup_task_url?: string;
  clickup_task_name?: string;
  status_path?: string[];
  latency_seconds?: number | null;
  latency_breakdown?: Record<string, number | null>;
  comment_sections_verified?: string[];
  marketing_lead_usability?: string;
  silent_failures?: number | null;
  n8n_execution_id?: string;
  n8n_execution_success?: boolean;
  filtered_execution_count?: number;
  n8n_host?: string;
  brief_complete?: boolean;
  in_progress_within_5s?: boolean;
  latency_under_60s?: boolean;
  final_status_review?: boolean;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface ExecuteGreenRunOptions {
  marketingLeadUsability?: string;
  env?: NodeJS.ProcessEnv;
  clientOptions?: Partial<Omit<ClickUpClientOptions, "token">>;
  n8nClient?: N8nClient;
  /** Test hook: override the n8n time-window start (defaults to execute trigger timestamp). */
  n8nLinkWindowStartMs?: number;
  pollIntervalMs?: number;
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface N8nExecutionLinkResult {
  n8n_execution_id: string;
  n8n_execution_success: boolean;
  filtered_execution_count: number;
}

const MARKETING_PIPELINE_WORKFLOW_NAME = "marketing pipeline";
const INGRESS_TRANSITION = "backlog → ready";

function executionStartedAtMs(execution: N8nExecution): number | null {
  if (!execution.startedAt) {
    return null;
  }
  const started = Date.parse(execution.startedAt);
  return Number.isFinite(started) ? started : null;
}

function pickIngressExecution(
  matches: Array<{ executionId: string; status: string; path: ReturnType<typeof summarizeExecution>["path"]; transition: string }>
): { executionId: string; status: string } | undefined {
  const ingress =
    matches.find((m) => m.path === "full" && m.transition === INGRESS_TRANSITION) ??
    matches.find((m) => m.path === "full") ??
    matches.find((m) => m.path === "error" && m.transition === INGRESS_TRANSITION) ??
    matches.find((m) => m.path === "error");
  return ingress ? { executionId: ingress.executionId, status: ingress.status } : undefined;
}

/** Query n8n for Marketing Pipeline runs in a time window and link the ingress execution for a task. */
export async function linkN8nExecutionsForTask(
  client: N8nClient,
  taskId: string,
  windowStartMs: number
): Promise<N8nExecutionLinkResult> {
  const empty: N8nExecutionLinkResult = {
    n8n_execution_id: "",
    n8n_execution_success: false,
    filtered_execution_count: 0,
  };

  const workflows = await client.listWorkflows();
  const mainWorkflow = workflows.find((wf) => wf.name.toLowerCase() === MARKETING_PIPELINE_WORKFLOW_NAME);
  if (!mainWorkflow?.id) {
    return empty;
  }

  const listed = await client.listExecutions({ workflowId: mainWorkflow.id, limit: 50 });
  const inWindow = listed.filter((exec) => {
    const started = executionStartedAtMs(exec);
    return started !== null && started >= windowStartMs;
  });

  const matches: Array<{
    executionId: string;
    status: string;
    path: ReturnType<typeof summarizeExecution>["path"];
    transition: string;
  }> = [];

  for (const exec of inWindow) {
    const full = await client.getExecution(String(exec.id), true);
    const summary = summarizeExecution(full);
    if (summary.task_id !== taskId) {
      continue;
    }
    matches.push({
      executionId: summary.execution_id,
      status: String(full.status ?? "").toLowerCase(),
      path: summary.path,
      transition: summary.transition,
    });
  }

  const filteredExecutionCount = matches.filter((m) => m.path === "filtered").length;
  const ingress = pickIngressExecution(matches);
  if (!ingress) {
    return { ...empty, filtered_execution_count: filteredExecutionCount };
  }

  return {
    n8n_execution_id: ingress.executionId,
    n8n_execution_success: ingress.status === "success",
    filtered_execution_count: filteredExecutionCount,
  };
}

async function resolveN8nExecutionLink(
  taskId: string,
  windowStartMs: number,
  env: NodeJS.ProcessEnv,
  n8nClient?: N8nClient
): Promise<N8nExecutionLinkResult> {
  const manualId = (env.GREEN_RUN_N8N_EXECUTION_ID ?? "").trim();
  const fallback: N8nExecutionLinkResult = {
    n8n_execution_id: manualId,
    n8n_execution_success: false,
    filtered_execution_count: 0,
  };

  const apiKey = (env.N8N_API_KEY ?? "").trim();
  if (!n8nClient && !apiKey) {
    return fallback;
  }

  try {
    const client = n8nClient ?? n8nClientFromEnv(env);
    const linked = await linkN8nExecutionsForTask(client, taskId, windowStartMs);
    if (linked.n8n_execution_id) {
      return linked;
    }
    return { ...linked, n8n_execution_id: manualId };
  } catch {
    return fallback;
  }
}

/** Run the happy-path green run (create task, move through statuses, watch for the draft comment). */
export async function executeGreenRun(
  clickupToken: string,
  mapping: FieldMapping,
  options: ExecuteGreenRunOptions = {}
): Promise<MainWorkflowResult> {
  const env = options.env ?? process.env;
  const clientOptions: ClickUpClientOptions = { token: clickupToken, ...options.clientOptions };
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const deadlineMs = options.deadlineMs ?? 120_000;

  const listId = String(mapping.clickup_list_id);
  const criteriosId = mapping.custom_fields.criterios_de_aceite?.clickup_field_id;
  const agentIdField = mapping.custom_fields.agent_id;
  const agentIdFieldId = agentIdField?.clickup_field_id;
  const readyStatus = automationStatusDisplayName(mapping, "ready");
  const writingStatus = automationStatusDisplayName(mapping, "writing");
  const reviewStatus = automationStatusDisplayName(mapping, "review");
  if (!criteriosId || !agentIdFieldId || !readyStatus || !writingStatus || !reviewStatus) {
    throw new Error("field-mapping.json is missing expected custom field/status keys for execute path");
  }

  const task = await clickupPost<{ id: string; url?: string }>(
    `/list/${listId}/task`,
    {
      name: DEFAULT_TEST_BRIEF.name,
      description: DEFAULT_TEST_BRIEF.description,
      status: mapping.statuses.backlog ?? "Backlog",
    },
    clientOptions
  );
  const taskId = task.id;
  const taskUrl = task.url ?? `https://app.clickup.com/t/${taskId}`;

  try {
    await clickupPost(`/task/${taskId}/field/${criteriosId}`, { value: DEFAULT_TEST_BRIEF.criterios_de_aceite }, clientOptions);
    await clickupPost(
      `/task/${taskId}/field/${agentIdFieldId}`,
      { value: agentIdField?.default ?? "investigative-brief" },
      clientOptions
    );

    const briefComplete = Boolean(
      DEFAULT_TEST_BRIEF.name && DEFAULT_TEST_BRIEF.description && DEFAULT_TEST_BRIEF.criterios_de_aceite
    );

    const t0 = Date.now();
    await clickupPut(`/task/${taskId}`, { status: readyStatus }, clientOptions);

    let inProgressAt: number | null = null;
    let commentAt: number | null = null;
    let reviewAt: number | null = null;
    let commentText = "";
    const deadline = t0 + deadlineMs;

    while (Date.now() < deadline) {
      const taskNow = await clickupGet<{ status?: { status?: string } }>(`/task/${taskId}`, clientOptions);
      const status = taskNow.status?.status ?? "";
      const now = Date.now();
      if (status === writingStatus && inProgressAt === null) {
        inProgressAt = now;
      }

      const commentsResp = await clickupGet<{ comments?: Array<{ comment_text?: string; text_content?: string }> }>(
        `/task/${taskId}/comment`,
        clientOptions
      );
      for (const comment of commentsResp.comments ?? []) {
        const text = comment.comment_text ?? comment.text_content ?? "";
        if (commentHasSections(text)) {
          commentText = text;
          commentAt = now;
          break;
        }
      }

      if (status === reviewStatus) {
        reviewAt = now;
        break;
      }
      await sleep(pollIntervalMs);
    }

    const latencySeconds = round1(((commentAt ?? Date.now()) - t0) / 1000);
    const ipLatencySeconds = inProgressAt !== null ? round1((inProgressAt - t0) / 1000) : null;
    const commentLatencySeconds = commentAt !== null ? round1((commentAt - (inProgressAt ?? t0)) / 1000) : null;
    const sectionsVerified = commentHasSections(commentText);
    const n8nLink = await resolveN8nExecutionLink(
      taskId,
      options.n8nLinkWindowStartMs ?? t0,
      env,
      options.n8nClient
    );

    return {
      verified: true,
      clickup_task_id: taskId,
      clickup_task_url: taskUrl,
      clickup_task_name: DEFAULT_TEST_BRIEF.name,
      status_path: [readyStatus, writingStatus, reviewStatus],
      latency_seconds: latencySeconds,
      latency_breakdown: {
        webhook_to_in_progress_seconds: ipLatencySeconds,
        in_progress_to_comment_seconds: commentLatencySeconds,
      },
      comment_sections_verified: sectionsVerified ? [...COMMENT_SECTIONS] : [],
      marketing_lead_usability: options.marketingLeadUsability ?? "pending review",
      silent_failures: reviewAt !== null && sectionsVerified ? 0 : 1,
      n8n_execution_id: n8nLink.n8n_execution_id,
      n8n_execution_success: n8nLink.n8n_execution_success,
      filtered_execution_count: n8nLink.filtered_execution_count,
      n8n_host: (env.N8N_API_URL ?? N8N_API_URL_DEFAULT).replace(/^https:\/\//, ""),
      brief_complete: briefComplete,
      in_progress_within_5s: ipLatencySeconds !== null && ipLatencySeconds <= 5,
      latency_under_60s: latencySeconds <= 60,
      final_status_review: reviewAt !== null,
    };
  } finally {
    const keep = ["1", "true", "yes"].includes((env.GREEN_RUN_KEEP_TASK ?? "").toLowerCase());
    if (!keep) {
      try {
        await clickupDelete(`/task/${taskId}`, clientOptions);
      } catch {
        // best-effort cleanup — surfacing the original result matters more than a failed delete
      }
    }
  }
}

export interface RevisionGreenRunResult {
  verified: boolean;
  clickup_task_id?: string;
  clickup_task_url?: string;
  first_draft_latency_seconds?: number | null;
  revision_status_path?: string[];
  revision_in_progress_within_5s?: boolean;
  revision_latency_seconds?: number | null;
  revision_latency_under_60s?: boolean;
  revision_draft_posted?: boolean;
  revision_comment_sections_verified?: string[];
  final_status_approval?: boolean;
}

/**
 * Run the full Phase 2 revision-round green run: first draft (M1 happy path), lead feedback
 * comment, Needs Review trigger, and the resulting revised draft back in Approval.
 * Reuses `executeGreenRun` for the first-draft phase per PRD happy path.
 */
export async function executeRevisionGreenRun(
  clickupToken: string,
  mapping: FieldMapping,
  options: ExecuteGreenRunOptions = {}
): Promise<RevisionGreenRunResult> {
  const env = options.env ?? process.env;
  const clientOptions: ClickUpClientOptions = { token: clickupToken, ...options.clientOptions };
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const deadlineMs = options.deadlineMs ?? 120_000;

  const needsReviewStatus = automationStatusDisplayName(mapping, "needs_review");
  const writingStatus = automationStatusDisplayName(mapping, "writing");
  const reviewStatus = automationStatusDisplayName(mapping, "review");
  if (!needsReviewStatus || !writingStatus || !reviewStatus) {
    throw new Error("field-mapping.json is missing expected status keys for revision execute path");
  }

  const firstDraft = await executeGreenRun(clickupToken, mapping, {
    ...options,
    env: { ...env, GREEN_RUN_KEEP_TASK: "1" },
  });

  const taskId = firstDraft.clickup_task_id;
  const keep = ["1", "true", "yes"].includes((env.GREEN_RUN_KEEP_TASK ?? "").toLowerCase());
  const firstDraftSucceeded =
    Boolean(taskId) && firstDraft.final_status_review === true && (firstDraft.comment_sections_verified?.length ?? 0) > 0;
  if (!taskId || !firstDraftSucceeded) {
    if (taskId && !keep) {
      try {
        await clickupDelete(`/task/${taskId}`, clientOptions);
      } catch {
        // best-effort cleanup — surfacing the original result matters more than a failed delete
      }
    }
    return {
      verified: false,
      clickup_task_id: taskId,
      clickup_task_url: firstDraft.clickup_task_url,
      first_draft_latency_seconds: firstDraft.latency_seconds,
    };
  }

  try {
    await clickupPost(`/task/${taskId}/comment`, { comment_text: LEAD_FEEDBACK_COMMENT }, clientOptions);

    const t1 = Date.now();
    await clickupPut(`/task/${taskId}`, { status: needsReviewStatus }, clientOptions);

    let writingAt: number | null = null;
    let revisedCommentAt: number | null = null;
    let approvalAt: number | null = null;
    const deadline = t1 + deadlineMs;

    while (Date.now() < deadline) {
      const taskNow = await clickupGet<{ status?: { status?: string } }>(`/task/${taskId}`, clientOptions);
      const status = taskNow.status?.status ?? "";
      const now = Date.now();
      if (status === writingStatus && writingAt === null) {
        writingAt = now;
      }

      const commentsResp = await clickupGet<{ comments?: Array<{ comment_text?: string; text_content?: string }> }>(
        `/task/${taskId}/comment`,
        clientOptions
      );
      const draftComments = (commentsResp.comments ?? []).filter((c) => commentHasSections(c.comment_text ?? c.text_content ?? ""));
      if (draftComments.length >= 2 && revisedCommentAt === null) {
        revisedCommentAt = now;
      }

      if (status === reviewStatus && revisedCommentAt !== null) {
        approvalAt = now;
        break;
      }
      await sleep(pollIntervalMs);
    }

    const revisionLatencySeconds = round1(((revisedCommentAt ?? Date.now()) - t1) / 1000);
    const writingLatencySeconds = writingAt !== null ? round1((writingAt - t1) / 1000) : null;

    return {
      verified: approvalAt !== null && revisedCommentAt !== null,
      clickup_task_id: taskId,
      clickup_task_url: firstDraft.clickup_task_url,
      first_draft_latency_seconds: firstDraft.latency_seconds,
      revision_status_path: [needsReviewStatus, writingStatus, reviewStatus],
      revision_in_progress_within_5s: writingLatencySeconds !== null && writingLatencySeconds <= 5,
      revision_latency_seconds: revisionLatencySeconds,
      revision_latency_under_60s: revisionLatencySeconds <= 60,
      revision_draft_posted: revisedCommentAt !== null,
      revision_comment_sections_verified: revisedCommentAt !== null ? [...COMMENT_SECTIONS] : [],
      final_status_approval: approvalAt !== null,
    };
  } finally {
    if (!keep) {
      try {
        await clickupDelete(`/task/${taskId}`, clientOptions);
      } catch {
        // best-effort cleanup — surfacing the original result matters more than a failed delete
      }
    }
  }
}

export interface EvidenceJson {
  recorded_at: string;
  session: string;
  validation_status: "blocked" | "ready" | "passed";
  preflight: { checklist: ChecklistEntry[]; coverage_percent: number; blockers: string[] };
  main_workflow: MainWorkflowResult;
  call_agent_subworkflow: Record<string, unknown>;
  failure_observations: Record<string, string>;
  revision_round?: RevisionGreenRunResult;
}

export interface BuildEvidenceOptions {
  revisionRound?: RevisionGreenRunResult;
}

/** Assemble the full evidence JSON document from a preflight report and optional execute-path result. */
export function buildEvidence(
  preflight: PreflightReport,
  mainWorkflow?: MainWorkflowResult,
  env: NodeJS.ProcessEnv = process.env,
  extra: BuildEvidenceOptions = {}
): EvidenceJson {
  const infraReady = preflight.coveragePercent >= 80 && preflight.blockers.length === 0;
  const validationStatus: EvidenceJson["validation_status"] = mainWorkflow?.verified
    ? "passed"
    : infraReady
      ? "ready"
      : "blocked";

  const dict = preflight.toDict();
  const checklist = [...dict.checklist];
  if (validationStatus !== "passed") {
    for (const step of RUNTIME_STEPS) {
      checklist.push({
        step,
        status: "skip",
        detail: `Runtime step — execute after preflight passes (move task to ${automationStatusDisplayName(loadFieldMapping(), "ready") || "ready"})`,
      });
    }
  }

  return {
    recorded_at: new Date().toISOString().slice(0, 10),
    session: "m1-green-run-validation",
    validation_status: validationStatus,
    preflight: { checklist, coverage_percent: dict.coverage_percent, blockers: dict.blockers },
    main_workflow:
      mainWorkflow ?? {
        verified: false,
        n8n_execution_id: "",
        n8n_host: (env.N8N_API_URL ?? N8N_API_URL_DEFAULT).replace(/^https:\/\//, ""),
        clickup_task_id: "",
        clickup_task_url: "",
        clickup_task_name: DEFAULT_TEST_BRIEF.name,
        status_path: automationStatusDisplayNames(loadFieldMapping()),
        latency_seconds: null,
        latency_breakdown: {},
        comment_sections_verified: [],
        marketing_lead_usability: "pending — run green run after operator setup",
        silent_failures: null,
      },
    call_agent_subworkflow: {
      n8n_execution_id: "",
      latency_ms: null,
      parse_success: null,
      agent_id: "investigative-brief",
      model: "gpt-4.1-mini",
    },
    failure_observations: {
      missing_criterios_de_aceite: "Workflow still runs; draft autochecagem may be weak — brief gate is manual only in M1",
      duplicate_webhook: "Second delivery may post duplicate comment per ADR-001; no dedup in M1",
    },
    ...(extra.revisionRound ? { revision_round: extra.revisionRound } : {}),
  };
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Create a fresh `logs/green-run/<timestamp>/` directory for this run, disambiguating same-second collisions. */
export function runLogDir(now: Date = new Date()): string {
  const stamp = formatTimestamp(now);
  let path = resolve(RUN_LOG_ROOT, stamp);
  let suffix = 1;
  while (existsSync(path)) {
    path = resolve(RUN_LOG_ROOT, `${stamp}-${suffix}`);
    suffix += 1;
  }
  mkdirSync(path, { recursive: true });
  return path;
}

export function writeEvidence(evidence: EvidenceJson, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf-8");
}

/** Write evidence to `logs/green-run/<timestamp>/evidence.json` (gitignored) and return the path. */
export function writeRunEvidence(evidence: EvidenceJson, now: Date = new Date()): string {
  const out = resolve(runLogDir(now), "evidence.json");
  writeEvidence(evidence, out);
  return out;
}

export function shouldUpdateCanonical(env: NodeJS.ProcessEnv = process.env): boolean {
  return ["1", "true", "yes"].includes((env.GREEN_RUN_UPDATE_CANONICAL ?? "").toLowerCase());
}

function readySkippedRuntimePhases(): string[] {
  return RUNTIME_STEPS;
}

function printReadyUnverifiedOutput(): void {
  console.error("\nReady but unverified:");
  console.error(`  Skipped runtime phases: ${readySkippedRuntimePhases().join(", ")}`);
  console.error("  Run GREEN_RUN_EXECUTE=1 pnpm green-run to execute the live path.");
}

/** CLI entrypoint logic: loads `.env`, runs preflight (+ optional execute), writes evidence, returns the exit code. */
export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  loadRepoDotenv(undefined, env);
  const clickupToken = (env.CLICKUP_API_TOKEN ?? env.CLICKUP_TOKEN ?? "").trim();
  const clickupListId = (env.CLICKUP_LIST_ID ?? "").trim();
  const n8nApiUrl = (env.N8N_API_URL ?? N8N_API_URL_DEFAULT).trim();
  const n8nApiKey = (env.N8N_API_KEY ?? "").trim();

  if (!clickupToken) {
    const blockedPreflight = new PreflightReport();
    blockedPreflight.results.push({ step: "clickup_token_configured", passed: false, detail: "CLICKUP_API_TOKEN unset" });
    const blocked = buildEvidence(blockedPreflight, undefined, env);
    const out = writeRunEvidence(blocked);
    console.log(`Wrote ${out}`);
    console.error("Set CLICKUP_API_TOKEN");
    return 2;
  }

  // Route through the vendor gate before performing live ClickUp and n8n operations
  const gateResult = await runGate(env);
  if (gateResult.exitCode !== 0) {
    console.error("Vendor gate failed — cannot proceed with green run");
    for (const check of gateResult.checks.filter((c) => !c.passed)) {
      console.error(`  - ${check.name}: ${check.detail}`);
    }
    const blockedPreflight = new PreflightReport();
    blockedPreflight.results.push({ step: "vendor_gate", passed: false, detail: "Vendor gate check failed" });
    const blocked = buildEvidence(blockedPreflight, undefined, env);
    const out = writeRunEvidence(blocked);
    console.log(`Wrote ${out}`);
    return gateResult.exitCode;
  }

  const preflight = await runPreflight({ clickupToken, clickupListId, n8nApiUrl, n8nApiKey });

  console.log(`Preflight coverage: ${preflight.coveragePercent}%`);
  for (const result of preflight.results) {
    console.log(`  [${result.passed ? "PASS" : "FAIL"}] ${result.step}: ${result.detail}`);
  }

  let mainResult: MainWorkflowResult | undefined;
  const execute = ["1", "true", "yes"].includes((env.GREEN_RUN_EXECUTE ?? "").toLowerCase());
  if (execute && preflight.blockers.length === 0) {
    const mapping = loadFieldMapping();
    console.log("\nExecuting green run...");
    mainResult = await executeGreenRun(clickupToken, mapping, { env });
    console.log(`  Task: ${mainResult.clickup_task_url}`);
    console.log(`  Latency: ${mainResult.latency_seconds}s`);
  }

  const evidence = buildEvidence(preflight, mainResult, env);
  const out = writeRunEvidence(evidence);
  console.log(`\nWrote ${out}`);
  if (shouldUpdateCanonical(env)) {
    writeEvidence(evidence, EVIDENCE_PATH);
    console.log(`Updated canonical ${EVIDENCE_PATH}`);
  }
  console.log(`Validation status: ${evidence.validation_status}`);

  if (evidence.validation_status === "blocked") {
    console.error("\nBlockers:");
    for (const blocker of preflight.blockers) {
      console.error(`  - ${blocker}`);
    }
    return 2;
  }
  if (evidence.validation_status === "ready") {
    printReadyUnverifiedOutput();
    return 3;
  }
  return 0;
}
