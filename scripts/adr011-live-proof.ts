import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { clickupGet, clickupPost, clickupPut, type ClickUpClientOptions } from "../src/clickup/client.js";
import { loadRepoDotenv, REPO_ROOT } from "../src/load-env.js";
import { extractTaskFields, loadFieldMapping } from "../src/marketing-pipeline/logic.js";
import { createN8nClient, summarizeExecution, type N8nExecution } from "../src/n8n/client.js";

const V2_BASE = "https://api.clickup.com/api/v2";
const V3_BASE = "https://api.clickup.com";
const LOG_DIR = resolve(REPO_ROOT, "logs", "content-quality-proof");
const POLL_INTERVAL_MS = 5_000;
const STAGE_TIMEOUT_MS = 180_000;

type Stage = "investigate" | "write" | "format";

interface StageProof {
  stage: Stage;
  target_status: string;
  expected_status: string;
  started_at: string;
  completed_at?: string;
  latency_ms?: number;
  task_status?: string;
  doc_pointer?: string;
  doc_id?: string;
  execution_id?: string;
  execution_status?: string;
  page_name: string;
  page_id?: string;
  page_content_chars?: number;
  page_content_preview?: string;
  non_placeholder?: boolean;
}

interface EvidenceRow {
  id: string;
  status: "pass" | "fail" | "observe";
  observed: string;
}

interface ClickUpTask {
  id?: string;
  url?: string;
  team_id?: string;
  status?: { status?: string };
  custom_fields?: Array<{ id?: string; value?: unknown }>;
  [key: string]: unknown;
}

interface DocPage {
  id?: string;
  name?: string;
  title?: string;
  content?: string;
  pages?: DocPage[];
  children?: DocPage[];
}

