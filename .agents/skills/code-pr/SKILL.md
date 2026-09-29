---
name: code-pr
description: Push the branch and open or amend a pull request for the current state, titled as a Conventional Commit and filled from the body template — ask-only, and it never merges
disable-model-invocation: true
---

# Code PR

Pushes the branch and opens or amends a pull request for whatever is on it
right now — a create when this head has no open PR, an amend when it does.
Ask-only: `disable-model-invocation: true` stays set, and nothing merges
from here.

**Consult:** `pragmatic-guard`.
**Body template:** [pr-body-template.md](references/pr-body-template.md).
**Closure (last batch before merge):** [pre-merge-closure.md](references/pre-merge-closure.md).
**Host operations:** [host-operations.md](references/host-operations.md) — every host action this skill performs (push branch, open PR, read PR and diff) goes through that table; its MCP tool is tried first, with a silent fallback to the row's other route.

## When not to use

- Local commit only, no remote pull request → `code-commit`.
- Leave findings or reply on review threads → `code-review`.
- Babysit checks and conflicts to a merge-ready state → `code-ci`.

**Not a refusal:** partial work, a docs-only diff, or open plan units still
get a create or amend with the current state — never refuse, and never wait
for more work to land first.

## Hard gates

1. **Explicit ask** — run only when asked directly for a pull request; never
   as the automatic last step of another skill.
2. **Current state, not full scope** — open or amend for what the branch
   holds now, whether that is a docs-only change, partial work, or a
   finished piece. Never refuse because an earlier step was skipped, and
   never implement missing work instead of opening the PR.
3. **Branch first** — on a detached checkout or the repository's default
   branch, create or check out a feature branch before doing anything else;
   never open a pull request from the default branch.
4. **Commit when needed** — if the tree has uncommitted in-scope changes,
   commit them via `code-commit` before pushing; leave out unrelated dirty
   files and never stage a secret.
5. **Push every run** — push branch (host operations), every time this
   skill runs, not only when the branch is new. A branch that already
   tracks a remote can still hold unpushed local commits.
6. **Find before open** — read PR and diff (host operations) to list open
   pull requests whose head is this branch. Zero → create. One → amend it;
   never open a second. More than one → stop and ask.
7. **Title** — always Conventional Commits shape, `type(scope): summary`.
   A host that squash-merges takes the pull request title as the resulting
   commit's subject, so the title carries that meaning on every host; make
   no other assumption about how a host merges.
8. **Read before rewrite** — on amend, read the pull request's current
   title, body, and comments (read PR and diff — host operations) before
   replacing anything.
9. **Fill the template** — [pr-body-template.md](references/pr-body-template.md)
   in full; short Overview/What/Why/How, no path dump.
10. **Checkbox reset** — write every template checkbox as `[ ]` first, then
    tick only what this session's evidence supports. Never copy ticks
    forward from a prior body. Pre-merge closure boxes stay unchecked
    unless closure already ran on this branch.
11. **Pre-merge closure is not a precondition** — it is not needed to
    **open** or **amend** a pull request; it is needed only to claim
    merge-ready or to tick a closure checkbox in the body. A docs-only
    change, a partial wave, or a mid-initiative state still gets a create
    or amend with pre-merge closure left unchecked.
12. **Real evidence** — Verification & Testing and the Checklist cite
    commands actually run this session on this diff; N/A is valid only for
    a docs-only change with no gate to run.
13. **Create or amend, never a second PR** — open PR (host operations)
    creates when none exists; the same operation's amend path is how an
    existing pull request's title and body get updated. Return the PR URL.
14. **Never merge** — no merge, no enabling auto-merge, no reading merge
    settings, and no reply on review threads — that belongs to a review or
    check-babysitting skill.

## Workflow

1. **Snapshot** — check status, diff, and this branch against the resolved
   base, to know what the pull request will actually contain; set aside
   unrelated dirty files.
2. **Branch** — on a detached checkout or the default branch, create or
   check out a feature branch for this work.
3. **Commit** — when uncommitted in-scope changes remain, commit them via
   `code-commit`. Skip when the tree is already clean.
4. **Push** — push branch (host operations). Run this whenever step 3
   committed anything, and also when local commits are already ahead on an
   existing branch; skip only when nothing new is local.
5. **Resolve base** — default to the repository's default branch unless
   told to target another.
6. **Find** — read PR and diff (host operations) to list open pull requests
   whose head is this branch. A named PR number or link overrides the
   search. Zero → create. One → amend. More than one → stop and ask.
7. **Read before rewrite** — on amend, load the current title, body, and
   comments (host operations); rewrite the body from that plus the latest
   diff and this session's evidence. On create, draft straight from the
   template and the latest state.
8. **Lean fill** — keep every template section; short Overview/What/Why/How
   describing the actual diff, never a path dump.
9. **Verification & Testing** — commands run on this diff this session, or
   N/A with a stated reason for a docs-only change.
10. **Checkbox reset** — every box starts `[ ]`; tick only from this
    session's evidence. Leave pre-merge closure unchecked unless it already
    ran on this branch.
11. **Create or amend** — open PR (host operations): create a new pull
    request, or update title and body on the one found. Never open a
    second pull request for the same head. Print the PR found or created
    and the resolved base, and return the PR URL.
12. **Stop** — no review, no check-babysitting, no merge, no reply on
    review threads, and no pre-merge closure unless separately asked.

## EXAMPLE — filled verification (a feature PR, current state)

**Title:** `feat(auth): add passwordless email sign-in`

**Verification & Testing (filled — do not leave blank):**

```markdown
## Verification & Testing
- **Tests Run:** `npm run harness:validate`; the project's test command
  (e.g. `npm test`)
- **Test Coverage:** New sign-in flow covered by its own test file
- **How Verified:** `npm run harness:validate` → exit 0; the project's
  test suite → all green; manually exercised the sign-in link in a local
  build

## Checklist
- [x] Tests pass locally (`npm test`)
- [x] Documentation updated (README sign-in section)
- [x] No unrelated changes included
```

**Risk & Reviewer Notes:** Medium — touches the session-cookie path; low
risk everywhere else.

Ticked boxes in this example are **after** checkbox reset — start from
`[ ]`, then retick only from this session's evidence.

## Pragmatic-guard

Refuse auto-merge, inventing a body shape other than the template, opening a
pull request with no explicit ask, opening a second one when this head
already has an open pull request, a path dump in Overview/What/Why/How, an
empty Verification section when a gate actually ran, a merge-ready claim
while pre-merge closure boxes are unticked, and replying on review threads.

## Anti-patterns

- Refusing to open a PR because an earlier step was skipped or the work
  is incomplete
- Implementing missing work instead of opening the PR with current state
- Running pre-merge closure before the branch is actually merge-ready
- An unticked Verification checklist with no narrative when a gate ran
- "Tests pass" with no command or session evidence named
- Opening a second pull request when one already targets this head
- Copying checkbox ticks from a prior body instead of a checkbox reset
- A path dump in Overview/What/Why/How
- Replying on review threads from this skill
- Merging, enabling auto-merge, or marking a pull request ready to merge
