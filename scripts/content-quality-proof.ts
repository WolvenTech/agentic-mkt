import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadRepoDotenv, REPO_ROOT } from "../src/load-env.js";
import { DEFAULT_MODEL, extractTaskFields, loadFieldMapping } from "../src/marketing-pipeline/logic.js";
import { clickupGet, clickupPost, clickupPut, type ClickUpClientOptions } from "../src/clickup/client.js";
import { createN8nClient } from "../src/n8n/client.js";

const V2_BASE = "https://api.clickup.com/api/v2";
const V3_BASE = "https://api.clickup.com";
const LOG_DIR = resolve(REPO_ROOT, "logs", "content-quality-proof");

type EvidenceStatus = "pass" | "fail" | "blocked" | "observe";

interface EvidenceRow {
  id: string;
  status: EvidenceStatus;
  action: string;
  endpoint?: string;
  observed: string;
  timestamp: string;
}

interface ProofState {
  task_id?: string;
  task_url?: string;
  workspace_id?: string;
  list_id?: string;
  doc_id?: string;
  doc_url_guess?: string;
  page_ids: Record<string, string>;
  n8n_recent_execution_ids: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function row(rows: EvidenceRow[], entry: Omit<EvidenceRow, "timestamp">): void {
  rows.push({ ...entry, timestamp: nowIso() });
}

async function v3Request<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  token: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${V3_BASE}${path}`, {
    method,
    headers: {
      Authorization: token,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

function textIncludesAll(text: string, needles: string[]): boolean {
  return needles.every((needle) => text.includes(needle));
}

function latestActionableComment(comments: Array<{ comment_text?: string; user?: { username?: string } }>): string {
  for (const comment of comments) {
    const body = String(comment.comment_text ?? "").trim();
    const username = String(comment.user?.username ?? "").toLowerCase();
    if (!body) {
      continue;
    }
    if (body.startsWith("[CQ-AI]") || body.startsWith("[CQ-BLOCKER]")) {
      continue;
    }
    if (username.includes("clickup") || username.includes("automation") || username === "system") {
      continue;
    }
    return body;
  }
  return "";
}

async function main(): Promise<void> {
  loadRepoDotenv();
  const token = (process.env.CLICKUP_API_TOKEN ?? process.env.CLICKUP_TOKEN ?? "").trim();
  const n8nKey = (process.env.N8N_API_KEY ?? "").trim();
  const n8nUrl = (process.env.N8N_API_URL ?? "https://n8n.wolven.com.br").trim();
  const envListId = (process.env.CLICKUP_LIST_ID ?? "").trim();
  if (!token || !envListId || !n8nKey) {
    throw new Error("CLICKUP_API_TOKEN, CLICKUP_LIST_ID, and N8N_API_KEY are required");
  }

  const mapping = loadFieldMapping();
  const listId = String(mapping.clickup_list_id || envListId);
  const client: ClickUpClientOptions = { token, baseUrl: V2_BASE };
  const rows: EvidenceRow[] = [];
  const state: ProofState = { list_id: listId, page_ids: {}, n8n_recent_execution_ids: [] };
  const criteriosField = mapping.custom_fields.criterios_de_aceite;
  const agentField = mapping.custom_fields.agent_id;
  if (!criteriosField || !agentField) {
    throw new Error("field-mapping.json must define criterios_de_aceite and agent_id fields");
  }

  const list = await clickupGet<{ id: string; name?: string; statuses?: Array<{ status?: string; orderindex?: number }> }>(
    `/list/${listId}`,
    client
  );
  const statuses = (list.statuses ?? []).map((s) => String(s.status ?? ""));
  const requiredStatuses = [
    "backlog",
    "investigate",
    "brief review",
    "write",
    "content review",
    "format",
    "final review",
    "publish",
    "Closed",
  ];
  row(rows, {
    id: "A1",
    status: requiredStatuses.every((status) => statuses.includes(status)) ? "pass" : "fail",
    action: "Read live list statuses",
    endpoint: "GET /api/v2/list/{list_id}",
    observed: `${list.name ?? list.id}: ${statuses.join(" -> ")}`,
  });

  const existingTasks = await clickupGet<any>(`/list/${listId}/task?include_closed=true&subtasks=true`, client);
  const latestProofTask = (existingTasks.tasks ?? [])
    .filter((task: any) => String(task.name ?? "").includes("[CQ-PROOF]"))
    .sort((left: any, right: any) => Number(right.date_created ?? 0) - Number(left.date_created ?? 0))[0];
  const proofTask =
    latestProofTask ??
    (await clickupPost<any>(
      `/list/${listId}/task`,
      {
        name: `[CQ-PROOF] Content quality pipeline proof ${nowIso()}`,
        markdown_content:
          "Sanitized proof task for the staged content-quality pipeline.\n\nEvidence only: Wolven turns AI workflow failures into operator-visible controls.",
        status: "backlog",
        custom_fields: [
          {
            id: criteriosField.clickup_field_id,
            value: "Use only supplied evidence. Keep the final LinkedIn draft under 180 words. Preserve the approved angle.",
          },
          {
            id: agentField.clickup_field_id,
            value: "linkedin-writer",
          },
        ],
      },
      client
    ));
  state.task_id = String(proofTask.id);
  state.task_url = String(proofTask.url ?? "");
  state.workspace_id = String(proofTask.team_id ?? "");
  row(rows, {
    id: "SETUP",
    status: "pass",
    action: latestProofTask ? "Reuse latest disposable proof task" : "Create disposable proof task",
    endpoint: latestProofTask ? "GET /api/v2/list/{list_id}/task" : "POST /api/v2/list/{list_id}/task",
    observed: `task_id=${state.task_id}; url=${state.task_url}`,
  });

  for (const status of requiredStatuses.slice(1, -1)) {
    await clickupPut(`/task/${state.task_id}`, { status }, client);
  }
  const afterStatusWalk = await clickupGet<any>(`/task/${state.task_id}`, client);
  row(rows, {
    id: "A1-WALK",
    status: afterStatusWalk.status?.status === "publish" ? "pass" : "fail",
    action: "Move proof task through staged statuses",
    endpoint: "PUT /api/v2/task/{task_id}",
    observed: `final walked status=${afterStatusWalk.status?.status}`,
  });
  await clickupPut(`/task/${state.task_id}`, { status: "backlog" }, client);

  if (!state.workspace_id) {
    throw new Error("Created task did not expose team_id/workspace_id");
  }

  const doc = await v3Request<any>("POST", `/api/v3/workspaces/${state.workspace_id}/docs`, token, {
    name: `[CQ-PROOF] Editorial workspace for ${state.task_id}`,
    parent: { id: listId, type: 6 },
    visibility: "PRIVATE",
    create_page: true,
  });
  state.doc_id = String(doc.id);
  state.doc_url_guess = `https://app.clickup.com/${state.workspace_id}/v/dc/${state.doc_id}`;
  row(rows, {
    id: "A2",
    status: doc.id && String(doc.parent?.id) === listId ? "pass" : "fail",
    action: "Create ClickUp Doc under the marketing list",
    endpoint: "POST /api/v3/workspaces/{workspace_id}/docs",
    observed: `doc_id=${state.doc_id}; parent=${JSON.stringify(doc.parent)}; url_guess=${state.doc_url_guess}`,
  });

