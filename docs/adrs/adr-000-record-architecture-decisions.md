---
type: adr
title: Record architecture decisions as profile ADRs
description: This repo records architecture decisions under docs/adrs/ as profile ADRs; ADR references anywhere in the tree are claims wolven-harness validate checks fail-closed.
status: stable
---

# ADR-000 — Record architecture decisions

## Context

Architecture decisions need a durable, checkable record instead of scattered
prose. Any tracked file can reference a decision as `ADR-NNN` or
`adr-NNN-<slug>`, and readers need to trust that the reference resolves to
something real and current.

## Decision

This repo records architecture decisions as profile ADRs under `docs/adrs/`,
one file per decision, named `adr-NNN-<kebab-slug>.md`, with frontmatter
`type: adr`, `title`, `description`, and `status` (`draft`, `stable`, or
`deprecated`; `superseded_by` required when `deprecated`). `wolven-harness
validate` treats every `ADR-NNN` / `adr-NNN-<slug>` reference in a tracked
file as a claim: it must resolve to exactly one `stable` profile ADR, or the
check fails closed. A reference resolving only to a legacy ADR (one outside
`docs/adrs/`, and not under `archived/`) warns until migrated via the
`harness-init` skill. Exactly one archived legacy ADR warns the same way;
a reference that matches nothing fails.

## Consequences

- Every architecture-decision reference is verifiable, not just documented.
- Adding a decision means adding a profile ADR, not just prose.
- Migrating a legacy ADR into this shape clears its warning and makes its
  claims fail-closed like any other.
