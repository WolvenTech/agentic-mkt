# ClickUp — Marketing Pipeline List

## Purpose

Schema, webhook contract, and field mapping for the **staged editorial workflow** on the Marketing Pipeline ClickUp list. The lead controls workflow progression by moving tasks between human and AI columns; each AI stage writes to a ClickUp Doc and posts a pointer comment. This folder is the single source of truth for status strings and custom field IDs consumed by n8n workflow expressions.

## Key files

| Path | Purpose |
|------|---------|
| [`list-schema.md`](list-schema.md) | List name, statuses, custom fields, brief gate rules |
| [`webhook-contract.md`](webhook-contract.md) | Webhook trigger filter and payload shape |
| [`field-mapping.json`](field-mapping.json) | ClickUp list ID, field IDs, and status display strings |
| `pnpm vendor:gate` | **Run first** — verifies ClickUp + n8n connectivity before live scripts or integration tests |
| `pnpm clickup:sync` | Pull field IDs from ClickUp API into `field-mapping.json` |
| `pnpm clickup:verify` | Integration check — create test task and verify custom fields via GET |
| `pnpm green-run` | Green run preflight + execution; writes `logs/green-run/<timestamp>/evidence.json` (see [`logs/README.md`](../logs/README.md)) |
| [`fixtures/task-status-updated-ready-to-work.json`](fixtures/task-status-updated-ready-to-work.json) | Sample first-draft webhook payload for contract tests |
| [`fixtures/task-status-updated-needs-review.json`](fixtures/task-status-updated-needs-review.json) | Sample revision webhook payload for contract tests |

## Manual setup checklist

Complete these steps in ClickUp (workspace admin required). Custom fields **cannot** be created via the public API — use the ClickUp UI.

### 1. Create the list

1. Open your ClickUp workspace (Wolven).
2. Create a new List named **Marketing Pipeline** (Space/Folder of your choice — record the location for your team).
3. Replace default statuses with the staged flow in [`list-schema.md`](list-schema.md):
   - Backlog → Investigate → Brief Review → Write → Content Review → Format → Final Review → Publish → Closed
4. Copy the list ID from the URL (`.../v/li/{list_id}`) or list settings.

### 2. Add custom fields

On the Marketing Pipeline list, create:

| Field name | Type | Default |
|------------|------|---------|
| ACs | Text | — |
| Editorial Doc Url | URL | — |
| Agent | Short text | `linkedin-writer` |

Names must match exactly. The **Editorial Doc Url** field stores the machine-readable pointer to the ClickUp Doc for this task's editorial artifacts.

### 3. Record IDs in the repo

Run the vendor gate first (required before live API scripts). Loads credentials from repo-root `.env` automatically:

```bash
pnpm vendor:gate   # exit 0 required — stop if ClickUp/n8n unreachable
```

```bash
export CLICKUP_API_TOKEN="pk_your_personal_token"
export CLICKUP_LIST_ID="your_list_id"

pnpm clickup:sync
```

This updates `field-mapping.json` with `clickup_list_id` and all `clickup_field_id` values. Commit the updated JSON.

Verify:

```bash
pnpm clickup:verify
pnpm test
```

### 4. Brief gate (operational)