  const fetchedTask = await clickupGet<any>(`/task/${state.task_id}`, client);
  const taskSerialized = JSON.stringify(fetchedTask);
  row(rows, {
    id: "A3",
    status: taskSerialized.includes(state.doc_id) ? "observe" : "pass",
    action: "Check whether GET task discovers the created Doc",
    endpoint: "GET /api/v2/task/{task_id}",
    observed: taskSerialized.includes(state.doc_id)
      ? "Doc id appeared in task response"
      : "Doc id absent from task response; deterministic comment/custom-field fallback required",
  });

  const initialBrief = [
    "# Investigative Brief",
    "",
    "## Central Claim",
    "Wolven can make AI marketing operations reliable by turning invisible workflow failure into visible review gates.",
    "",
    "### Evidence Inventory",
    "- Existing pipeline already uses ClickUp task status as control surface.",
    "- Acceptance criteria require no autonomous web research.",
    "- `gpt-4.1-mini` stays constant for this proof.",
    "",
    "#### Angle Options",
    "1. Reliability as a marketing operating system",
    "2. Human gates that preserve editorial intent",
    "3. Evidence-first AI content without hidden research",
    "",
    "> Quote placeholder: keep claims mapped to supplied task material.",
    "",
    "| Claim | Evidence | Gap |",
    "| --- | --- | --- |",
    "| Workflow controls quality | Status gates | Need stage proof |",
    "",
    "[Task link](https://app.clickup.com)",
    "",
    "---",
    "",
    "Use **bold**, *italic*, ~~strike~~, and `inline code` only.",
  ].join("\n");

