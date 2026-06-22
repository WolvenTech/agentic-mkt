# ClickUp — Marketing Pipeline List

## Purpose

Schema, webhook contract, and field mapping for the Marketing Pipeline ClickUp list. This folder is the single source of truth for status strings and custom field IDs consumed by n8n workflow expressions.

## Key files

| Path | Purpose |
|------|---------|
| [`list-schema.md`](list-schema.md) | List name, statuses, custom fields, brief gate rules |
| [`webhook-contract.md`](webhook-contract.md) | Webhook trigger filter and payload shape |
| [`field-mapping.json`](field-mapping.json) | ClickUp list ID, field IDs, and status display strings |
| [`sync-field-mapping.py`](sync-field-mapping.py) | Pull field IDs from ClickUp API into `field-mapping.json` |
| [`verify-api.py`](verify-api.py) | Integration check — create test task and verify custom fields via GET |
| [`green_run_validation.py`](green_run_validation.py) | M1 green run preflight + execution; writes `logs/green-run/<timestamp>/evidence.json` (see [`logs/README.md`](../logs/README.md)) |
| [`fixtures/task-status-updated-ready-to-work.json`](fixtures/task-status-updated-ready-to-work.json) | Sample webhook payload for contract tests |

## Manual setup checklist

Complete these steps in ClickUp (workspace admin required). Custom fields **cannot** be created via the public API — use the ClickUp UI.

### 1. Create the list

1. Open your ClickUp workspace (Wolven).
2. Create a new List named **Marketing Pipeline** (Space/Folder of your choice — record the location for your team).
3. Replace default statuses with the flow in [`list-schema.md`](list-schema.md):
   - Backlog → Ready to Work → In Progress → Review → Approved → Done
   - Add **Blocked** and **Needs Revision** (manual-only in V1)
4. Copy the list ID from the URL (`.../v/li/{list_id}`) or list settings.

### 2. Add custom fields

On the Marketing Pipeline list, create:

| Field name | Type | Default |
|------------|------|---------|
| Critérios de Aceite | Text | — |
| agent_id | Short text | `linkedin-writer` |
| revision_count | Number | `0` |

Names must match exactly (including `Critérios de Aceite` accent).

### 3. Record IDs in the repo

```bash
export CLICKUP_API_TOKEN="pk_your_personal_token"
export CLICKUP_LIST_ID="your_list_id"

python3 clickup/sync-field-mapping.py
```

This updates `field-mapping.json` with `clickup_list_id` and all `clickup_field_id` values. Commit the updated JSON.

Verify:

```bash
python3 clickup/verify-api.py
python3 -m unittest tests.test_task_04_clickup -v
```

### 4. Brief gate (operational)

Before moving any task to **Ready to Work**, ensure title, description, and **Critérios de Aceite** are filled ([PRD F2](../.compozy/tasks/marketing-pipeline-clickup-n8n/_prd.md)). V1 relies on manual discipline — no ClickUp automation blocks the transition.

### 5. Webhook registration (task_07)

Do **not** register the webhook until the n8n main workflow HTTPS URL exists (task_07). When ready:

1. ClickUp → Integrations → Webhooks → Create webhook
2. Event: **Task Status Updated**
3. Scope: Marketing Pipeline list
4. URL: n8n main workflow webhook URL
5. Confirm payload matches [`webhook-contract.md`](webhook-contract.md)

## Environment variables

| Variable | Required for | Example |
|----------|--------------|---------|
| `CLICKUP_API_TOKEN` | API sync/verify | Personal token from ClickUp Settings → Apps |
| `CLICKUP_LIST_ID` | API sync/verify | Numeric list ID |

See [`.env.example`](../.env.example) at repo root.

## M2 operational runbook

Validated during M1/M2. Complete before importing n8n main workflow.

### Quick validation checklist

```bash
# 1. Sync field IDs (requires CLICKUP_API_TOKEN + CLICKUP_LIST_ID)
python3 clickup/sync-field-mapping.py

# 2. Verify API access and custom fields
python3 clickup/verify-api.py

# 3. Run contract tests
python3 -m unittest tests.test_task_04_clickup -v
```

Confirm `field-mapping.json` has no `<TBD>` values before n8n import.

### Webhook registration (after n8n main workflow is active)

1. Copy production webhook URL from n8n **ClickUp Webhook** node.
2. ClickUp → Integrations → Webhooks → **Task Status Updated** → Marketing Pipeline list.
3. Replay test: POST [`fixtures/task-status-updated-ready-to-work.json`](fixtures/task-status-updated-ready-to-work.json) to n8n test webhook URL (see [`n8n/README.md`](../n8n/README.md#webhook-replay-test-no-clickup)).

### Brief gate (operator discipline)

Before every **Ready to Work** move, confirm title, description, and **Critérios de Aceite** are populated. V1 has no ClickUp automation blocking empty briefs — see [Brief Gate Pattern](../agent-harness/io-contract.md#3-brief-gate-pattern).

### Troubleshooting

| Symptom | First check |
|---------|-------------|
| Webhook not firing | ClickUp webhook log + n8n workflow Active status |
| Empty custom fields in n8n | Re-run `sync-field-mapping.py`; verify field names match UI exactly |
| Task stuck In Progress | n8n Executions for main workflow run |

Full diagnostics: [`agent-harness/io-contract.md` → Troubleshooting](../agent-harness/io-contract.md#troubleshooting).

## Manual setup

This section duplicates the checklist above for README scaffold compatibility (task_01 required sections).

1. Create list and fields per [`list-schema.md`](list-schema.md).
2. Run `sync-field-mapping.py` with API credentials.
3. Run `verify-api.py` and unit tests.
4. Register webhook in task_07 per [`webhook-contract.md`](webhook-contract.md).
