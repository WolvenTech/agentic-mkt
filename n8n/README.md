# n8n — Staged Content Quality Pipeline Orchestration

## Purpose

n8n host configuration, credentials runbook, and MCP stub for the **staged content quality pipeline** — a three-stage editorial workflow (investigate, write, format) with human gates in between. Workflow JSON exports live in [`marketing-pipelines/`](../marketing-pipelines/README.md).

## Key files

| Path | Purpose |
|------|---------|
| [`../marketing-pipelines/`](../marketing-pipelines/README.md) | Workflow JSON exports (import/deploy from there) |
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

## Call Agent sub-workflow (multi-stage)

Import [`marketing-pipelines/call-agent-subworkflow.json`](../marketing-pipelines/call-agent-subworkflow.json) into `n8n.wolven.com.br` before the main workflow. This sub-workflow is a pure function: it accepts `StageInput` (stage name, task fields, prior Doc page, latest lead comment), fetches the appropriate agent config and reference/template files from GitHub, invokes OpenAI, and returns `StageAgentOutput` (artifact, resumo, self-check, next gate, optional blocker) or an error envelope — no ClickUp writes.

| Node | Purpose |
|------|---------|
| When Executed by Another Workflow | Production entry (called by main workflow with stage context) |
| Manual Trigger (Isolation Test) | Operator test path with hardcoded input for a specific stage |
| Fetch Agent Config / Fetch Reference Files | GitHub PAT fetch (`retryOnFail`, max 2 tries) — loads `agents/{agent_id}.json` and reference/template files per stage |
| OpenAI Chat Model | `gpt-4.1-mini` with JSON output mode (default from [`src/call-agent/logic.ts`](../src/call-agent/logic.ts)) |
| Parse Agent Output | Validates `StageAgentOutput` structure (stage, artifact_markdown, resumo, self_check, next_gate, optional blocker_question); logs `parse_success` |

After import, replace placeholder credential IDs (`GITHUB_CREDENTIAL_ID`, `OPENAI_CREDENTIAL_ID`) with your n8n credential IDs, or re-select credentials in the editor.

### Sub-workflow isolation test procedure

1. Import [`marketing-pipelines/call-agent-subworkflow.json`](../marketing-pipelines/call-agent-subworkflow.json) and configure **GitHub** (read-only PAT on `rafiti052/agentic-mkt`) and **OpenAI** credentials.
2. Open the workflow and run **Manual Trigger (Isolation Test)** — this executes the **Hardcoded Test Input** node with stage and agent settings.
3. Confirm execution succeeds and **Parse Agent Output** returns JSON with all required keys: `stage`, `artifact_markdown`, `resumo`, `self_check`, `next_gate`, and optionally `blocker_question` (all non-empty strings).
4. In the execution log for **Parse Agent Output**, verify structured log fields include `parse_success: true`, `stage`, `agent_id`, `execution_id`, and `latency_ms`.
5. **Parse-failure test:** temporarily disable **OpenAI Chat Model** JSON output (or inject malformed text in a scratch Code node before **Parse Agent Output**) and confirm the sub-workflow returns `{ "error": "...", "raw_response": "..." }` — not partial `StageAgentOutput`.
6. **Blocker test:** inspect the **Hardcoded Test Input** for a payload that should produce a blocker; confirm **Parse Agent Output** returns a non-empty `blocker_question` string.
7. Inspect **Assemble Prompt** execution data: the stage-appropriate agent config, `wolven-voice` skill, and stage reference/template files must all appear in `system_prompt`.
8. Re-export the workflow from n8n after credential binding and commit to `marketing-pipelines/call-agent-subworkflow.json` if the live graph differs from repo export.

Alternative: pin the same hardcoded `CallAgentInput` on **When Executed by Another Workflow** (included in repo export `pinData`) and execute via **Test workflow** on that trigger.

## Marketing Pipeline main workflow (multi-stage staged workflow)

Import [`marketing-pipelines/marketing-pipeline-main.json`](../marketing-pipelines/marketing-pipeline-main.json) after the Call Agent sub-workflow is imported and active. The main workflow orchestrates three independent stages and manages human gates: webhook ingress → stage ingress filter → task fetch + Doc setup → sub-workflow call → Doc write + comment post → status advance (or blocker return).

### Key workflow paths

