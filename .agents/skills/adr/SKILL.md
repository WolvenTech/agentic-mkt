---
name: adr
description: Create, promote, and supersede architecture decision records under docs/adrs/, repointing claims when one supersedes another
---

An architecture decision record (ADR) is a durable, checkable record of one architecture decision — not a meeting note or a spec appendix. Any tracked file can reference a decision as `ADR-NNN` or `adr-NNN-<slug>`, and `harness:validate` treats every such reference as a claim: it must resolve to exactly one `stable` ADR under `docs/adrs/`, or the check fails closed. This skill is the only place decisions are created, promoted, or superseded — never hand-edit an ADR's `status` outside these three operations.

This skill only produces ADRs in the shape `harness:validate` checks. Migrating an older, differently-shaped decision record into this shape is a separate initialization step, not this skill's job.

## Numbering and shape

- Path: `docs/adrs/adr-NNN-<slug>.md` — flat, no folder per decision.
- `NNN` is the next free three-digit number: list the files already under `docs/adrs/`, read the number out of every name matching `adr-NNN-<slug>.md`, and use one more than the highest you find. Never reuse or skip a number, even if an old decision was later deprecated.
- `<slug>` is a short kebab-case name for the decision, chosen from its title.
- Frontmatter: `type: adr`, `title`, `description`, `status` (`draft`, `stable`, or `deprecated`), and `superseded_by` (the superseding ADR's filename without `.md`, required only once `status` is `deprecated`).
- Body follows [`references/adr-template.md`](references/adr-template.md): `## Context`, `## Decision`, `## Consequences`.

## Create

1. Work out the next free number and a slug for the decision (see above).
2. Render [`references/adr-template.md`](references/adr-template.md) into `docs/adrs/adr-NNN-<slug>.md` with `status: draft` and the Context / Decision / Consequences sections filled in.
3. Run `harness:validate`.

A `draft` ADR is not yet a citable decision: nothing else in the tree should reference its `ADR-NNN` or `adr-NNN-<slug>` yet, because a claim against a `draft` ADR fails `harness:validate`. Wait for promotion before pointing anything at it.

## Promote

1. Only once the Human confirms the decision as written — never on your own judgment.
2. Change the ADR's `status` from `draft` to `stable`, leaving the rest of the file as written.
3. Run `harness:validate`.

Only after this step may other files cite the ADR's `ADR-NNN` or `adr-NNN-<slug>`.

## Supersede

A newer decision replaces an older one. Do this as one pass, not two separate sessions with the tree left inconsistent in between:

1. Create the new ADR (Create, above) and promote it to `stable` once the Human confirms it (Promote, above).
2. Set the old ADR's `status` to `deprecated` and add `superseded_by: <new-adr-filename-without-.md>`.
3. Repoint every existing `ADR-<old-NNN>` and `adr-<old-NNN>-<old-slug>` claim elsewhere in the tree to the new ADR's number and slug. Do this before or together with step 2: a claim still pointing at the deprecated ADR fails `harness:validate`, and so does a claim moved to the new ADR while it is still `draft`.
4. Run `harness:validate`.

## Anti-patterns

- Promoting an ADR without the Human's explicit confirmation.
- Citing a new ADR's `ADR-NNN` anywhere before it is `stable`.
- Deprecating the old ADR before every claim against it is repointed, or repointing claims to a new ADR that is still `draft`.
- Skipping `harness:validate` after create, promote, or supersede.
- Reusing a number, or renumbering an existing ADR.
- Treating this skill as the place to migrate a decision record that predates the profile shape.
