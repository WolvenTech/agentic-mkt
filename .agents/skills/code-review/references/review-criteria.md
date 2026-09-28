# Review criteria (code-review)

Generic axes and severity rules for a grounded review. Judge the diff
against what the PR's cited refs promise — never against personal taste.

## Citation rule

A finding is posted only when it names a file:line in the diff and either:

- quotes or points at the diff line the problem is in, and/or
- names the ref (spec, plan, PRD, or ADR) whose obligation it violates.

No cited diff line and no cited ref → the finding is dropped, not posted.

## Axes

| Axis | Question |
|---|---|
| **Correctness** | Does the changed code do what it claims, including edge cases? |
| **Obligations vs. the spec's proofs** | Does the diff satisfy the obligations the cited spec names, and its named proofs? |
| **Tests for changed behavior** | Does a changed or new behavior have a test that would fail without the fix? |
| **Comment rule** | Is every finding a cited file:line plus a one-line why — not an uncited hunch? |
| **Secrets** | Any credential, token, or private key added to the diff? |
| **Doc-folder layout** | Any doc path the diff adds or touches (a spec, plan, PRD, note, or deferral) follows the slug-folder layout; an ADR stays flat at `docs/adrs/adr-NNN-<slug>.md` |
| **ADR claims** | Any `ADR-NNN` / `adr-NNN-<slug>` token the diff adds resolves — checked by `harness:validate`, not by eye |

## Severity

| Label | Meaning | Effect |
|---|---|---|
| **Blocking** | Breaks a cited obligation, a missing test for changed behavior, a secret in the diff, or a correctness bug | Must be addressed before merge |
| **Nit** | Style, naming, or an optional simplification | Merge is fine without it |

Prefer few, high-signal blocking findings over a pile of nits.

## Verdict

| Verdict | When |
|---|---|
| **Approve with nits** | Every cited obligation is met; only nits remain |
| **Request changes** | At least one blocking finding |
| **Needs the Human** | Security, a data-loss risk, or a conflict between two cited refs — outside this skill's judgment |

The verdict is advice. This skill never merges, approves-and-merges, or
enables auto-merge regardless of the verdict.

## What this skill does not do

- Fix the code — that's the diff's author, or a separate ask.
- Reply to or resolve a thread, or otherwise drive the PR to merge-ready —
  that's `code-ci`.
- Merge, approve-and-merge, or enable auto-merge.

## Anti-patterns

- Blocking on a formatting-only diff
- Approving without reading the cited refs
- A finding with no file:line and no cited ref
- Demanding scope the cited refs never promised
- Treating a verdict as merge authority
