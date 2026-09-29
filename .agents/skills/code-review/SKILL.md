---
name: code-review
description: Review an open PR's diff against the refs its description cites, and post blocking or nit findings — never merging
disable-model-invocation: true
---

# Code Review

Reads an open PR the way a reviewer would: the PR's own description, the
refs it cites, and the diff — then posts grounded findings. It never
merges, never fixes code, and never replies to or resolves a thread; that
follow-through belongs to `code-ci`, on its own explicit ask.

**Consult:** `pragmatic-guard`.
**Input:** an open PR (URL or number) whose description cites the refs it
implements.
**Does not:** implement fixes, open a PR, reply to or resolve a thread,
merge, enable auto-merge, or read merge settings.

**References (read when):**

| File | When to read |
|---|---|
| [review-criteria.md](references/review-criteria.md) | Before finding anything — axes, blocking vs nit, the citation rule |
| [host operations](../code-pr/references/host-operations.md) | Reading the PR and diff, listing unresolved threads, or posting a comment |

## Ask-only

Runs only on an **explicit** ask for a review. Nothing else in this bundle
invokes it automatically — not after `code-execute`, `code-commit`, or
`code-pr` finishes.

## Grounding

1. Read the PR and diff (read PR and diff — host operations).
2. Read every ref the PR body cites: a spec
   (`docs/specs/<slug>/<slug>-spec.md`), its plan
   (`docs/specs/<slug>/<slug>-plan.md`), a PRD
   (`docs/prds/<slug>/<slug>-prd.md`), and any ADR it names
   (`docs/adrs/adr-NNN-<slug>.md`).
3. List unresolved threads (host operations) so a new finding never repeats
   one that is already open.
4. Judge the diff against what those refs promise — not against personal
   taste or scope the refs never named.

A finding with no cited diff line and no ref it violates is not posted.

## Findings

Every finding carries exactly one label:

| Label | Meaning |
|---|---|
| **Blocking** | Breaks a cited obligation, a missing test for changed behavior, or a correctness / security problem |
| **Nit** | Style, naming, or an optional cleanup — merge is fine without it |

Each finding names a file:line and a one-line why, tied to the diff line or
ref it comes from. Post it with **post a review comment** (host
operations).

See [review-criteria.md](references/review-criteria.md) for the full axis
list and severity rules.

## Never merges

This skill never merges, approves-and-merges, or enables auto-merge, and
never reads a host's merge settings. Its output is a set of posted
findings plus a verdict — advice for whoever owns the merge, not authority
to perform one.

## Hard gates

1. **Explicit ask** — no auto-run after `code-pr`, `code-execute`, or
   `code-commit`.
2. **Cited grounding** — read the PR, its cited refs, and the diff before
   finding anything.
3. **No uncited findings** — a finding needs a diff line or a ref it
   violates.
4. **Blocking vs nit** — every finding carries one label.
5. **Never merge** — no merge, no auto-merge, no reading merge settings.
6. **No fixes, no thread follow-through** — this skill posts findings; it
   does not edit code, reply to a thread, or resolve one. That
   follow-through is `code-ci`.

## When not to use

- Push a branch or open a PR → `code-pr`.
- Commit → `code-commit`.
- Reply to or resolve a thread, or otherwise drive a PR to merge-ready →
  `code-ci`.
- No explicit review ask → do not invoke this skill.

## Workflow

1. Confirm the explicit ask.
2. Read PR and diff (host operations).
3. Read every ref the PR body cites.
4. List unresolved threads (host operations) to avoid duplicating an open
   finding.
5. Read [review-criteria.md](references/review-criteria.md); classify each
   finding blocking or nit.
6. Post each finding — post a review comment (host operations) — with
   file:line, label, and a one-line why tied to a ref or diff line.
7. End with a verdict (approve-with-nits / request-changes / needs-the-human)
   — never a merge.

## Anti-patterns

- Posting a finding with no cited ref or diff line
- An unlabeled finding (missing blocking / nit)
- Merging, approving-and-merging, or enabling auto-merge from this skill
- Fixing the code, replying to a thread, or resolving a thread instead of
  naming `code-ci`
- Duplicating a finding an unresolved thread already has open
- Running without an explicit ask