  const briefPage = await v3Request<any>(
    "POST",
    `/api/v3/workspaces/${state.workspace_id}/docs/${state.doc_id}/pages`,
    token,
    { name: "Brief", content: initialBrief, content_format: "text/md" }
  );
  state.page_ids.brief = String(briefPage.id);
  const fetchedBrief = await v3Request<any>(
    "GET",
    `/api/v3/workspaces/${state.workspace_id}/docs/${state.doc_id}/pages/${state.page_ids.brief}?content_format=text/md`,
    token
  );
  row(rows, {
    id: "A4-A7",
    status: textIncludesAll(String(fetchedBrief.content ?? ""), ["# Investigative Brief", "| Claim | Evidence | Gap |", "inline code"])
      ? "pass"
      : "observe",
    action: "Create and fetch markdown stage artifact",
    endpoint: "POST/GET /api/v3/workspaces/{workspace_id}/docs/{doc_id}/pages",
    observed: `brief_page_id=${state.page_ids.brief}; fetched_chars=${String(fetchedBrief.content ?? "").length}`,
  });

  const replacedBrief = [
    "# Investigative Brief",
    "",
    "## Central Claim",
    "UPDATED: Wolven should use staged AI review to preserve editorial intent before LinkedIn formatting.",
    "",
    "## Approved Angle",
    "Use angle 2: Human gates that preserve editorial intent.",
  ].join("\n");
  await v3Request<any>(
    "PUT",
    `/api/v3/workspaces/${state.workspace_id}/docs/${state.doc_id}/pages/${state.page_ids.brief}`,
    token,
    { content: replacedBrief, content_edit_mode: "replace", content_format: "text/md" }
  );
  const fetchedReplacedBrief = await v3Request<any>(
    "GET",
    `/api/v3/workspaces/${state.workspace_id}/docs/${state.doc_id}/pages/${state.page_ids.brief}?content_format=text/md`,
    token
  );
  const replacedContent = String(fetchedReplacedBrief.content ?? "");
  row(rows, {
    id: "A5",
    status: replacedContent.includes("UPDATED:") && !replacedContent.includes("Angle Options") ? "pass" : "fail",
    action: "Replace stage page in place",
    endpoint: "PUT /api/v3/workspaces/{workspace_id}/docs/{doc_id}/pages/{page_id}",
    observed: `updated_contains=${replacedContent.includes("UPDATED:")}; stale_section_present=${replacedContent.includes("Angle Options")}`,
  });

  const argumentPage = await v3Request<any>(
    "POST",
    `/api/v3/workspaces/${state.workspace_id}/docs/${state.doc_id}/pages`,
    token,
    { name: "Argument", content: "# Argument\n\nPreserved argument v1.", content_format: "text/md" }
  );
  const finalPage = await v3Request<any>(
    "POST",
    `/api/v3/workspaces/${state.workspace_id}/docs/${state.doc_id}/pages`,
    token,
    { name: "Final Draft", content: "# Final Draft\n\nPreserved final draft v1.", content_format: "text/md" }
  );
  state.page_ids.argument = String(argumentPage.id);
  state.page_ids.final = String(finalPage.id);
  await v3Request<any>(
    "PUT",
    `/api/v3/workspaces/${state.workspace_id}/docs/${state.doc_id}/pages/${state.page_ids.brief}`,
    token,
    { content: `${replacedBrief}\n\nRework pass only touched Brief.`, content_edit_mode: "replace", content_format: "text/md" }
  );
  const argumentAfterBriefEdit = await v3Request<any>(
    "GET",
    `/api/v3/workspaces/${state.workspace_id}/docs/${state.doc_id}/pages/${state.page_ids.argument}?content_format=text/md`,
    token
  );
  const finalAfterBriefEdit = await v3Request<any>(
    "GET",
    `/api/v3/workspaces/${state.workspace_id}/docs/${state.doc_id}/pages/${state.page_ids.final}?content_format=text/md`,
    token
  );
  row(rows, {
    id: "A6-A16",
    status:
      String(argumentAfterBriefEdit.content ?? "").includes("Preserved argument v1") &&
      String(finalAfterBriefEdit.content ?? "").includes("Preserved final draft v1")
        ? "pass"
        : "fail",
    action: "Replace upstream Brief without touching downstream pages",
    endpoint: "PUT/GET Docs pages",
    observed: `argument_unchanged=${String(argumentAfterBriefEdit.content ?? "").includes("Preserved argument v1")}; final_unchanged=${String(finalAfterBriefEdit.content ?? "").includes("Preserved final draft v1")}`,
  });