Before moving any task to **Investigate**, ensure title, description, and **ACs** are filled. The workflow relies on manual discipline — no ClickUp automation blocks the transition. See [`list-schema.md` → Brief gate](list-schema.md#brief-gate-prd-f2).

### 5. Webhook registration

Do **not** register the webhook until the n8n workflow HTTPS URL exists. When ready:

1. ClickUp → Integrations → Webhooks → Create webhook
2. Event: **Task Status Updated**
3. Scope: Marketing Pipeline list
4. URL: n8n workflow webhook URL
5. Confirm payload matches [`webhook-contract.md`](webhook-contract.md)

The webhook triggers the n8n workflow whenever a task's status changes. Key ingress points:
- **Investigate:** starts the investigation stage
- **Write:** starts the argument-writing stage (after brief approval)
- **Format:** starts the formatting stage (after argument approval)

## Communication model: Comments instruct, Doc stores artifacts

**Comments are the instruction channel.** All human feedback flows through free-form task comments only — not Doc comments. Use comments to select angles at Brief Review, correct arguments at Content Review, and approve or edit the final draft at Final Review.

**The ClickUp Doc is the artifact workspace.** Each stage writes its full output to a dedicated Doc page (Brief, Argument, Final Draft). One ClickUp Doc per task stores the complete editorial history, readable in one place. The Doc also stores a machine-readable pointer to its own URL in the **Editorial Doc Url** custom field.

**Pointer comments keep reviews fast.** When a stage completes, it posts a short pointer comment summarizing what changed, the resumo, a self-check, and what's needed next. You can scan the task-level summary without opening the Doc every time, but the full artifacts live in the Doc.

See [`list-schema.md` → Approval and control model](list-schema.md#approval-and-control-model) for the complete workflow model.

## Environment variables

| Variable | Required for | Example |
|----------|--------------|---------|
| `CLICKUP_API_TOKEN` | API sync/verify | Personal token from ClickUp Settings → Apps |
| `CLICKUP_LIST_ID` | API sync/verify | Numeric list ID |

See [`.env.example`](../.env.example) at repo root.

## Operational runbook

Setup and operation of the staged editorial workflow.

### Setup validation checklist

```bash
# 0. Vendor gate — exit 0 required before any step below
pnpm vendor:gate

# 1. Sync field IDs (requires CLICKUP_API_TOKEN + CLICKUP_LIST_ID)
pnpm clickup:sync

# 2. Verify API access and custom fields
pnpm clickup:verify

# 3. Run contract tests
pnpm test
```

Confirm `field-mapping.json` has no `<TBD>` values before n8n deployment.

### Webhook registration (after n8n workflow is active)

1. Copy production webhook URL from n8n **ClickUp Webhook** node.
2. ClickUp → Integrations → Webhooks → **Task Status Updated** → Marketing Pipeline list.
3. Replay test: POST a sample webhook payload to n8n test webhook URL to confirm ingress (see [`n8n/README.md`](../n8n/README.md)).

### Brief gate (operator discipline)

Before moving any task to **Investigate**, confirm title, description, and **ACs** are populated. No ClickUp automation blocks empty briefs — manual discipline only.

### Workflow operation

1. **Create task in Backlog** with title, description, and acceptance criteria.
2. **Move to Investigate** to start the investigation stage. The workflow creates a ClickUp Doc and stores the Doc URL in the **Editorial Doc Url** custom field.
3. **AI investigates** — the workflow reads the task description and runs the investigation stage. When complete, the AI writes the investigative brief to the Doc, posts a pointer comment summarizing what changed, and status auto-advances to **Brief Review**.
4. **Review brief and select angle** — the lead reads the brief in the Doc, then posts a comment selecting or refining the strongest angle. Move the task to **Write** to trigger the next stage.
5. **AI writes argument** — after the brief is approved, the workflow runs the write stage. The argument lands in the Doc, and status auto-advances to **Content Review**.
6. **Review argument** — the lead reads the channel-neutral argument in the Doc and posts corrections or approvals in the comment thread. Move to **Format** to continue.
7. **AI formats for LinkedIn** — the workflow runs the format stage, producing a Wolven-voice LinkedIn post in the Doc with a self-check. Status auto-advances to **Final Review**.
8. **Final review and publish** — the lead makes minor edits (target: under 10 minutes), then moves to **Publish** and **Closed**.

### Rework (moving back)

At any human gate, move the task *back* to an earlier AI column with comment guidance to re-run only that stage:

- Move to **Investigate** to re-run investigation (e.g., if the topic is poorly understood).
- Move to **Write** to re-run the argument (after brief approval, or to rework after content review).
- Move to **Format** to re-run formatting (after argument approval, or to rework after final review).

When you move back, downstream artifacts are **preserved until you manually re-run them**. This means:
- If you re-run **Investigate**, the prior **Argument** and **Final Draft** remain in the Doc until you move **Write** and **Format** again.
- If you re-run **Write**, the **Final Draft** stays in the Doc until you move **Format** again.

### Blockers

If an AI stage lacks enough material (insufficient evidence, missing context, unclear angle), it posts a blocker question as a comment and returns the task to the previous human gate:

- If **Investigate** hits a blocker, the task returns to **Backlog**.
- If **Write** hits a blocker, the task returns to **Brief Review**.
- If **Format** hits a blocker, the task returns to **Content Review**.

Answer the blocker question in the comment thread, then move the task forward again to retry.

### Troubleshooting

| Symptom | First check |
|---------|-------------|
| Webhook not firing | ClickUp webhook log + n8n workflow Active status |
| Empty custom fields in n8n | Re-run `pnpm clickup:sync`; verify field names match UI exactly |
| Task stuck In Progress | n8n Executions for main workflow run |

Full diagnostics: [`agents/harness/io-contract.md` → Troubleshooting](../agents/harness/io-contract.md#troubleshooting).