| Ingress path | Trigger | Stage | Next gate on success | Return gate on blocker |
|--------------|---------|-------|----------------------|----------------------|
| **Investigate** | Lead moves to **Investigate** | `investigate` agent | `brief_review` | `backlog` |
| **Write** | Lead moves to **Write** | `write` agent | `content_review` | `brief_review` |
| **Format** | Lead moves to **Format** | `format` agent | `final_review` | `content_review` |

### Live ClickUp status names vs n8n node labels

[`clickup/field-mapping.json`](../clickup/field-mapping.json) is the source of truth for API status strings. n8n node names keep TechSpec labels so execution graphs stay readable.

| ClickUp status (`field-mapping.json`) | n8n node label | Trigger | Actor |
|----------------------------------------|----------------|---------|-------|
| `investigate` | **Investigate?** (ingress) | Lead moves task to Investigate | Lead |
| `write` | **Write?** (ingress) | Lead moves task to Write | Lead |
| `format` | **Format?** (ingress) | Lead moves task to Format | Lead |
| `brief_review` | **→ Brief Review** | Investigate stage succeeds | n8n (auto-advance) |
| `content_review` | **→ Content Review** | Write stage succeeds | n8n (auto-advance) |
| `final_review` | **→ Final Review** | Format stage succeeds | n8n (auto-advance) |
| Previous gate (on blocker) | **→ [Previous Gate]** | AI stage posts blocker | n8n (return) |

