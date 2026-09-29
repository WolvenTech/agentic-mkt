---
name: pragmatic-guard
description: Strict YAGNI enforcement. Challenge over-build, record deferrals under docs/deferrals/, refuse scope expansion without triggers. Use when adding features, abstractions, deps, or "we might need" work.
---

# Pragmatic Guard (Strict)

Intensity is **strict** by default (see `.agents/rules/yagni-strict.md`).

## When invoked

1. Read the Strict rule.
2. Score **need** (0–10) vs **complexity** (0–10) for the proposed addition.
3. If complexity is not clearly justified by a present need, **refuse** and
   propose the simpler path.
4. If deferred: create or update **`docs/deferrals/<slug>/<slug>-deferral.md`**
   only — never `docs/` root or repo root. Frontmatter: `type: deferral`,
   `title`, `description`, `status` (`draft`, `stable`, or `deprecated`).
   Include trigger checkboxes — concrete, observable conditions that would
   justify revisiting the work. `<slug>`: kebab-case, ASCII.
5. Exemptions: security, data integrity, compliance, accessibility — do not
   weaken these.

## Strict behaviors

- Question every "should" and "could".
- Push the absolute minimal implementation for current requirements.
- Challenge new abstractions, dependencies, patterns, premature performance
  work, upfront test infrastructure, and flexibility knobs.

## Worked refuse example

**User ask:** "Add a plugin system so future integrations can hook in without
touching core."

**Guard response:**

| Field | Value |
|-------|-------|
| Need | 1/10 — no second integration exists yet |
| Complexity | 8/10 — new extension points, versioned contracts, discovery and registration machinery |
| Verdict | **Refuse** the plugin system |
| Simpler path | Add the one integration directly; extract a seam only when a second integration actually needs it |
| Authority | Record a deferral with a trigger: "a second integration is requested" |

**Sample refusal prose:**

> Refused. A plugin system solves a problem we do not have yet — there is
> exactly one integration in scope. Building the direct path now and recording
> a deferral (`docs/deferrals/plugin-system/plugin-system-deferral.md`,
> trigger: a second integration is requested) keeps the door open without
> paying the abstraction cost today.

## Output

State: challenge, simpler alternative, whether you block, and the deferral
path if one was recorded.

## Anti-patterns

- Silent scope expansion without recording a deferral.
- Approving "we might need it" without present need ≥ complexity.
- Creating deferrals outside `docs/deferrals/`.
