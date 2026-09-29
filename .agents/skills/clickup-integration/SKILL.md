---
name: clickup-integration
description: Stub skill for ClickUp API integration and editorial docs — not yet defined
metadata:
  wolven-harness: stub
disable-model-invocation: true
---

# clickup-integration

Suggested while discovering this repo's decided tools, ask-only until the
Human defines it.

## Discovery evidence

- ClickUp client and helpers: `src/clickup/client.ts`, `src/clickup/docs-helpers.ts`
- Vendor gating & verification: `src/clickup/vendor-gate.ts`, `scripts/verify-clickup.ts`, `scripts/sync-field-mapping.ts`
- Schema contracts: `integrations/clickup/field-mapping.json`, `integrations/clickup/list-schema.md`, `integrations/clickup/webhook-contract.md`
- Architectural decisions: 004 (Staged Content Quality Workflow), 007 (Tag-Based AI Activity Signaling), 009 (Editorial Doc Pointer Persistence)

## When to use

<Ask the Human: when should an agent reach for this skill?>

## Conventions

<Ask the Human: what did they decide for ClickUp integration — naming, layout, its own rules?>

## What to avoid

<Ask the Human: what should this skill refuse, or never do?>

## How to verify

<Ask the Human: what command or read confirms this skill did its job?>
