---
type: note
title: Harness init 2026-09-28
description: Record of the harness-init run that set up the Wolven harness in this repo.
status: draft
---

# Harness init 2026-09-28

## Entry integration

Mode: **light**, chosen because `AGENTS.md` was a long, curated policy file.
The `## Wolven harness` block was appended and `WOLVEN.md` deleted.

Checks raised:

- **`CLAUDE.md`** already imported `AGENTS.md`; no change.
- **Harness paths ignored** (`.agents/skills`, `.agents/rules`,
  `.agents/hooks`, `.claude/skills`). The Human chose to carve them out:
  re-include rules appended to `.gitignore`, existing ignore lines kept.
- **Overlap: adapters never versioned.** `AGENTS.md` said `.agents/` and
  `.claude/` are never versioned. Amended to name the four harness paths as
  the one versioned exception, with a new source-of-truth row and corrected
  `check-ignore` validations.
- **Overlap: adapters must not define policy.** The Human chose to have
  `AGENTS.md` adopt the three standing rules by reference.
- **Overlap: deferral location.** The Human chose to drop Compozy entirely:
  the harness is the only planning tooling. Removed the `.compozy/` row,
  rule section, ignore line, boundary mention, and README lines; the
  `defer` cleanup category now records to `docs/deferrals/`. Task-ID
  implementation notes were rewritten to the verified state: the CI bypass
  rejection is done; `deploy-workflows.ts` and `inspect-executions.ts` call
  `runGate()` but `green-run.ts` and `verify-clickup.ts` do not; the
  gitleaks CI step is absent.
- **Existing doc folders:** only harness-written content; nothing to
  reshape.
- **Noted for step 1:** the `.gitignore` row in `AGENTS.md` cites legacy
  002 for adapter ignore rules, but 002 decides agent-config colocation.

## ADR migration

Pending.

## Discovery

Pending.

## Research

Pending.

## Suggestions

Pending.

## Stubs

Pending.

## Next steps for the Human

Pending.