const STAGES: Array<{ stage: Stage; target: string; expected: string; page: string; feedback?: string }> = [
  {
    stage: "investigate",
    target: "investigate",
    expected: "brief review",
    page: "Brief",
  },
  {
    stage: "write",
    target: "write",
    expected: "content review",
    page: "Argument",
    feedback:
      "Approved angle for proof: emphasize that staged review makes workflow failures visible before final formatting.",
  },
  {
    stage: "format",
    target: "format",
    expected: "final review",
    page: "Final Draft",
    feedback:
      "Approved argument for proof: adapt into a Wolven LinkedIn post and keep only claims supported by this task.",
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function v3Request<T>(method: "GET", path: string, token: string): Promise<T> {
  const res = await fetch(`${V3_BASE}${path}`, {
    method,
    headers: {
      Authorization: token,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ClickUp v3 ${method} ${path} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

function flattenPages(value: unknown): DocPage[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenPages);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const page = value as DocPage & Record<string, unknown>;
  const nested = [...flattenPages(page.pages), ...flattenPages(page.children)];
  if (page.id || page.name || page.title) {
    return [page, ...nested];
  }
  return [...flattenPages(page.data), ...nested];
}

function pageName(page: DocPage): string {
  return String(page.name ?? page.title ?? "").trim();
}

async function fetchDocPages(workspaceId: string, docId: string, token: string): Promise<DocPage[]> {
  const list = await v3Request<unknown>("GET", `/api/v3/workspaces/${workspaceId}/docs/${docId}/pages`, token);
  return flattenPages(list);
}

async function fetchPageContent(workspaceId: string, docId: string, pageId: string, token: string): Promise<string> {
  const page = await v3Request<DocPage>(
    "GET",
    `/api/v3/workspaces/${workspaceId}/docs/${docId}/pages/${pageId}?content_format=text/md`,
    token
  );
  return String(page.content ?? "");
}

function extractDocId(pointer: string): string {
  const trimmed = pointer.trim();
  const dcMatch = trimmed.match(/\/dc\/([^/?#]+)/);
  if (dcMatch?.[1]) {
    return dcMatch[1];
  }
  const docMatch = trimmed.match(/\/docs\/([^/?#]+)/);
  if (docMatch?.[1]) {
    return docMatch[1];
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

function nonPlaceholderContent(pageNameValue: string, content: string): boolean {
  const normalized = content.replace(/\s+/g, " ").trim();
  const titleOnly = [`# ${pageNameValue}`, pageNameValue].includes(normalized);
  return normalized.length >= 80 && !titleOnly;
}

async function waitForTaskStatus(
  taskId: string,
  expectedStatus: string,
  client: ClickUpClientOptions
): Promise<ClickUpTask> {
  const deadline = Date.now() + STAGE_TIMEOUT_MS;
  let latest: ClickUpTask | undefined;
  while (Date.now() < deadline) {
    latest = await clickupGet<ClickUpTask>(`/task/${taskId}`, client);
    const status = String(latest.status?.status ?? "").trim().toLowerCase();
    if (status === expectedStatus) {
      return latest;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Timed out waiting for task ${taskId} to reach '${expectedStatus}'. Last status: ${latest?.status?.status ?? "unknown"}`
  );
}

function executionTaskId(execution: N8nExecution): string {
  const runData = execution.data?.resultData?.runData ?? {};
  const webhookJson = runData["ClickUp Webhook"]?.[0]?.data?.main?.[0]?.[0]?.json;
  if (!webhookJson || typeof webhookJson !== "object") {
    return "";
  }
  const body = (webhookJson as { body?: Record<string, unknown>; task_id?: unknown }).body;
  return String(body?.task_id ?? (webhookJson as { task_id?: unknown }).task_id ?? "");
}

async function findRecentExecution(taskId: string, stageStartedAtMs: number): Promise<N8nExecution | undefined> {
  const n8n = createN8nClient({
    apiUrl: process.env.N8N_API_URL ?? "https://n8n.wolven.com.br",
    apiKey: process.env.N8N_API_KEY ?? "",
  });
  const workflows = await n8n.listWorkflows(100);
  const marketing = workflows.find((workflow) => workflow.name === "Marketing Pipeline");
  if (!marketing) {
    return undefined;
  }
  const listed = await n8n.listExecutions({ workflowId: marketing.id, limit: 25 });
  for (const item of listed) {
    const started = item.startedAt ? Date.parse(item.startedAt) : 0;
    if (started + 5_000 < stageStartedAtMs) {
      continue;
    }
    const full = await n8n.getExecution(item.id, true);
    if (executionTaskId(full) === taskId) {
      return full;
    }
  }
  return undefined;
}

function addEvidence(rows: EvidenceRow[], id: string, status: EvidenceRow["status"], observed: string): void {
  rows.push({ id, status, observed });
}

async function main(): Promise<void> {
  loadRepoDotenv();
  const token = (process.env.CLICKUP_API_TOKEN ?? process.env.CLICKUP_TOKEN ?? "").trim();
  if (!token) {
    throw new Error("CLICKUP_API_TOKEN or CLICKUP_TOKEN is required");
  }
  if (!(process.env.N8N_API_KEY ?? "").trim()) {
    throw new Error("N8N_API_KEY is required");
  }

  const mapping = loadFieldMapping();
  const listId = String(mapping.clickup_list_id || process.env.CLICKUP_LIST_ID || "").trim();
  if (!listId) {
    throw new Error("CLICKUP_LIST_ID or clickup/field-mapping.json clickup_list_id is required");
  }

  const criteriosFieldId = String(mapping.custom_fields.criterios_de_aceite?.clickup_field_id ?? "");
  const agentFieldId = String(mapping.custom_fields.agent_id?.clickup_field_id ?? "");
  const client: ClickUpClientOptions = { token, baseUrl: V2_BASE, timeoutMs: 45_000 };
  const evidence: EvidenceRow[] = [];
  const stageProofs: StageProof[] = [];

  const task = await clickupPost<ClickUpTask>(
    `/list/${listId}/task`,
    {
      name: `[CQ-PROOF][ADR-011] one-doc live proof ${nowIso()}`,
      markdown_content: [
        "Live ADR-011 proof task for the staged content-quality pipeline.",
        "",
        "Topic: how staged editorial workflows make AI-assisted marketing more reliable.",
        "",
        "Supplied evidence:",
        "- A single ClickUp task is the control surface.",
        "- One Editorial Doc Url should point to the artifact workspace.",
        "- Investigate, Write, and Format must update Brief, Argument, and Final Draft pages in that one Doc.",
        "- The proof should not invent external facts or use autonomous web research.",
      ].join("\n"),
      status: "backlog",
      custom_fields: [
        {
          id: criteriosFieldId,
          value:
            "Produce real non-placeholder artifacts for Brief, Argument, and Final Draft. Reuse one Editorial Doc Url across all stages. Keep claims tied to supplied task evidence.",
        },
        {
          id: agentFieldId,
          value: "linkedin-writer",
        },
      ],
    },
    client
  );

  const taskId = String(task.id ?? "");
  const workspaceId = String(task.team_id ?? "");
  if (!taskId || !workspaceId) {
    throw new Error(`Created proof task missing id/team_id: ${JSON.stringify(task)}`);
  }
  addEvidence(evidence, "TASK", "pass", `task_id=${taskId}; url=${task.url ?? ""}; workspace_id=${workspaceId}`);

  let expectedDocId = "";
  let latestTask: ClickUpTask = task;

  for (const stage of STAGES) {
    if (stage.feedback) {
      await clickupPost(
        `/task/${taskId}/comment`,
        { comment_text: stage.feedback, notify_all: false },
        client
      );
    }

    const startedAtMs = Date.now();
    const startedAt = nowIso();
    await clickupPut(`/task/${taskId}`, { status: stage.target }, client);
    latestTask = await waitForTaskStatus(taskId, stage.expected, client);
    const completedAt = nowIso();
    const fields = extractTaskFields(latestTask, mapping);
    const docPointer = fields.editorial_doc_url;
    const docId = extractDocId(docPointer);
    if (!docPointer || !docId) {
      throw new Error(`${stage.stage} completed without Editorial Doc Url`);
    }
    if (!expectedDocId) {
      expectedDocId = docId;
    }

    const pages = await fetchDocPages(workspaceId, docId, token);
    const page = pages.find((candidate) => pageName(candidate).toLowerCase() === stage.page.toLowerCase());
    if (!page?.id) {
      throw new Error(`${stage.stage} did not create/find '${stage.page}' page in doc ${docId}`);
    }
    const content = await fetchPageContent(workspaceId, docId, String(page.id), token);
    const execution = await findRecentExecution(taskId, startedAtMs);
    const summary = execution ? summarizeExecution(execution) : undefined;

    const proof: StageProof = {
      stage: stage.stage,
      target_status: stage.target,
      expected_status: stage.expected,
      started_at: startedAt,
      completed_at: completedAt,
      latency_ms: Date.parse(completedAt) - startedAtMs,
      task_status: latestTask.status?.status,
      doc_pointer: docPointer,
      doc_id: docId,
      execution_id: execution?.id,
      execution_status: execution?.status,
      page_name: stage.page,
      page_id: String(page.id),
      page_content_chars: content.length,
      page_content_preview: content.slice(0, 500),
      non_placeholder: nonPlaceholderContent(stage.page, content),
    };
    stageProofs.push(proof);

    addEvidence(
      evidence,
      stage.stage.toUpperCase(),
      proof.doc_id === expectedDocId && proof.non_placeholder ? "pass" : "fail",
      `status=${proof.task_status}; doc_id=${proof.doc_id}; page=${proof.page_name}; chars=${proof.page_content_chars}; execution=${proof.execution_id ?? "not_found"}; path=${summary?.path ?? "unknown"}`
    );
  }

  const docIds = new Set(stageProofs.map((proof) => proof.doc_id));
  addEvidence(
    evidence,
    "ONE-DOC",
    docIds.size === 1 ? "pass" : "fail",
    `doc_ids=${JSON.stringify([...docIds])}`
  );
  addEvidence(
    evidence,
    "PAGES",
    stageProofs.every((proof) => proof.non_placeholder) ? "pass" : "fail",
    stageProofs
      .map((proof) => `${proof.page_name}: chars=${proof.page_content_chars}; non_placeholder=${proof.non_placeholder}`)
      .join("; ")
  );

  const failed = evidence.filter((row) => row.status === "fail");
  mkdirSync(LOG_DIR, { recursive: true });
  const outputPath = resolve(LOG_DIR, `task_38_adr011_live_proof_${nowIso().replace(/[:.]/g, "-")}.json`);
  const output = {
    generated_at: nowIso(),
    task_id: taskId,
    task_url: task.url ?? "",
    workspace_id: workspaceId,
    final_task_status: latestTask.status?.status,
    doc_id: expectedDocId,
    stage_proofs: stageProofs,
    evidence,
    verdict: failed.length === 0 ? "pass" : "fail",
  };
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(outputPath);
  console.log(JSON.stringify(output, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
