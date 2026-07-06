# ClickUp Webhook Contract

Ingress contract for the Marketing Pipeline n8n main workflow. Webhook registration happens after the n8n HTTPS URL is available.

## Trigger

| Property | Value |
|----------|-------|
| **ClickUp event** | `Task Status Updated` (`taskStatusUpdated`) |
| **Scope** | Marketing Pipeline list only |
| **Target URL** | n8n main workflow webhook URL |

ClickUp may also emit `taskUpdated` for the same status change. Subscribe to **Task Status Updated** for staged ingress.

## Ingress filters

The staged workflow triggers on three separate AI-stage entry points. **n8n ingress IF nodes** (one per stage, matching ClickUp `taskStatusUpdated` payload):

| Stage | Trigger status | n8n IF expression |
|-------|----------------|-------------------|
| **Investigate** | Entering `investigate` | `{{ $json.history_items[0].field === "status" && $json.history_items[0].after.status === "investigate" }}` |
| **Write** | Entering `write` | `{{ $json.history_items[0].field === "status" && $json.history_items[0].after.status === "write" }}` |
| **Format** | Entering `format` | `{{ $json.history_items[0].field === "status" && $json.history_items[0].after.status === "format" }}` |

Builder resolves these literals from `field-mapping.json` → `statuses` (keys: `investigate`, `write`, `format`).

**Trigger flow:** Lead moves task to a stage column (e.g., Investigate). Webhook fires. n8n ingress filter matches entering that stage's status. If it matches, the stage workflow runs. Ignore transitions *from* these statuses to other statuses, and ignore `history_items` where `field` is not `status`.

## Self-echo webhooks (expected noise)

ClickUp webhook registration exposes **Task Status Updated** for the list scope only — there is **no supported filter** to subscribe only when `after.status` enters a specific stage. After a stage completes, the workflow PATCHes status to the next human gate (e.g., `investigate` → `brief_review`, `write` → `content_review`, `format` → `final_review`). ClickUp emits additional `taskStatusUpdated` events. These are **expected** and must **not** trigger a second AI-stage run.

| Transition | Cause | Ingress outcome |
|------------|-------|-----------------|
| `investigate → brief_review` | Workflow advances after stage succeeds | Filtered — not entering `investigate`, `write`, or `format` |
| `write → content_review` | Workflow advances after stage succeeds | Filtered — not entering `investigate`, `write`, or `format` |
| `format → final_review` | Workflow advances after stage succeeds | Filtered — not entering `investigate`, `write`, or `format` |
| `brief_review → write` | Lead moves task forward | Full execution — entering `write` ingress |
| `content_review → format` | Lead moves task forward | Full execution — entering `format` ingress |
| Back to earlier stage | Lead reworks (e.g., `content_review → write`) | Full execution — re-runs that stage |
| `final_review → publish` | Lead approves final draft | Filtered — not a stage status |
| `publish → backlog` | Operator cleanup / retest | Filtered |

Filtered deliveries still create short n8n executions (~7 ms). Structured skip logging on the ingress branch (`ingress_skipped` with `reason`, `transition`, `task_id`) is the operator mitigation — search Executions for `ingress_skipped` instead of treating green ~7 ms runs as duplicate happy paths. Do not attempt to suppress self-echo at the ClickUp subscription level unless ClickUp adds status-scoped webhook filters.

## Expected n8n actions (on ingress match)

When the workflow ingress filter matches (entering `investigate`, `write`, or `format`), n8n executes this sequence for the matched stage:

| Step | n8n node label | ClickUp API call |
|------|----------------|------------------|
| 1 | GET ClickUp Task | Fetch title, description, and custom fields (`ACs`, `Agent`, `Editorial Doc Url`) |
| 2 | Create/Fetch Editorial Doc | Create Doc if needed; store Doc URL in `Editorial Doc Url` custom field |
| 3 | Fetch Doc Pages | Read prior stage page(s) for context; pass to agent |
| 4 | Execute Call Agent | Invoke Call Agent sub-workflow with stage metadata and task context |
| 5 | Create/Replace Doc Page | Write the stage artifact page to the Doc |
| 6 | Format Pointer Comment / POST Task Comment | Post summary comment: resumo, self-check, what's next |
| 7 | Status → Next Gate | Advance to next human gate (e.g., `investigate` → `brief_review`) or return to previous gate on blocker |
| 8 | Add/Clear Activity Tags | Set `agent-working` on entry (step 1–2), swap to `agent-blocked` on blocker output, clear both on gate advance (step 7) |

**Per-stage flow:**
- **Investigate**: ingress on `investigate` → `brief_review` (auto-advance) or back to `backlog` (blocker)
- **Write**: ingress on `write` → `content_review` (auto-advance) or back to `brief_review` (blocker)
- **Format**: ingress on `format` → `final_review` (auto-advance) or back to `content_review` (blocker)

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
        "status": "backlog",
        "color": "#f9d900",
        "orderindex": 0,
        "type": "open"
      },
      "after": {
        "status": "investigate",
        "color": "#7C4DFF",
        "orderindex": 1,
        "type": "custom"
      }
    }
  ],
  "webhook_id": "7fa3ec74-69a8-4530-a251-8a13730bd204"
}
```

Fixture copies for tests live in `fixtures/` (for example, `task-status-updated-investigate.json`, `task-status-updated-write.json`, and `task-status-updated-format.json`).

### Fields the workflow reads

| JSON path | Use |
|-----------|-----|
| `task_id` | ClickUp task ID for subsequent API calls |
| `history_items[0].field` | Must be `"status"` |
| `history_items[0].after.status` | New status display name — ingress when entering `investigate`, `write`, or `format` (see `field-mapping.json`) |
| `history_items[0].parent_id` | List ID (verify against `field-mapping.json` → `clickup_list_id`) |
| `webhook_id` | Logging; idempotency tracking with `history_items[0].id` |

## Payload review (ClickUp official format)

Reviewed against ClickUp developer docs (2026-06):

| Topic | Finding |
|-------|---------|
| Status field location | `after.status` is a **string** (display name), not a nested object with `.status.status` |
| Staged ingress filtering | Workflow filters on entering `investigate`, `write`, or `format` per `field-mapping.json`; no changes to payload schema |
| Schema variance | Some workspaces return `before`/`after` as plain strings for legacy statuses; Marketing Pipeline uses custom statuses — expect object form |
| Duplicate events | `taskCreated` also fires `taskStatusUpdated`; filter on entering a stage status avoids creation noise |
| Self-echo | Workflow status PATCHes emit transitions between statuses (e.g., `investigate → brief_review`); ingress filters correctly ignore them since they don't enter a stage status (see [Self-echo webhooks](#self-echo-webhooks-expected-noise)) |
| Subscription filtering | ClickUp list webhooks cannot scope to multiple target statuses; self-echo filtering at n8n ingress is required |
| Idempotency | None currently; duplicate deliveries may produce duplicate comments |

## Verification

- **Unit:** `src/marketing-pipeline/logic.test.ts` validates fixtures against ingress filter logic and payload shape
- **Integration:** Register webhook → move test task to Investigate, Write, or Format → confirm n8n receives payload matching this contract
- **Pre-registration:** Use ClickUp webhook test tool or replay [`fixtures/task-status-updated-investigate.json`](fixtures/task-status-updated-investigate.json), [`fixtures/task-status-updated-write.json`](fixtures/task-status-updated-write.json), and [`fixtures/task-status-updated-format.json`](fixtures/task-status-updated-format.json) into n8n test webhook
