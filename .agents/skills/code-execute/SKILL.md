---
name: code-execute
description: Execute ordered work units from a locked plan in-repo — implement, validate, then invoke code-commit only when the resolved commit-cadence opt says to; PRs, reviews, and CI babysitting are always a separate ask
---

# Code Execute

Runs a plan's work units end-to-end: implement, validate, update the
plan's own resume record, and invoke `code-commit` only when the resolved
commit-cadence opt says to. This skill never opens a PR, leaves review
comments, or babysits CI; `code-pr`, `code-review`, and `code-ci` run only
when asked for separately.

**Consult:** `pragmatic-guard`, `code-commit`.
**Input:** `docs/specs/<slug>/<slug>-plan.md` (+ its spec) when a plan
exists — a one-file change can skip straight here with `harness:validate`.
**Validate:** `harness:validate` before any commit, asked for or automatic.

**References (read when):**

| File | When to read |
|---|---|
| [builder-brief.md](references/builder-brief.md) | The unit's `Subagent` cell reads `spawn` — fill it in for that unit and paste it as the subagent's prompt |

**In / out / handoff:** an approved unit and its frozen obligations →
validated work with the plan's resume section refreshed → `code-commit`
invoked only when the resolved commit-cadence opt says to; otherwise the
work stops, uncommitted, ready to be asked for.

## Frozen obligations

Execute against the obligations frozen in the plan and its spec. Do not
redefine requirements, invent acceptance, or "fix" gaps while executing.
Verify every Done-when item with evidence before marking a unit complete.

## Resume record

The resume record for a unit in flight is an **inline execution/resume
section** written directly into `docs/specs/<slug>/<slug>-plan.md` — the
plan file is the only place it lives. Do not open a separate directory or
file to track it; there is nowhere else to look for where execution left
off.

Reconcile this record against git state **before any mutate**, and again
whenever a unit is resumed.

### Seven resume fields (mandatory)

Write or refresh all seven fields in the plan's inline execution/resume
section before touching any file:

| # | Field | What to record |
|---|-------|-----------------|
| 1 | **Unit identifier** | Number + title (frontier position if useful) |
| 2 | **Spec/plan paths** | `docs/specs/<slug>/<slug>-spec.md` + `docs/specs/<slug>/<slug>-plan.md` |
| 3 | **Obligation / proof status** | Frozen obligation ids from the plan + pending\|done\|fail\|blocked |
| 4 | **`HEAD` commit** | Short SHA from `git rev-parse --short HEAD` |
| 5 | **`git status` summary** | clean \| dirty (+ whose paths: this unit's Owns vs unrelated) |
| 6 | **Intended diff scope** | Expected paths for this unit (matches Owns) |
| 7 | **Decision on every discrepancy** | resolved / escalated / none — never left undecided |

All seven fields must be present, git inspection must match the `HEAD` and
status fields, and every discrepancy needs an explicit decision before any
Done-when item is marked complete.

### Example inline section (shape only)

```markdown
## Execution / resume section

### Unit <N> — <title>

| Field | Value |
|-------|-------|
| Unit | <N> — <title> |
| Spec / plan | `docs/specs/<slug>/<slug>-spec.md` / `docs/specs/<slug>/<slug>-plan.md` |
| Obligations | <obligation-ids> — <status> |
| `HEAD` | `<short-sha>` |
| `git status` | clean \| dirty — <summary> |
| Intended diff | `<owns-paths>` |
| Discrepancies | None \| <decision per item> |
```

### Isolation / escalate (dirty or multi-unit)

When **more than one unit** is in flight, or `git status` shows
**unrelated dirty paths** (outside this unit's Owns):

1. **Isolate** — work only on Owns paths; do not "helpfully" touch a
   foreign dirty file.
2. **Or escalate** — stop and ask once before mutating, when isolation is
   unsafe (overlapping Owns, conflicting uncommitted work, unclear
   ownership).
3. Do not paper over unrelated dirt by starting a side file or directory
   to hold state instead.

Any Done-when item without evidence stays incomplete.

## Consumer opt (commit cadence)

Read `.agents/code-commit.config.yml` before mutate. An absent file, or an
absent key, takes that key's default: `autocommit: false`,
`autocommit-rule: wave`. A value outside `true`/`false` (for `autocommit`)
or `unit`/`wave` (for `autocommit-rule`) is **fail-closed** — stop; do not
guess and do not commit; name the bad key and the value that was read.

The pre-start print states the resolved `autocommit` and `autocommit-rule`
values, whether they came from the file or from a default.

| `autocommit` | `autocommit-rule` | Execute path |
|---|---|---|
| `false` | ignored | Skip `code-commit`. Work stays uncommitted, ready to be asked for. |
| `true` | `unit` | After that unit's validate PASS, invoke `code-commit` once for that unit's work plus its plan-completion mark. |
| `true` | `wave` | Do not commit per unit. After the wave gate's validate PASS, invoke `code-commit` once for that wave's proven work plus those units' plan-completion marks. |

- No plan in scope: no automatic commit; an explicit standalone commit ask
  still runs `code-commit` directly, whatever the opt says.
- A batch's plan-completion marks flip in the worktree immediately before
  that batch's commit; a failed commit leaves those marks incomplete.
- Validate red: never commit, on any cadence.
- `init` ships no config file, so an unconfigured consumer keeps a person
  in the loop at the `false` / `wave` defaults.

## Subagent dispatch (plan's Subagent column)

Honor the unit's `Subagent` value exactly as the plan states it — see
`code-plan`'s Subagent column:

| Subagent | Action |
|---|---|
| `spawn` | Spawn a subagent, in whatever runtime is available, with [builder-brief.md](references/builder-brief.md) — filled in for this unit — as its prompt |
| `inline` | Implement the unit directly in the current session; no subagent |

No line-count rule and no default value: every unit already names one value.
A plan row that omits it is incomplete — send it back to `code-plan`
rather than guessing, and never invent a third value.

Before pasting the brief, fill in every placeholder — the unit row, its
Owns and must-not-touch paths, the spec/plan paths, and the wave's gate
command — with this unit's real values. The brief is a paste-in prompt
for the subagent's turn, not a registered persona file.

## Final check (mandatory, paste both outputs)

Whether a unit ran inline or as a spawned subagent, before that unit — and
again at every wave gate — run:

```sh
npm run harness:comments   # or: pnpm harness:comments, yarn harness:comments
npm run harness:validate   # or: pnpm harness:validate, yarn harness:validate
```

and paste both outputs. A spawned subagent already carries this
instruction in [builder-brief.md](references/builder-brief.md) and pastes
its own outputs back in its return. The parent re-runs the same final
check over the **whole repo** again at every wave gate, even when every
unit in the wave already passed it individually — a later unit in the
same wave can reintroduce a hit an earlier, narrower check missed.

## Hard gates

1. Follow the plan frontier (or an explicit single-unit ask).
2. **Frozen obligations** — execute the plan/spec contract; do not
   redefine requirements mid-unit.
3. **Resume reconciliation** — seven-field inline section in the plan
   **before mutate**; an undecided discrepancy stops the unit.
4. Produce real diffs / evidence before claiming done.
5. **Validate before commit** — `harness:validate` PASS is required before
   `code-commit` is invoked or even asked for; never claim done on a red
   gate.
6. **Plan mark lands in the same commit** — the batch's plan-completion
   marks flip immediately before its commit, so one commit carries both
   the mark and the proven work; if the commit does not succeed, the
   marks go back to unchecked.
7. **Commit only on cadence** — invoke `code-commit` only when the
   resolved `autocommit` / `autocommit-rule` opt says to; never guess past
   a value outside the two known enums; never invoke `code-pr`,
   `code-review`, or `code-ci` on its own — each of those three runs only
   on an explicit ask.
8. **Verify-before-claim** — no done/shipped without fresh in-session
   evidence.
9. **No side directories** for resume state — the plan file is the only
   record of where execution stands.

## When NOT to use

- Locking requirements or unit order — `code-spec` / `code-plan`.
- A standalone commit with no plan unit in scope — `code-commit` directly.
- Opening a PR — `code-pr`.
- Leaving review comments on a PR — `code-review`.
- Babysitting conflicts / comments / CI to merge-ready — `code-ci`.
- Speculative "might need" scope — `pragmatic-guard` refuse + deferral.

## Pre-start print (before mutate)

Before editing files, print:

1. **Unit** — number, title, frontier position
2. **Assumptions** — spec/plan paths, wave stop in effect
3. **Files to touch** — expected Owns paths
4. **Disposition** — `spawn` | `inline`, read from the plan's Subagent
   column
5. **Done when** — copy from the plan (checklist below)
6. **Validate** — `harness:validate` (plus any unit-named check) that must
   PASS before a commit is invoked or even asked for
7. **Resume** — confirm the seven-field execution/resume section is
   present and refreshed in the plan
8. **Resolved opt** — the `autocommit` and `autocommit-rule` values read
   from `.agents/code-commit.config.yml`, or their defaults when the file
   or a key is absent

If any item is ambiguous, ask once — then proceed.

## Done-when checklist (print before implement)

Copy the unit's Done when into a checklist; tick only with evidence:

```markdown
- [ ] <requirement 1 from the plan>
- [ ] <requirement 2>
- [ ] `harness:validate` PASS
- [ ] Real diff exists (not empty-diff done)
- [ ] Resume reconciliation — seven fields present in the plan's inline section
```

Do not mark done until every item has in-session proof.

## Workflow

### 1. Pull unit + reconcile resume

Claim the next frontier unit (or a named unit). Run the pre-start print
and the Done-when checklist. Before any mutate, refresh the plan's inline
execution/resume section with the seven fields; reconcile declared
obligations against the worktree and diff vs `HEAD`. On an undecided
discrepancy, unrelated dirty paths that cannot be isolated, or an
incomplete resume field — stop (isolate or escalate). Do not invent
requirements to close a gap.

### 2. Implement (per the Subagent dispatch above)

Smallest change that satisfies Done when; match repo style. `spawn`
pastes the filled-in [builder-brief.md](references/builder-brief.md);
`inline` implements directly in this session, applying the same rules the
brief states (edit only this unit's Owns; tests only — no build, commit,
or push; report anything outside Owns instead of fixing it).

Parallel units may be running in the same repo. Before spawning, tell the
subagent: the unit's Owns and must-not-touch paths, what has already
landed on the branch, and that other units may be running at the same
time on disjoint paths.

### 3. Validate (verify-before-claim)

Run the unit's checks, then the [final check](#final-check-mandatory-paste-both-outputs)
above. Fix failures; do not suppress a gate. If validate fails, stop — do
not mark the unit done and do not invoke `code-commit`.

Iron law: no "done", "shipped", or "PASS" claim without fresh command
output from this session.

### 4. Mark the batch done (immediately before its commit)

Once the batch the resolved cadence will commit passes its checks
(including the final check, re-run over the whole repo at a wave gate):
flip that batch's Done-when marks in the plan, in the worktree. This edit
is not committed yet — it lands together with the work in the next step.

- `true` + `unit` — this unit only, right after that unit's PASS.
- `true` + `wave` — those wave units, once at the wave gate after PASS, not
  per unit.
- `false`, or no plan in scope — skip this step; there is no commit to
  pair it with.

### 5. Commit (opt cadence, only after PASS, plan mark included)

Invoke `code-commit` only when the resolved opt says to; do not invent a
parallel commit path here.

- `autocommit: true`, `autocommit-rule: unit` — after that unit's validate
  PASS: one commit of that unit's work plus its plan-completion mark.
- `autocommit: true`, `autocommit-rule: wave` — once at the wave gate after
  PASS, not per unit: one commit of that wave's proven work plus those
  units' plan-completion marks.
- `autocommit: false` — skip `code-commit`; state that it is ready to be
  asked for; the work stays uncommitted.
- No plan in scope — no automatic commit; a standalone ask still runs
  `code-commit` directly.

If the commit does not succeed (hook reject, empty stage, conflict,
abort): undo the plan-mark edit from step 4 — never leave a green
checkmark describing work the repo does not contain. Fix the underlying
issue and retry from validate.

Pull the next frontier unit once the batch is settled.

Stop here unless explicitly asked for `code-pr`, `code-review`, or
`code-ci`.

## Pragmatic-guard

Refuse a TLC-style execute dump, independent-verifier ceremony, an empty
"done" claim with no diff, a hardcoded per-unit commit when the resolved
cadence says otherwise, auto-chaining PR / review / CI after every unit,
redefining frozen obligations mid-execute, guessing past an unknown
`autocommit` / `autocommit-rule` value, and opening a side directory to
hold resume state.

## Anti-patterns

- **Empty diff done** — claiming complete with zero file changes
- **Claim before validate PASS** — treating red as shippable
- **Resume without seven fields** — mutating before the inline plan
  section is complete
- **Undecided discrepancy** — continuing past dirty, unrelated work
  without isolating or escalating
- **Redefine mid-execute** — inventing requirements instead of reconciling
  to the frozen plan/spec
- **Complete without evidence** — a green mark with no proof of the work
- **Plan mark split from the commit** — flipping the plan mark in a
  different commit than the work, or leaving it flipped after a failed
  commit
- **Guessing a blank Subagent cell** instead of sending the plan back
- **Hardcoded per-unit commit** — invoking `code-commit` after every unit
  when the resolved opt is `wave` or `false`
- **Guessing a bad enum** — continuing past an unknown `autocommit` /
  `autocommit-rule` value instead of failing closed
- Auto-chaining `code-pr`, `code-review`, or `code-ci` after every unit
- Skipping the pre-start print on a multi-file unit
- Packing the next wave into this one because capacity exists
