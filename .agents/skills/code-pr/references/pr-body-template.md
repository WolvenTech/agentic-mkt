# Pull request body template

Normative body for `code-pr`. The title stays Conventional Commits
(`type(scope): summary`) on every host. **Never merge** from this skill.

Keep every section below. **Lean-out:** short Overview / What / Why / How —
no path dump.

**Checkbox reset:** write every checkbox as `[ ]` first, then tick only
those this session's evidence supports. Never copy ticks forward from a
prior body. Pre-merge closure stays unchecked unless it already ran on this
branch.

Fill every section — an empty placeholder is not a valid fill.

```markdown
## Summary of Changes
- **Agent/Model Used:** [what produced this change]
- **Task/Ticket:** [spec/plan path, tracker link, or n/a with a reason]
- **Overview:** What this pull request accomplishes, in one or two sentences.

## What
[What changed, in plain terms — one short paragraph.]

## Why
[Why this change exists — the problem or trigger. Keep it short.]

## How
[The approach, at a high level — no path dump.]

## Changes Made
- [ ] Key modifications or functional additions
- [ ] Structural or refactoring updates, if any

## Verification & Testing
- **Tests Run:** [e.g., `harness:validate`]
- **Test Coverage:** [Yes / No / N/A — note whether new tests were added]
- **How Verified:** [Reproduce steps, commands, or manual checks actually run.]

## Checklist
- [ ] Tests pass locally
- [ ] Documentation updated, if applicable
- [ ] No unrelated changes included

## Pre-merge closure

Normative steps: [pre-merge-closure.md](pre-merge-closure.md). **Leave
unchecked when opening the pull request** — tick only once this is complete
on the branch, right before merge.

- [ ] Spec and plan moved to `docs/specs/archived/<slug>/`, `status: deprecated`
- [ ] Initiative PRD folder moved to `docs/prds/archived/<slug>/`, `status: deprecated`
- [ ] New or amended ADRs promoted to `status: stable`
- [ ] `harness:validate` passes after the moves

## Risk & Reviewer Notes
- **Risk Level:** [Low / Medium / High]
- **Sensitive Areas Touched:** [e.g., auth, migrations, release gates — or none]
- **Review focus:** [Where a reviewer's attention matters most.]
```

## Scenario examples (approved shape)

### Skills or routing change

**Title:** `feat(skills): add a pull-request skill`

Summary Overview states the outcome; Changes Made names outcomes, not a
file inventory; Verification names the gate command actually run; Risk is
often Medium when a load-path or routing surface changes.

### Small, scoped fix

**Title:** `fix(validate): reject an empty description on a draft`

Tight What/Why/How; Changes Made names the gate plus its fixture; Risk Low;
Review focus on not widening an unrelated rule.

### Docs-only change, mid-initiative

**Title:** `docs(specs): record an intake step`

Task/Ticket points at the relevant spec or plan path. Verification may be
N/A with a reason, or name a docs-only check. Pre-merge closure boxes stay
**unchecked** — implementation hasn't shipped yet. Risk Low.