**Execution transitions operators see in n8n:** one full run per stage ingress, plus short filtered runs for self-echo webhooks when the workflow PATCHes status. Those filtered runs are expected — see [`clickup/webhook-contract.md`](../clickup/webhook-contract.md#self-echo-webhooks-expected-noise).

| Node | Purpose |
|------|---------|
| ClickUp Webhook | Public HTTPS ingress (`POST /webhook/...`) |
| Investigate? / Write? / Format? | IF filters: entering a stage ingress status |
| GET ClickUp Task | Fetch title, description, and custom fields |
| Extract Task Fields | Map `Critérios de Aceite`, `Editorial Doc URL`, and stage metadata via `clickup/field-mapping.json` |
| Create/Fetch Editorial Doc | Create list-scoped Doc if needed; store Doc URL in `Editorial Doc URL` custom field |
| Fetch Doc Pages | Read prior stage page (if exists) to pass to agent as context |
| Execute Call Agent | Calls sub-workflow with `StageInput` for the current stage |
| Create/Replace Doc Page | Write the stage's artifact page to the Doc (`artifact_markdown`) |
| Format Pointer Comment / POST Task Comment | Post summary comment: what changed, resumo, self-check, what's next |
| Status → Next Gate | PATCH status to `next_gate` from stage output (or return to `previous_gate` on blocker) |
| Agent Parse Failure | Throws visible error; does not post comment or advance status |

After import, replace placeholder credential and workflow IDs:

| Placeholder | Action |
|-------------|--------|
| `CLICKUP_CREDENTIAL_ID` | Select ClickUp OAuth or Personal API token credential |
| `CALL_AGENT_WORKFLOW_ID` | Select the imported **Call Agent** sub-workflow |

Ensure `clickup/field-mapping.json` has real field IDs (run `pnpm clickup:sync` after list setup in task_04).

### Main workflow activation and ClickUp webhook

1. Import [`marketing-pipelines/marketing-pipeline-main.json`](../marketing-pipelines/marketing-pipeline-main.json) into `n8n.wolven.com.br`.
2. Bind **ClickUp** credential on all ClickUp nodes and set **Execute Call Agent** → workflow = **Call Agent**.
3. **Activate** the Marketing Pipeline workflow.
4. Copy the production webhook URL from the **ClickUp Webhook** node (format: `https://n8n.wolven.com.br/webhook/marketing-pipeline-ready-to-work`).
5. In ClickUp (Marketing Pipeline list): **Integrations → Webhooks → Create webhook**
   - Event: **Task Status Updated**
   - Endpoint: n8n webhook URL from step 4
6. Confirm webhook deliveries appear in ClickUp webhook log when a test task moves to **ready**.

### Main workflow test procedure

**Full staged workflow test (happy path):**

1. Create a ClickUp task with title, description, and **Critérios de Aceite** populated.
2. Move the task to **Investigate**.
3. Within ~60 seconds:
   - A ClickUp Doc is created and the Doc URL appears in the **Editorial Doc URL** custom field.
   - A page named "Brief" is created in the Doc with the investigation artifact.
   - A pointer comment appears with the resumo and what's needed next.
   - Status auto-advances to **Brief Review**.
4. Review the brief in the Doc. Leave a comment selecting/refining the angle.
5. Move the task to **Write**.
6. Within ~60 seconds:
   - A page named "Argument" is created in the Doc with the channel-neutral argument.
   - A pointer comment appears with the resumo.
   - Status auto-advances to **Content Review**.
7. Review the argument in the Doc. Leave a comment approving or correcting it.
8. Move the task to **Format**.
9. Within ~60 seconds:
   - A page named "Final Draft" is created in the Doc with the Wolven-voice LinkedIn post and self-check.
   - A pointer comment appears with the resumo and self-check summary.
   - Status auto-advances to **Final Review**.
10. Review the final draft (target: under 10 minutes of editing), then move to **Publish** and **Closed**.

**Webhook replay test (no ClickUp):** use **Listen for test event** on the webhook node and POST a sample webhook payload to the test URL; confirm the appropriate ingress filter (`Investigate?`, `Write?`, or `Format?`) executes.

**Failure paths:**

- **ClickUp API failure:** disable ClickUp credential temporarily; move task to a stage; confirm execution shows error in n8n Executions (not silent).
- **Agent parse failure:** use Call Agent isolation test to confirm error envelope; main workflow **Agent Parse Failure** node must throw and must not post comment or advance status.
- **Blocker test:** use Call Agent isolation test to confirm blocker output; main workflow must post blocker comment and return to previous gate (not advance to next gate).

Re-export the workflow from n8n after credential binding and commit to `marketing-pipelines/marketing-pipeline-main.json` if the live graph differs from repo export.

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
2. Select [`marketing-pipelines/call-agent-subworkflow.json`](../marketing-pipelines/call-agent-subworkflow.json).
3. Open the workflow and bind credentials on **Fetch Agent Config**, **Fetch Skill Markdown** (GitHub), and **OpenAI Chat Model**.
4. Run **Manual Trigger (Isolation Test)** — confirm **Parse Agent Output** returns all three `AgentOutput` keys with `parse_success: true`.
5. Leave the sub-workflow **Inactive** (it is invoked by the main workflow, not by webhook).

### Step 2 — Import and activate Marketing Pipeline main workflow

1. **Import** [`marketing-pipelines/marketing-pipeline-main.json`](../marketing-pipelines/marketing-pipeline-main.json).
2. Bind **ClickUp** credential on all ClickUp nodes.
3. On **Execute Call Agent**, select workflow = **Call Agent** (imported sub-workflow).
4. **Activate** the Marketing Pipeline workflow.
5. Copy the production webhook URL from **ClickUp Webhook** node: `https://n8n.wolven.com.br/webhook/marketing-pipeline-ready-to-work`.

### Step 3 — Register ClickUp webhook

1. ClickUp → Integrations → Webhooks → Create webhook.
2. Event: **Task Status Updated**; scope: Marketing Pipeline list.
3. Endpoint: production URL from Step 2.
4. Test first-draft ingress: move a task to **ready** and confirm an execution appears in n8n within ~5 s.
5. Test revision ingress after Phase 2 is deployed: leave feedback in comments, move the task from **approval** to **needs review**, and confirm a revision execution appears.

### Step 4 — Verify stage timing

Expected behavior documented in [`agents/harness/io-contract.md`](../agents/harness/io-contract.md#workflow-sequence-expectations):

| Stage | Target |
|-------|--------|
| Investigate → Brief Review | ≤ 60 s |
| Write → Content Review | ≤ 60 s |
| Format → Final Review | ≤ 60 s |

Target latency: **≤ 60 s** per stage (record actuals in [`agents/harness/green-run-evidence.json`](../agents/harness/green-run-evidence.json) after validation).

### Troubleshooting

See [`agents/harness/io-contract.md` → Troubleshooting](../agents/harness/io-contract.md#troubleshooting) for webhook, stuck writing (`Status → In Progress`), OpenAI parse, and field-mapping failures.

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

1. Import workflow JSON from [`marketing-pipelines/`](../marketing-pipelines/README.md) into `n8n.wolven.com.br` after tasks 06–07 populate exports.
2. Configure credentials: ClickUp, GitHub (read-only PAT on `agentic-mkt` — see above), OpenAI.
3. Activate the main workflow and copy the HTTPS webhook URL into ClickUp (see `clickup/webhook-contract.md`).
