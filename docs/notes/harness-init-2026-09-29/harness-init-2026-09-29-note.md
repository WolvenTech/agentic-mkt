---
type: note
title: Harness init 2026-09-29
description: Initial harness setup session for agentic-mkt
status: draft
---

# Harness init 2026-09-29

## Entry integration

Asked whether to fold `WOLVEN.md` into `AGENTS.md` via Light, Full, or Mention-only mode. Recommended Light mode because `AGENTS.md` is a long (388-line), curated file defining canonical guidelines, and Light mode avoids burying existing project rules under router and skills tables. The Human chose Light mode.

Checks raised and resolved:
- Existing `AGENTS.md` content preserved intact; appended the concise `## Wolven harness` section and removed `WOLVEN.md`.
- `CLAUDE.md` already imported `@AGENTS.md`.
- No conflicting routers or standing rules identified.
- Harness-ignored check flagged `.agents/hooks`, `.agents/rules`, `.agents/skills`, and `.claude/skills` excluded by ignore rules in `.gitignore`. Proposed re-include rules appended to `.gitignore`; the Human approved and applied them.
- Doc folders under `docs/` contain only `.gitkeep` placeholders and seeded 000, Record architecture decisions.

## ADR migration

| Number | Title | Legacy status | Mapped status | Evidence | Decision |
| --- | --- | --- | --- | --- | --- |
| 001 | V1 Scope — Happy Path with n8n Orchestration | Superseded by 004; dedup deferral still applies | stable | Body states idempotency/dedup-deferral decision is still source of truth; asserted in tests/contracts/harness.test.ts | Human chose to keep stable as binding decision for idempotency deferral |
| 002 | Agent Config Colocated in agentic-mkt | Accepted | stable | adrs/adr-002.md Status heading | table |
| 003 | Gemini 2.5 Flash as Worker LLM | Superseded — provider is now OpenAI gpt-4.1-mini | stable | adrs/adr-003.md Status heading notes record is kept for provider-agnostic schema and LLM evaluation rationale; no successor ADR written | Human chose to keep stable to preserve evaluation rationale and schema design |
| 004 | Replace Single-Agent Marketing Flow with Staged Content Quality Workflow | Accepted | stable | adrs/adr-004.md Status heading | table |
| 005 | Use Local-First Verification with Live Proof as a Follow-Up Task | Accepted | stable | adrs/adr-005.md Status heading | table |
| 006 | Use Stage-Aware Agent Contracts and Reference Files | Accepted | stable | adrs/adr-006.md Status heading | table |
| 007 | Tag-Based AI Activity Signaling for Staged Columns | Accepted | stable | adrs/adr-007.md Status heading | table |
| 008 | Enforce Exit-Code Contract for Proof and Green-Run Scripts | Accepted | stable | adrs/adr-008.md Status heading | table |
| 009 | Strict Staged Output and Early Editorial Doc Pointer Persistence | Accepted | stable | adrs/adr-009.md Status heading | table |

Relative links were rewritten in all migrated ADRs and referencing caller documents (`integrations/marketing-pipelines/README.md`, `agents/README.md`, `agents/harness/README.md`, `agents/harness/io-contract.md`, `agents/harness/LIVE-PROOF-RUNBOOK.md`, `README.md`). Legacy index `adrs/README.md` was deleted as approved by the Human. All 47 claims resolve cleanly to stable profile ADRs under `docs/adrs/`.

## Discovery

## Research

## Suggestions

## Stubs

## Harness score

## Validate wiring

## Next steps for the Human
