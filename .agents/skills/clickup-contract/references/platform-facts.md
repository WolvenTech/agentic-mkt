# ClickUp platform facts

ClickUp API rules distilled from two upstream skills and checked against this
repo on 2026-09-28. Each fact names its source; confirm against the official
ClickUp API docs before building on one.

| Key | Source | License |
| --- | --- | --- |
| [WH] | [`jeremylongshore/claude-code-plugins-plus-skills`](https://github.com/jeremylongshore/claude-code-plugins-plus-skills), `plugins/saas-packs/clickup-pack/skills/clickup-webhooks-events/SKILL.md` | MIT |
| [RL] | same repository, `plugins/saas-packs/clickup-pack/skills/clickup-rate-limits/SKILL.md` | MIT |

## Webhooks

- Creating a webhook returns a unique secret; verify the raw-body
  HMAC-SHA256 against the hexadecimal `X-Signature` header before parsing.
  [WH]
- A registration belongs to the user who created it and can stop firing if
  that user is disabled or loses access to the hierarchy. [WH]
- Use `webhook_id:history_item_id` as the idempotency key when a history item
  exists. [WH]
- A response slower than seven seconds, or unsuccessful, counts as a failure.
  ClickUp tries up to five times, does not resend a failed event later,
  suspends the webhook at `fail_count=100`, and suspends immediately on a
  401. [WH]

## Rate limits

- Limits apply per personal or OAuth token and depend on the Workspace plan:
  100 requests per minute for Free Forever, Unlimited, and Business; 1,000
  for Business Plus; 10,000 for Enterprise. [RL]
- A 429 carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
  `X-RateLimit-Reset`, a Unix timestamp; retry after the reset, not on a
  fixed delay. [RL]
- Plan limits are ceilings shared by every caller on the token. [RL]

## Known gaps

What this repo does today against the facts above:

| Gap | Current state | Upstream expectation |
| --- | --- | --- |
| Webhook signature | The `ClickUp Webhook` node accepts deliveries without checking `X-Signature`. | Reject unsigned or mismatched deliveries before parsing. [WH] |
| Idempotency key | Dedup keys on `history_item_id` alone, in n8n workflow static data (ADR-010). | `webhook_id:history_item_id`, in a durable store. [WH] |
| Rate limits | `src/clickup/client.ts` has a timeout but no 429 handling; in n8n, only the three comment POSTs set `retryOnFail`, on n8n's fixed retry delay. | Reset-based retry and a shared request budget. [RL] |
| Webhook owner | Not recorded in the repo. | Know which user owns the registration. [WH] |

At prototype stage these stay open; revisit when the webhook URL is exposed
beyond the n8n host, a 429 is observed, or duplicate stage runs appear.
