# n8n — Marketing Pipeline Orchestration

## Purpose

Workflow JSON exports and n8n configuration for the ClickUp → agent → ClickUp marketing pipeline.

## Key files

| Path | Purpose |
|------|---------|
| `workflows/marketing-pipeline-main.json` | Main workflow: webhook ingress, status transitions, comment post |
| `workflows/call-agent-subworkflow.json` | Sub-workflow: load agent config, invoke OpenAI, parse output |
| `mcp-config.stub.json` | MCP stub only — no implementation in M1 |

## GitHub repository (Call Agent config fetch)

Runtime agent configs and skills are loaded from this repository via the n8n GitHub node (ADR-004).

| Setting | Value |
|---------|-------|
| Repository | `rafiti052/agentic-mkt` (private) |
| Default branch | `main` |
| Agent config path | `agents/{agent_id}.json` |
| Skill path | `agents/skills/{skill_name}.md` |

Example fetch paths for `linkedin-writer` (via n8n GitHub node with PAT — repo is **private**, so anonymous raw URLs will 404):

- `agents/linkedin-writer.json`
- `agents/skills/wolven-voice.md`
- `agents/skills/linkedin-format.md`

### GitHub credential (n8n)

Create a **fine-grained personal access token** scoped to this repository only:

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
2. **Repository access:** Only select repositories → `agentic-mkt`.
3. **Permissions → Repository contents:** Read-only.
4. Do not grant write, metadata beyond read, or organization-wide access.
5. In n8n (`n8n.wolven.com.br`), add a **GitHub** credential using the PAT.
6. Test the credential by fetching `agents/linkedin-writer.json` from the default branch.

The Call Agent sub-workflow depends on this repo being pushed before isolation testing (task_06).

## Call Agent sub-workflow (task_06)

Import `workflows/call-agent-subworkflow.json` into `n8n.wolven.com.br` before the main workflow. This sub-workflow is a pure function: it accepts `CallAgentInput`, fetches agent config and skills from GitHub, invokes OpenAI, and returns `AgentOutput` or an error envelope — no ClickUp writes.

| Node | Purpose |
|------|---------|
| When Executed by Another Workflow | Production entry (called by main workflow) |
| Manual Trigger (Isolation Test) | Operator test path with hardcoded input |
| Fetch Agent Config / Fetch Skill Markdown | GitHub PAT fetch (`retryOnFail`, max 2 tries) |
| OpenAI Chat Model | `gpt-4.1-mini` with JSON output mode (default from [`src/call-agent/logic.ts`](../src/call-agent/logic.ts)) |
| Parse Agent Output | Validates `deliverable_markdown`, `resumo`, `autochecagem`; logs `parse_success` |

After import, replace placeholder credential IDs (`GITHUB_CREDENTIAL_ID`, `OPENAI_CREDENTIAL_ID`) with your n8n credential IDs, or re-select credentials in the editor.

### Sub-workflow isolation test procedure

1. Import `workflows/call-agent-subworkflow.json` and configure **GitHub** (read-only PAT on `rafiti052/agentic-mkt`) and **OpenAI** credentials.
2. Open the workflow and run **Manual Trigger (Isolation Test)** — this executes the **Hardcoded Test Input** node with `agent_id: linkedin-writer`.
3. Confirm execution succeeds and **Parse Agent Output** returns JSON with all three keys: `deliverable_markdown`, `resumo`, `autochecagem` (non-empty strings).
4. In the execution log for **Parse Agent Output**, verify structured log fields include `parse_success: true`, `agent_id`, `execution_id`, and `latency_ms`.
5. **Parse-failure test:** temporarily disable **OpenAI Chat Model** JSON output (or inject malformed text in a scratch Code node before **Parse Agent Output**) and confirm the sub-workflow returns `{ "error": "...", "raw_response": "..." }` — not partial `AgentOutput`.
6. Inspect **Assemble Prompt** execution data: both `wolven-voice` and `linkedin-format` skill bodies must appear in `system_prompt`.
7. Re-export the workflow from n8n after credential binding and commit to `n8n/workflows/call-agent-subworkflow.json` if the live graph differs from repo export.

Alternative: pin the same hardcoded `CallAgentInput` on **When Executed by Another Workflow** (included in repo export `pinData`) and execute via **Test workflow** on that trigger.

## Marketing Pipeline main workflow (task_07)

