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
={{ $json.history_items[0].field === "status" && $json.history_items[0].after.status === "ready" }}
```

(Builder resolves the literal from `field-mapping.json` → `statuses.ready`; older exports may still show `"Ready to Work"`.)

Only process webhooks where the task **enters** `ready` (live ClickUp status per [`field-mapping.json`](field-mapping.json) → `statuses.ready`). Ignore transitions from `ready` to other statuses, and ignore `history_items` where `field` is not `status`.

Legacy TechSpec / list templates may use display names such as **Ready to Work**; the live Marketing Pipeline list uses lowercase `ready` in webhook payloads (see fixture below).

## Self-echo webhooks (expected noise)

ClickUp webhook registration exposes **Task Status Updated** for the list scope only — there is **no supported filter** to subscribe only when `after.status === ready`. After the workflow PATCHes status to `writing` then `approval`, ClickUp emits additional `taskStatusUpdated` events (`ready → writing`, `writing → approval`). These are **expected** and must **not** trigger a second pipeline run.

| Transition | Cause | Ingress outcome |
|------------|-------|-----------------|
| `ready → writing` | Workflow sets **Status → In Progress** | Filtered — not entering `ready` |
| `writing → approval` | Workflow sets **Status → Review** | Filtered — not entering `ready` |
| `approval → backlog` | Operator cleanup / retest | Filtered |

Filtered deliveries still create short n8n executions (~7 ms). Structured skip logging on the ingress branch (`ingress_skipped` with `reason`, `transition`, `task_id`) is the operator mitigation — search Executions for `ingress_skipped` instead of treating green ~7 ms runs as duplicate happy paths. Do not attempt to suppress self-echo at the ClickUp subscription level unless ClickUp adds status-scoped webhook filters.

## Expected n8n actions (on filter match)

Live status names come from [`field-mapping.json`](field-mapping.json). n8n node labels retain TechSpec names for traceability.

| Step | n8n node label | ClickUp status (`field-mapping.json`) |
|------|----------------|----------------------------------------|
| 1 | GET ClickUp Task | _(unchanged)_ |
| 2 | Status → In Progress | `writing` (`statuses.writing`) |
| 3 | Execute Call Agent | _(sub-workflow)_ |
| 4 | POST Task Comment | _(comment only)_ |
| 5 | Status → Review | `approval` (`statuses.review`) |

1. **GET** `/task/{task_id}` — fetch title, description, and custom fields (`Critérios de Aceite`, `agent_id`) using IDs from [`field-mapping.json`](field-mapping.json)
2. **PUT** `/task/{task_id}` — set status → `writing` (**Status → In Progress**)
3. **Execute** Call Agent sub-workflow with `CallAgentInput` envelope
4. **POST** `/task/{task_id}/comment` — formatted draft per [`../agent-harness/io-contract.md`](../agent-harness/io-contract.md)
5. **PUT** `/task/{task_id}` — set status → `approval` (**Status → Review**)

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
        "status": "ready",
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
| `history_items[0].after.status` | New status display name — ingress when entering `ready` (see `field-mapping.json`) |
| `history_items[0].parent_id` | List ID (verify against `field-mapping.json` → `clickup_list_id` in task_07) |
| `webhook_id` | Logging; Phase 2 idempotency key with `history_items[0].id` |

## Payload review (ClickUp official format)

Reviewed against ClickUp developer docs (2026-06):

| Topic | Finding |
|-------|---------|
| Status field location | `after.status` is a **string** (display name), not a nested object with `.status.status` |
| TechSpec filter string | `history_items[].after.status.status` documents the workflow reference from TechSpec; n8n should use `after.status` per actual payload |
| Schema variance | Some workspaces return `before`/`after` as plain strings for legacy statuses; Marketing Pipeline uses custom statuses — expect object form above |
| Duplicate events | `taskCreated` also fires `taskStatusUpdated`; filter on entering `ready` avoids creation noise unless initial status is `ready` |
| Self-echo | Workflow status PATCHes emit `ready → writing` and `writing → approval` webhooks; ingress filter correctly ignores them (see [Self-echo webhooks](#self-echo-webhooks-expected-noise)) |
| Subscription filtering | ClickUp list webhooks cannot scope to a single target status; self-echo filtering at n8n ingress is required |
| Idempotency | None in M1 ([ADR-001](../.compozy/tasks/marketing-pipeline-clickup-n8n/adrs/adr-001.md)); duplicate deliveries may produce duplicate comments |

## Verification

- **Unit:** `tests/clickup.test.ts` validates fixture against ingress filter logic
- **Integration (task_07+):** Register webhook → move test task to Ready to Work → confirm n8n receives payload matching this contract
- **Pre-registration:** Use ClickUp webhook test tool or replay [`fixtures/task-status-updated-ready-to-work.json`](fixtures/task-status-updated-ready-to-work.json) into n8n test webhook
