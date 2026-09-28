---
name: code-commit
description: Create Conventional Commits for repo work — invoked directly on an explicit ask, or from code-execute only when the resolved commit-cadence opt says to
---

# Code Commit

Turns a validated, uncommitted change into one or more
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/#summary).
Two entry paths share this contract: a direct commit request, or
`code-execute` invoking it only when the resolved commit-cadence opt says to.

**Consult:** `pragmatic-guard`.
**Invoked two ways:** directly, on an explicit commit request with no gate
involved; or from `code-execute`, after that batch's validate PASS, only when
the resolved commit-cadence opt says to.
**Does not:** push, open a review request, leave review comments, or babysit
a check run — that is `code-pr` / `code-review` / `code-ci`, invoked
separately.
**Atomic gate:** the commit contains the proven work and, when a plan unit is
in scope, **only** that unit's plan-completion mark; a failed commit leaves
the unit incomplete with no false-green checkbox.

**References (read when):**

| File | When to read |
|------|--------------|
| [commit-examples.md](references/commit-examples.md) | Drafting messages, splitting a multi-context change, or applying the atomic plan-mark / failed-commit cleanup |

## Atomic commit gate

Create a Conventional Commit **only after validation has passed**, and when a
plan unit is in scope, land its plan-completion mark in the **same commit**
as the work.

**In / out / handoff:** a validated, uncommitted change (plan Done-when marks
already flipped in the worktree, not yet committed, when a plan unit is in
scope) → one atomic local commit (work + that plan-completion edit) → stop
locally unless a separate, explicit ask to push or open a review request.

**Same-commit rule:**

1. Stage the proven work **and** only the plan-file edit that marks **that**
   unit complete (e.g. the matching Done-when / unit row checkbox in
   `docs/specs/<slug>/<slug>-plan.md`).
2. One commit contains both; never leave the plan-completion mark for a
   later commit, and never flip another unit's checkbox in this commit.
3. A standalone commit with no plan unit in scope skips plan staging — the
   same-commit rule only applies when a plan-completion mark is in scope.

**If the commit fails** (hook reject, empty stage, conflict, abort):

1. The unit remains **incomplete**.
2. Reverse, or otherwise leave incomplete, any plan-completion mark or
   worktree edit the failed attempt introduced — never leave a false-green
   checkbox on the plan.
3. Re-confirm validation before retrying; never claim the unit done from a
   failed commit.

## Hard gates

1. **Non-empty** — real staged/unstaged diffs; never an empty commit.
2. **No secrets** — refuse `.env` files, credentials, tokens, private keys;
   warn if asked to stage one.
3. **Conventional Commits** — `type[(scope)]: summary`, with an optional
   body and footers; the subject says why, not a restated file list.
4. **Validate first** — when invoked from `code-execute`, commit only once
   `harness:validate` (and `harness:comments` for code changes) has passed
   on the batch being committed; never commit on a red run.
5. **Atomic plan completion** — when a plan unit is in scope, its
   plan-completion mark lands in the **same** commit as the proven work; a
   failed commit cleans up any false-green mark it left (see the atomic
   commit gate above).
6. **Git safety** — no `git config` changes; no force-push; no `--no-verify`
   unless explicitly asked; no push (pushing is a separate skill's job).

## When not to use

- Push a branch or open a review request → `code-pr` (a peer skill, not a
  next step this skill chains into).
- Leave comments on an open review → `code-review`.
- Keep a change ready to land → `code-ci`.
- Board / ticket work outside a repo → out of scope for this skill.

**Not a refusal:** a red gate means fix it first — never commit through it;
a standalone commit is still valid whenever explicitly asked.

## Entry modes

| Mode | When | Behavior |
|------|------|----------|
| **From `code-execute`** | Validate PASSed and the resolved commit-cadence opt says to commit — after that unit, or once at a wave gate | One atomic commit: the batch's work plus only that batch's plan-completion mark (split only if the batch clearly holds unrelated contexts) |
| **Standalone** | An explicit "commit this" / "ship this locally" ask, with no gate involved | Inspect the workspace → group the diff into coherent contexts → one or more Conventional Commits |

## Multi-commit heuristics

| Situation | Commits |
|-----------|---------|
| One coherent change, one context | **One** commit |
| A unit's work and its plan Done-when flip | **Same** commit — never split those two |
| Unrelated paths (application code vs scripts vs docs) | **Split** — one commit per coherent context |
| Two unrelated batches of work landed in the same session | **Two** — match the batches unless explicitly asked to squash |
| An unrelated tooling fix alongside a doc-only change | **Split** — e.g. `chore(build): …` vs `docs(specs): …` |
| A pre-commit hook auto-modifies files | Fix, then a **new** commit — never amend a failed hook run |

When in doubt, prefer smaller commits with clear scopes over one vague
message — except never split a unit's work from its matching
plan-completion mark.

## Workflow

### From `code-execute`

1. Confirm `harness:validate` (and `harness:comments` for code changes)
   passed on the batch being committed, and that any plan Done-when marks
   in scope are already flipped in the worktree, uncommitted.
2. `git status` / `git diff` / recent `git log` for message style.
3. Stage only the files that belong to the batch, **plus** the matching
   plan-completion edit for that batch only; exclude secrets and unrelated
   changes.
4. Commit with a HEREDOC message (`feat` / `fix` / `docs` / `chore` / …).
5. On success: confirm `git status` is clean for the staged paths, and that
   the commit's diff holds the work **and only** that plan-completion edit.
6. On failure: reverse or leave incomplete any plan-completion mark from the
   attempt; the unit stays incomplete; re-confirm validation before
   retrying.

### Standalone

1. Inspect status and diffs; group changes into coherent contexts
   (application code vs scripts vs docs, etc.).
2. Confirm groupings and exclusions when ambiguous.
3. For each group: stage → Conventional Commit → verify.
4. Multiple commits are expected when contexts differ — do not squash
   unrelated work into one message.
5. When a plan-completion mark is intentionally included, keep it atomic
   with its work.

## Message shape

```text
type(optional-scope): short summary

Optional body — why, not a file list.
```

Inline samples — full good/bad set in
[commit-examples.md](references/commit-examples.md):

```text
fix(billing): stop double invoice retries on webhook replay

The webhook handler re-queued a retry every time the payment provider
resent an already-processed event. Retries are now keyed by the
provider's idempotency id, so a replay is a no-op.
```

```text
fix(export): reject a CSV row with a missing currency code
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`,
`style`, `perf`.

## Pragmatic-guard

Refuse an empty commit, staging a secret, committing on a failed
validation, rewriting shared history, inventing a second commit skill,
leaving a false-green plan checkbox after a failed commit, and splitting a
unit's work from its matching plan-completion mark.

## Anti-patterns

- Subject restates the diff's file list instead of the why
- One commit mixing an unrelated tooling change with unrelated feature work
- An empty commit, or a commit with nothing staged
- Committing after a failed validation
- A plan unit marked complete in a different commit than its proven work
- A commit fails but the plan still shows the unit `[x]` / done
- Flipping another unit's plan checkbox in this unit's commit