Import `workflows/marketing-pipeline-main.json` after the Call Agent sub-workflow is imported and active. The main workflow is the sole ClickUp mutator for the happy path: webhook ingress → task fetch → status transitions → sub-workflow call → draft comment → Review.

### Live ClickUp status names vs n8n node labels

[`clickup/field-mapping.json`](../clickup/field-mapping.json) is the source of truth for API status strings. n8n node names keep TechSpec labels so execution graphs stay readable.

| ClickUp status (`field-mapping.json`) | n8n node label | When set |
|----------------------------------------|----------------|----------|
| `ready` (`statuses.ready`) | **Ready to Work?** (ingress only) | Lead moves task to ready — triggers webhook |
| `writing` (`statuses.writing`) | **Status → In Progress** | Start of automated work |
| `approval` (`statuses.review`) | **Status → Review** | After comment posts |

**Execution transitions operators see in n8n:** one full run per `backlog → ready` ingress, plus short filtered runs for self-echo webhooks (`ready → writing`, `writing → approval`) when the workflow PATCHes status. Those filtered runs are expected — see [`clickup/webhook-contract.md`](../clickup/webhook-contract.md#self-echo-webhooks-expected-noise).

| Node | Purpose |
|------|---------|
| ClickUp Webhook | Public HTTPS ingress (`POST /webhook/marketing-pipeline-ready-to-work`) |
| Ready to Work? | IF filter: entering `ready` (`history_items[0].field === "status"`) |
| GET ClickUp Task | Fetch title, description, and custom fields |
| Extract Task Fields | Map `Critérios de Aceite` and `agent_id` via `clickup/field-mapping.json` IDs |
| Status → In Progress | PATCH task status → `writing` before agent call |
| Execute Call Agent | Calls sub-workflow with `CallAgentInput` |
| Format Draft Comment / POST Task Comment | TechSpec comment template with LinkedIn Draft, Resumo, Autochecagem |
| Status → Review | PATCH status → `approval` after successful comment post |
| Agent Parse Failure | Throws visible error; does not advance to Review |

After import, replace placeholder credential and workflow IDs:

| Placeholder | Action |
|-------------|--------|
| `CLICKUP_CREDENTIAL_ID` | Select ClickUp OAuth or Personal API token credential |
| `CALL_AGENT_WORKFLOW_ID` | Select the imported **Call Agent** sub-workflow |

Ensure `clickup/field-mapping.json` has real field IDs (run `pnpm clickup:sync` after list setup in task_04).

### Main workflow activation and ClickUp webhook

1. Import `workflows/marketing-pipeline-main.json` into `n8n.wolven.com.br`.
2. Bind **ClickUp** credential on all ClickUp nodes and set **Execute Call Agent** → workflow = **Call Agent**.
3. **Activate** the Marketing Pipeline workflow.
4. Copy the production webhook URL from the **ClickUp Webhook** node (format: `https://n8n.wolven.com.br/webhook/marketing-pipeline-ready-to-work`).
5. In ClickUp (Marketing Pipeline list): **Integrations → Webhooks → Create webhook**
   - Event: **Task Status Updated**
   - Endpoint: n8n webhook URL from step 4
6. Confirm webhook deliveries appear in ClickUp webhook log when a test task moves to **ready**.

### Main workflow test procedure

1. Create a ClickUp task with title, description, and **Critérios de Aceite** populated.
2. Move the task to **ready**.
3. Within ~5 seconds, verify status changes to **writing** (n8n execution running; node **Status → In Progress**).
4. Within ~60 seconds, verify a task comment appears with `## LinkedIn Draft`, `## Resumo`, and `## Autochecagem` sections and footer `_Generated by linkedin-writer (gpt-4.1-mini)_`.
5. Verify task status is **approval** after the comment posts (node **Status → Review**).
6. In n8n **Executions**, confirm one full success run plus ~7 ms filtered runs for `ready → writing` and `writing → approval` self-echo (not duplicate pipeline runs).

**Webhook replay test (no ClickUp):** use **Listen for test event** on the webhook node and POST [`clickup/fixtures/task-status-updated-ready-to-work.json`](../clickup/fixtures/task-status-updated-ready-to-work.json) to the test URL; confirm **Ready to Work?** true branch executes.

**Failure paths:**

- **ClickUp API failure:** disable ClickUp credential temporarily; move task to ready; confirm execution shows error in n8n Executions (not silent).
- **Agent parse failure:** use Call Agent isolation test to confirm error envelope; main workflow **Agent Parse Failure** node must throw and must not post comment or set approval.

Re-export the workflow from n8n after credential binding and commit to `n8n/workflows/marketing-pipeline-main.json` if the live graph differs from repo export.

Regenerate repo export: `pnpm build:workflows`.

## M2 operational runbook (import and activate)

Validated during M1/M2. An operator can re-import and activate both workflows using this section alone.

### Prerequisites

- Run `pnpm vendor:gate` first — exit 0 required before any live ClickUp/n8n operation below; stop and fix `.env`/vendor setup on exit 1 or 2 (see root [README.md](../README.md#vendor-gate-required-before-live-operations)).
- Repo pushed to GitHub (`rafiti052/agentic-mkt`, branch `main`) — Call Agent fetches agent configs at runtime.
- n8n credentials configured: **ClickUp**, **GitHub** (read-only PAT), **OpenAI**.
- [`clickup/field-mapping.json`](../clickup/field-mapping.json) synced with real field IDs (`pnpm clickup:sync`).

### Step 1 — Import Call Agent sub-workflow

1. In `n8n.wolven.com.br`, go to **Workflows → Import from File**.
2. Select `n8n/workflows/call-agent-subworkflow.json`.
3. Open the workflow and bind credentials on **Fetch Agent Config**, **Fetch Skill Markdown** (GitHub), and **OpenAI Chat Model**.
4. Run **Manual Trigger (Isolation Test)** — confirm **Parse Agent Output** returns all three `AgentOutput` keys with `parse_success: true`.
5. Leave the sub-workflow **Inactive** (it is invoked by the main workflow, not by webhook).

### Step 2 — Import and activate Marketing Pipeline main workflow

1. **Import** `n8n/workflows/marketing-pipeline-main.json`.
2. Bind **ClickUp** credential on all ClickUp nodes.
3. On **Execute Call Agent**, select workflow = **Call Agent** (imported sub-workflow).
4. **Activate** the Marketing Pipeline workflow.
5. Copy the production webhook URL from **ClickUp Webhook** node: `https://n8n.wolven.com.br/webhook/marketing-pipeline-ready-to-work`.

### Step 3 — Register ClickUp webhook

1. ClickUp → Integrations → Webhooks → Create webhook.
2. Event: **Task Status Updated**; scope: Marketing Pipeline list.
3. Endpoint: production URL from Step 2.
4. Test: move a task to **ready** and confirm an execution appears in n8n within ~5 s.

### Step 4 — Verify green run timing

Expected behavior documented in [`agent-harness/io-contract.md`](../agent-harness/io-contract.md#workflow-sequence-expectations):

| Checkpoint | Target |
|------------|--------|
| ready → writing | ≤ 5 s |
| writing → comment posted | ≤ 60 s total |
| Final status | approval (`statuses.review`) |

M1 target latency: **< 60 s** end-to-end (record actuals in [`green-run-evidence.json`](../agent-harness/green-run-evidence.json) after green run).

### Troubleshooting

See [`agent-harness/io-contract.md` → Troubleshooting](../agent-harness/io-contract.md#troubleshooting) for webhook, stuck writing (`Status → In Progress`), OpenAI parse, and field-mapping failures.

**Update live n8n after builder changes:**

```bash
pnpm build:workflows    # regenerate committed JSON in this repo
pnpm deploy:workflows   # push exports to n8n.wolven.com.br (requires N8N_API_KEY in .env)
```

`pnpm deploy:workflows` is the standard path to update the running instance — it upserts both workflow exports and preserves credential bindings where possible. Use manual import (Steps 1–2) only for first-time setup or when API deploy is unavailable.

**Regenerate workflow exports only (no live push):**

```bash
pnpm build:workflows
```

> **Re-import note:** `pnpm build:workflows` alone only updates JSON files in this repo. Prefer `pnpm deploy:workflows` for routine updates; fall back to re-importing both `call-agent-subworkflow.json` and `marketing-pipeline-main.json` (Workflows → Import from File) and re-bind credentials/workflow IDs as in Steps 1–2 above when deploy is not an option.

## Manual setup

1. Import workflow JSON into `n8n.wolven.com.br` after tasks 06–07 populate exports.
2. Configure credentials: ClickUp, GitHub (read-only PAT on `agentic-mkt` — see above), OpenAI.
3. Activate the main workflow and copy the HTTPS webhook URL into ClickUp (see `clickup/webhook-contract.md`).
