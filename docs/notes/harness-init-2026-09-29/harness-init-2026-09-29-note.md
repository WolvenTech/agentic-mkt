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

## Discovery

## Research

## Suggestions

## Stubs

## Harness score

## Validate wiring

## Next steps for the Human
