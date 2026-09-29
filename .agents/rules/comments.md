---
description: Comment style for added lines — why, not what; a better name over a comment; run the comments command before handing work back.
alwaysApply: true
---

# Comment style

A comment earns its place by carrying information the code cannot. Prefer a
better name, a clearer type, or an extracted step to a comment that restates
what the next line already says.

## Rules for an added comment

- State **why**, not what: the reasoning, the hazard, or the invariant a
  reader could not otherwise recover from the code.
- Tag it `why:`, `hazard:`, or `invariant:`, or write it as a `/** */` block
  directly above the declaration it documents.
- Keep it to four lines or fewer.
- Never narrate the change (no "used to", "previously", "the old approach").
- Never cite a ticket or requirement id, a review thread, or anything else
  that lives only in planning documents outside this repository — a reader
  of the code alone must be able to make sense of it.

## Before handing work back

Run `harness:comments` (`wolven-harness comments`). It judges every comment
line added since the base ref against these rules, prints each finding, and
exits non-zero if any line breaks them.