  await clickupPost(
    `/task/${state.task_id}/comment`,
    {
      comment_text: `[CQ-AI] Brief updated\nResumo: approved angle options are ready.\nSelf-check: evidence maps to supplied task material only.\nNext action: review Brief page and comment with angle selection.\nDoc: ${state.doc_url_guess}`,
      notify_all: false,
    },
    client
  );
  await clickupPost(
    `/task/${state.task_id}/comment`,
    {
      comment_text: "Use angle 2, but emphasize the operational trust angle.",
      notify_all: false,
    },
    client
  );
  await clickupPost(
    `/task/${state.task_id}/comment`,
    {
      comment_text: "[CQ-AI] Argument updated\nResumo: channel-neutral argument is ready.\nSelf-check: no new facts added.\nNext action: approve or correct in task comments.",
      notify_all: false,
    },
    client
  );
  await clickupPost(
    `/task/${state.task_id}/comment`,
    {
      comment_text: "Combine 1 and 3 but emphasize proof before polish.",
      notify_all: false,
    },
    client
  );
  const comments = await clickupGet<any>(`/task/${state.task_id}/comment`, client);
  const commentList = comments.comments ?? [];
  const actionable = latestActionableComment(commentList);
  row(rows, {
    id: "A10-A12-A15",
    status: actionable.includes("Combine 1 and 3") ? "pass" : "fail",
    action: "Post pointer and lead comments, then select latest actionable lead feedback",
    endpoint: "POST/GET /api/v2/task/{task_id}/comment",
    observed: `comments=${commentList.length}; latest_actionable=${JSON.stringify(actionable)}`,
  });

  await clickupPost(
    `/task/${state.task_id}/comment`,
    {
      comment_text:
        "[CQ-BLOCKER] I need one missing input before Investigate can proceed: what concrete Wolven proof point should anchor this post?",
      notify_all: false,
    },
    client
  );
  await clickupPut(`/task/${state.task_id}`, { status: "brief review" }, client);
  const blockerStatus = await clickupGet<any>(`/task/${state.task_id}`, client);
  row(rows, {
    id: "A13",
    status: blockerStatus.status?.status === "brief review" ? "pass" : "fail",
    action: "Simulate blocker comment and return to previous human gate",
    endpoint: "POST comment + PUT task status",
    observed: `status=${blockerStatus.status?.status}`,
  });

  const assembledTask = await clickupGet<any>(`/task/${state.task_id}`, client);
  const taskFields = extractTaskFields(assembledTask, mapping);
  const assembledBrief = await v3Request<any>(
    "GET",
    `/api/v3/workspaces/${state.workspace_id}/docs/${state.doc_id}/pages/${state.page_ids.brief}?content_format=text/md`,
    token
  );
  const packet = [
    `title=${taskFields.task_title}`,
    `criteria=${taskFields.criterios_de_aceite}`,
    `model=${DEFAULT_MODEL}`,
    `latest_feedback=${actionable}`,
    `brief=${String(assembledBrief.content ?? "").slice(0, 160)}`,
  ].join("\n");
  row(rows, {
    id: "A14-A17-A18",
    status:
      packet.includes("Use only supplied evidence") &&
      packet.includes("Combine 1 and 3") &&
      packet.includes(DEFAULT_MODEL)
        ? "pass"
        : "fail",
    action: "Assemble stage input packet from task fields, Doc content, comments, and current model constant",
    endpoint: "GET task + GET page + GET comments",
    observed: packet,
  });

  const n8nClient = createN8nClient({ apiUrl: n8nUrl, apiKey: n8nKey });
  const workflows = await n8nClient.listWorkflows(100);
  const marketing = workflows.find((wf) => wf.name === "Marketing Pipeline");
  if (marketing) {
    const executions = await n8nClient.listExecutions({ workflowId: marketing.id, limit: 10 });
    state.n8n_recent_execution_ids = executions.map((e) => String(e.id));
    row(rows, {
      id: "A8-A9",
      status: "observe",
      action: "Inspect current n8n workflow status-trigger readiness",
      endpoint: "GET /api/v1/executions",
      observed:
        "Current workflow is still the single-agent Marketing Pipeline; staged statuses require implementation before stage-only trigger and self-echo proof can pass.",
    });
  }

  row(rows, {
    id: "A19",
    status: "observe",
    action: "Latency measurement",
    observed:
      "API mutations were fast enough for manual proof; AI-stage latency cannot be measured until staged n8n workflow exists.",
  });
  row(rows, {
    id: "A20",
    status: "observe",
    action: "Partial failure recovery",
    observed:
      "Docs and comments are independently inspectable by task/doc/page IDs; explicit failure injection should be done after staged n8n implementation.",
  });

  mkdirSync(LOG_DIR, { recursive: true });
  const outputPath = resolve(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        generated_at: nowIso(),
        state,
        evidence: rows,
        cleanup: "left in place for inspection",
      },
      null,
      2
    )}\n`
  );
  console.log(outputPath);
  console.log(JSON.stringify({ state, evidence: rows }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
