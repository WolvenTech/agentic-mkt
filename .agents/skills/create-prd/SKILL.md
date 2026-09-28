---
name: create-prd
description: Grill a problem to one confirmed statement, challenge its key terms against local docs, draft a lean PRD with user stories and Given/When/Then acceptance, and move it from draft to stable only on explicit approval
---

# Create PRD

Turns a rough ask into one lean PRD: a single problem statement, goals, user stories with acceptance, scope, and open questions. Nothing else.

**Entry.** Start from any ask, issue, or notes the Human points to. There is no required prior artifact — a plain description of the problem is enough to begin grilling it.

## Workflow

### 1. Grill the problem

Before anything else, run `grilling` on the problem, with no cap on the number of questions. Start the tree from who hurts, what the pain is, why now, and what evidence backs it, and keep going until there is one problem: one set of users and one pain.

If the grilling surfaces a second problem, split it into its own PRD or park it under Open questions — do not fold two problems into one draft.

Stop grilling only when you can state the problem in one sentence and the Human confirms it. Anything still unanswered goes under Open questions rather than being invented.

### 2. Term challenge

Check the key terms the problem statement introduces against the local docs and any recorded architecture decisions — search first before asking or guessing. Reuse a name that already exists rather than coining a new one. When a term genuinely has no existing name, record it at its first use in the PRD instead of writing a separate glossary.

### 3. Draft

Write the PRD from `references/prd-template.md` to `docs/prds/<slug>/<slug>-prd.md`, with `status: draft`. Fill every section; leave nothing as the template's placeholder text.

### 4. Approve

Revise the draft in place until the Human approves it, then change `status` from `draft` to `stable`. Only the Human's explicit word moves the status — a quiet absence of objection is not approval.

The approved PRD becomes `code-spec`'s input. Approval locks the requirements; it does not authorize writing code.

### 5. ADR offer

If the PRD settles a decision that should outlive this one change — a durable choice about architecture, a dependency, or a convention — offer to record it with the `adr` skill. The PRD itself states requirements; it is not the decision record.

## Template sections

`references/prd-template.md` has six sections, in order: `## Problem` (who hurts, the pain, why now, and the evidence), `## Goals` (each with an observable success signal, plus non-goals), `## User stories` (`US-<n>` in As a / I want / so that, each followed by `AC-<n>.<m>` acceptance in Given / When / Then, covering its happy path and at least one edge or error case, and tracing back to a goal), `## Scope` (in and out), `## Open questions` (each with an owner, or "None"), and `## Handoff`.

## Lifecycle

`draft` moves to `stable` only on the Human's approval (step 4). At pre-merge closure, `code-pr` moves the whole PRD folder to `docs/prds/archived/<slug>/` with `status: deprecated`; that move is not this skill's job.

## Refuses

- Scoring or classifying how complicated the problem is before drafting.
- A field naming who or what carries out the resulting work.
- Handing the PRD to an external tracker, or writing steps shaped like its cards.
- Implementation detail — how the code will be built belongs in `code-spec`, not here.
- Emitting the stories or their acceptance as separate files instead of PRD sections.

## Anti-patterns

- Drafting before the problem statement is confirmed, or before a surfaced second problem is split out.
- Reusing a borrowed term without checking it against local docs first.
- Setting `status: stable` without the Human's explicit approval.
- Treating an approved PRD as permission to start writing code.
- Padding a user story with a persona-only acceptance line that never says Given/When/Then.
