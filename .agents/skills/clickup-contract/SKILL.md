---
name: clickup-contract
description: >-
  Keep this repo's ClickUp integration true to the ClickUp API: the v2 client
  and Docs v3 helpers, field-mapping sync, webhook and list contracts, fixtures,
  and the vendor gate. Use when editing src/clickup/**, integrations/clickup/**,
  or any workflow step that reads or writes ClickUp. Not n8n node wiring or
  Code node structure (n8n-workflow-builders), and not ad-hoc task or board
  operations on the live workspace.
---

# ClickUp contract

ClickUp is an external contract this repo does not own. The repo pins what it
depends on — field IDs and statuses in `field-mapping.json`, payload shapes in
fixtures, ingress rules in `webhook-contract.md`, list structure in
`list-schema.md` — and every change here keeps those pins, the client code,
and the live API in agreement.

**Consult:** `AGENTS.md` (Protected Surfaces §2, Live-Operation Gating,
Secrets and Sensitive Data Handling); `n8n-workflow-builders` when the change
lands in a workflow; [platform-facts.md](references/platform-facts.md) for
ClickUp API rules and the known gaps. Decisions: ADR-004 (one Doc per task,
one page per stage), ADR-007 (activity tags), ADR-009 (early Doc pointer
persistence), ADR-010 (best-effort webhook dedup).

## Hard gates

1. **Sync, never hand-edit, the field mapping.**
   `integrations/clickup/field-mapping.json` changes only through
   `pnpm clickup:sync`. A missing field or status is fixed in ClickUp first,
   then synced.
2. **Gate before live.** Run `pnpm vendor:gate` before `clickup:sync`,
   `clickup:verify`, `green-run`, or any script that calls ClickUp; stop on
   exit 1 or 2. `verify-clickup.ts` and `green-run.ts` do not call
   `runGate()` themselves, so the manual gate is the only guard.
3. **Fixtures change only with the API.** Edit
   `integrations/clickup/fixtures/*.json` only when ClickUp's response shape
   changed, and record the change in the fixture's surrounding doc or commit
   message.
4. **No payloads in logs.** Log task, doc, and page IDs, statuses, and error
   summaries — never task bodies, doc content, comment text, or the token
   (`AGENTS.md` redaction policy; `tests/contracts/logs-redaction.test.ts`).
5. **Name the gap you touch.** The repo does not verify webhook signatures
   and does not handle 429 rate limits
   ([Known gaps](references/platform-facts.md#known-gaps)). Never claim or
   assume either exists; a change to webhook ingress or ClickUp call volume
   says which gap it affects.

## When NOT to use

- Node wiring, IF expressions, or Code node structure →
  `n8n-workflow-builders`. This skill still owns the ClickUp URLs, payloads,
  and status names those nodes use.
- Reading or changing tasks on the live workspace as an operator → use the
  ClickUp connector directly, with explicit confirmation before any write;
  that is operations, not contract work.
- Agent output shape (`StageAgentOutput`, `agents/harness/output-schema.json`)
  → the harness contract under `agents/harness/`.

## Workflow

1. **Classify the change:** client or Docs helper code, field mapping,
   webhook ingress, list structure, or fixture.
2. **Find the pin.** v2 calls go through `src/clickup/client.ts`
   (`clickupGet`/`Post`/`Put`/`Delete`, `ClickUpHttpError`,
   `ClickUpRequestError`); Docs v3 through `src/clickup/docs-helpers.ts`;
   field and status names through `field-mapping.json` (`statuses`,
   `custom_fields`: `agent_id`, `criterios_de_aceite`, `editorial_doc_url`).
3. **Check the current API** against the official ClickUp docs before
   changing an endpoint or payload shape; record what changed.
4. **Change code and pins together:** client code, the matching fixture, and
   `webhook-contract.md` or `list-schema.md` when the contract moved.
5. **Carry it into the workflow.** If the change affects a workflow step,
   switch to `n8n-workflow-builders` to regenerate the JSON.
6. **Verify** offline first, then live only on the Human's ask.

## How to verify

```bash
pnpm test src/clickup/ src/marketing-pipeline/logic.test.ts   # offline
pnpm vendor:gate && pnpm clickup:verify                      # live, on ask
```

`AGENTS.md` names the full check for this surface:
`pnpm clickup:verify && pnpm test src/clickup/sync-field-mapping.test.ts
src/clickup/verify-api.test.ts src/marketing-pipeline/logic.test.ts`.

## Refuse

Do not hand-edit `field-mapping.json`, change a fixture without an API
change, run a live ClickUp command without a passing gate, log raw ClickUp
payloads or the token, hard-code a list, field, or status ID outside the
field mapping, or describe webhook signature checking or rate-limit handling
as present.
