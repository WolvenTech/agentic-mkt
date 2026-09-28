---
name: clickup-contract
description: Stub skill for the ClickUp API contract — not yet defined
metadata:
  wolven-harness: stub
disable-model-invocation: true
---

# clickup-contract

Suggested while discovering this repo's decided tools, ask-only until the
Human defines it.

## Discovery evidence

- `integrations/clickup/` holds `field-mapping.json` (synced by
  `pnpm clickup:sync`, never hand-edited), `webhook-contract.md`,
  `list-schema.md`, and 10 JSON fixtures that lock API response shapes.
- `src/clickup/` holds the API client, Docs v3 helpers (`docs-helpers.ts`),
  field-mapping sync, API verification, and the vendor gate.
- The repo calls ClickUp API v2 (`https://api.clickup.com/api/v2`) and the
  Docs v3 workspace endpoints.
- Live commands (`clickup:sync`, `clickup:verify`, `green-run`) sit behind
  `pnpm vendor:gate` (`AGENTS.md`, Live-Operation Gating).
- Decisions: ADR-004 (one Doc per task, one page per stage), ADR-007
  (activity tags), ADR-009 (early Doc pointer persistence).

## When to use

<Ask the Human: when should an agent reach for this skill?>

## Conventions

<Ask the Human: what did they decide for the ClickUp API contract — naming, layout, its own rules?>

## What to avoid

<Ask the Human: what should this skill refuse, or never do?>

## How to verify

<Ask the Human: what command or read confirms this skill did its job?>
