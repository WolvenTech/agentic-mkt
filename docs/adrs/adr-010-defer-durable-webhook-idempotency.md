---
type: adr
title: Defer Durable Webhook Idempotency
description: The pipeline keeps a best-effort dedup on ClickUp history item ids and defers durable exactly-once webhook handling.
status: stable
---

# Defer Durable Webhook Idempotency

## Context

ClickUp can deliver the same webhook more than once. The original V1 scope
decision (001) deferred webhook dedup and idempotency to a later phase. The
staged Content Quality Pipeline later replaced the rest of that V1 scope, but
not this deferral, and no record of it existed on its own.

Since then the marketing pipeline gained a best-effort dedup: the `Dedup?` IF
node checks the delivery's `history_item_id` against n8n workflow static data
(`seenHistoryItems`), and the `Mark History Item Seen` Code node records it
(`src/workflows/build-marketing-pipeline.ts`,
`src/workflows/marketing-pipeline/code-nodes/mark-history-item-seen.js`).

## Decision

Keep the best-effort `history_item_id` dedup in n8n workflow static data as
the only duplicate-delivery guard. Do not build a durable idempotency store
(for example, a persisted key on `webhook_id` plus `history_items[0].id`)
until duplicate stage runs become a real operational problem.

## Consequences

- A duplicate delivery the static-data check misses can still run a stage
  twice and post a duplicate ClickUp comment.
- No extra storage or infrastructure to operate.
- Docs that describe webhook handling should say "best-effort dedup", not
  "no dedup".
