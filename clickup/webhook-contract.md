# ClickUp Webhook Contract

Ingress contract for the Marketing Pipeline n8n main workflow. Webhook registration happens in task_07 after the n8n HTTPS URL is available.

## Trigger

| Property | Value |
|----------|-------|
| **ClickUp event** | `Task Status Updated` (`taskStatusUpdated`) |
| **Scope** | Marketing Pipeline list only |
| **Target URL** | n8n main workflow webhook URL (configured in task_07) |

ClickUp may also emit `taskUpdated` for the same status change. Subscribe to **Task Status Updated** for M1 ingress.

## Ingress filter

**TechSpec / workflow reference expression:**

```
history_items[].after.status.status == "Ready to Work"
```

**n8n IF node expression (matches ClickUp `taskStatusUpdated` payload — see Payload review below):**

```
={{ $json.history_items[0].field === "status" && $json.history_items[0].after.status === "Ready to Work" }}
```

Only process webhooks where the task **enters** Ready to Work. Ignore transitions from Ready to Work to other statuses, and ignore `history_items` where `field` is not `status`.

## Expected n8n actions (on filter match)

1. **GET** `/task/{task_id}` — fetch title, description, and custom fields (`Critérios de Aceite`, `agent_id`) using IDs from [`field-mapping.json`](field-mapping.json)
2. **PUT** `/task/{task_id}` — set status → `In Progress`
3. **Execute** Call Agent sub-workflow with `CallAgentInput` envelope
4. **POST** `/task/{task_id}/comment` — formatted draft per [`../agent-harness/io-contract.md`](../agent-harness/io-contract.md)
5. **PUT** `/task/{task_id}` — set status → `Review`

On API or agent failure: log in n8n Executions; do not silently fail (TechSpec Integration Points).

## Payload shape

Example `taskStatusUpdated` payload (adapted from [ClickUp task webhook payloads](https://developer.clickup.com/docs/webhooktaskpayloads)):

```json
{
  "event": "taskStatusUpdated",
  "task_id": "abc123",
  "history_items": [
    {
      "id": "2800763136717140857",
      "type": 1,
      "date": "1642734631523",
      "field": "status",
      "parent_id": "162641062",
      "data": { "status_type": "custom" },
      "user": { "id": 183, "username": "John", "email": "john@company.com" },
      "before": {
        "status": "Backlog",
        "color": "#f9d900",
        "orderindex": 0,
        "type": "open"
      },
      "after": {
        "status": "Ready to Work",
        "color": "#7C4DFF",
        "orderindex": 1,
        "type": "custom"
      }
    }
  ],
  "webhook_id": "7fa3ec74-69a8-4530-a251-8a13730bd204"
}
```

Fixture copy for tests: [`fixtures/task-status-updated-ready-to-work.json`](fixtures/task-status-updated-ready-to-work.json).

### Fields the workflow reads

| JSON path | Use |
|-----------|-----|
| `task_id` | ClickUp task ID for subsequent API calls |
| `history_items[0].field` | Must be `"status"` |
| `history_items[0].after.status` | New status display name — ingress when `"Ready to Work"` |
| `history_items[0].parent_id` | List ID (verify against `field-mapping.json` → `clickup_list_id` in task_07) |
| `webhook_id` | Logging; Phase 2 idempotency key with `history_items[0].id` |

## Payload review (ClickUp official format)

Reviewed against ClickUp developer docs (2026-06):

| Topic | Finding |
|-------|---------|
| Status field location | `after.status` is a **string** (display name), not a nested object with `.status.status` |
| TechSpec filter string | `history_items[].after.status.status` documents the workflow reference from TechSpec; n8n should use `after.status` per actual payload |
| Schema variance | Some workspaces return `before`/`after` as plain strings for legacy statuses; Marketing Pipeline uses custom statuses — expect object form above |
| Duplicate events | `taskCreated` also fires `taskStatusUpdated`; filter on `after.status === "Ready to Work"` avoids creation noise unless initial status is Ready to Work |
| Idempotency | None in M1 ([ADR-001](../.compozy/tasks/marketing-pipeline-clickup-n8n/adrs/adr-001.md)); duplicate deliveries may produce duplicate comments |

## Verification

- **Unit:** `tests/test_task_04_clickup.py` validates fixture against ingress filter logic
- **Integration (task_07+):** Register webhook → move test task to Ready to Work → confirm n8n receives payload matching this contract
- **Pre-registration:** Use ClickUp webhook test tool or replay [`fixtures/task-status-updated-ready-to-work.json`](fixtures/task-status-updated-ready-to-work.json) into n8n test webhook
