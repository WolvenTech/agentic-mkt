---
name: code-plan
description: Turn a locked spec into ordered work units for repo execute, with dependencies, wave stops, and an explicit Subagent value per unit
---

# Code Plan

Produces a **work-unit index**: numbered units with dependencies, an owned
file/path scope, an explicit execution mode, and an observable Done when —
ready for a repo-execute skill to run in order.

**Consult:** `pragmatic-guard`.
**Input:** a locked spec.
**Output:** `docs/specs/<slug>/<slug>-plan.md` (frontmatter `type: spec`),
written next to `docs/specs/<slug>/<slug>-spec.md`.

**References (read when):**

| File | When to read |
|------|--------------|
| [EXAMPLE-units.md](references/EXAMPLE-units.md) | Drafting a units table, wave stops, or Unresolved rows |
| [TEMPLATE-plan.md](references/TEMPLATE-plan.md) | Starting a new plan file from a blank skeleton |

**In / out / handoff:** locked spec → ordered, revisable plan → units ready
for a repo-execute skill once the plan is approved.

## Structural gate

Before slicing into units, confirm every obligation the spec names already
maps to a named proof or an explicit verification method. An obligation
with no way to check it is a gap in the spec, not something to paper over
with a vague unit — stop and get the proof named first.

## Hard gates

1. The spec is locked (or explicitly skipped for tiny work — then skip this
   skill too).
2. Units are **agent-sized vertical slices** — one coherent observable
   outcome with a verifiable Done when (behavior + proof), never a
   layer-only cut ("all templates" then "all tests").
3. No circular dependencies; the frontier is exactly the unblocked units.
4. **Wave alignment** — when the spec names phased waves, plan units respect
   the wave stops; prefer not mixing waves in one mutate batch.
5. **Unresolved preserved** — every blocking open question from the spec
   appears as a typed row in the plan (see below); never invent a
   disposition for one.
6. **Observable Done when** — a Done when that only lists paths or files,
   with no observable behavior and no named proof or gate check, fails
   this gate.
7. Every unit names a **Subagent** value: `spawn` or `inline` (see below).
   Never leave it blank or invent a third value.
8. Do not start execution from this skill — hand off only after the plan is
   approved.
9. Do not mix waves in one mutate batch to skip a gate unit.

## On-disk layout

| Output | Path |
|--------|------|
| Spec | `docs/specs/<slug>/<slug>-spec.md` |
| Plan | `docs/specs/<slug>/<slug>-plan.md` |

Both live in the same slug folder under `docs/specs/`.

## Workflow

1. Read the spec, including any phased execution and its Unresolved rows.
2. Draft a numbered units table: `#`, title, Depends, Owns, **Subagent**,
   Done when — see [EXAMPLE-units.md](references/EXAMPLE-units.md).
3. **Done when shape** — each unit names (a) observable behavior that can
   be verified and (b) a named proof from the spec **or** an explicit gate
   check. Refuse "edit these files" as the sole Done when.
4. **Carry Unresolved** — copy every blocking open question into the
   plan's typed Unresolved table, mapped to the unit or wave it blocks.
   Leave Disposition empty until it's actually decided — never invent one.
5. **Safety valve** — if drafting reveals mega-units, layer-only slices,
   more than about 15 vague steps, or circular dependencies: stop,
   re-slice, or escalate. Never hand off a plan that can't be verified
   unit by unit.
6. Note which units can run in parallel; state the frontier pull order and
   the wave stops.
7. Write `docs/specs/<slug>/<slug>-plan.md`, next to the spec, from
   [TEMPLATE-plan.md](references/TEMPLATE-plan.md) or from scratch.
8. Hand off to a repo-execute skill (e.g. `code-execute`) — do not start
   execution from here.

A repo-execute skill fills in its own inline execution/resume bookkeeping
in this same plan file as work proceeds; this skill only produces the
initial units table, Unresolved rows, and wave stops.

## Vertical units (not layer-only)

| Slice kind | Verdict | Example Done when |
|---|---|---|
| **Vertical** | Required | Named outcome met end-to-end; references and any template cover their fields; the spec-named proof (or gate check) is inspectable |
| **Layer-only** | Refuse / re-slice | "Update every file in the folder" then "add tests later" with no per-outcome proof |

A vertical unit owns one outcome end-to-end. A layer-only unit owns one
technical layer across many outcomes — a repo-execute skill can't verify
behavior per obligation from it.

## Subagent column (plan table)

Every unit names exactly one value:

| Subagent | Meaning |
|---|---|
| `spawn` | The unit runs as an isolated subagent, given the unit's brief |
| `inline` | The unit runs in the current session — no subagent is spawned |

No third value, and no default: every unit states one explicitly. Use
`inline` for gate units, read-only inspection, small hygiene edits, or
anything that must share state with what came right before it. Use `spawn`
for units whose Owns is disjoint from what else is running, or that
benefit from an isolated context.

## Unresolved (typed rows in the plan)

Carry every blocking open question from the locked spec into the plan.
Minimum columns:

| Field | Requirement |
|---|---|
| Identifier | Stable, unique key |
| Decision needed | The concrete pending choice |
| Owner | Who decides |
| Blocking effect | What can't advance (or explicit non-blocking) |
| Disposition | Resolve before wave / defer with a trigger / refuse with a reason — filled in only once decided |
| Unit | Plan unit (or wave) it blocks — optional but preferred |

Never drop a blocker, fold it into prose-only notes, or invent a
Disposition. A non-blocking open question may stay listed with an explicit
non-blocking effect.

## Wave-stop pattern

When the spec defines waves (or the plan spans more than one mutate
batch), every wave ends in an explicit **STOP** gate unit that depends on
every mutable unit in that wave:

| Stop | After | Gate |
|------|-------|------|
| **Wave gate** | last unit in the wave | Named checks and proofs from the spec pass; `harness:validate` PASS — **abort before the next wave** on failure |
| **Ship gate** | final wave | Final closeout checks pass; `harness:validate` PASS — before the plan's output is handed off |

Gate units are `inline`, own no feature diff, and name the checks that
must pass. Prefer not mixing waves in one mutate batch.

## Safety valve

Stop and re-slice when any of:

- A unit's Done when lists more than about five unrelated outcomes
- Done when is a path/file list with no behavior and no proof
- A layer-only slice ("all docs", "all tests") spans multiple obligations
- "And also …" scope creep inside one unit
- The dependency graph needs more than three hops to reach the frontier
- A unit mixes unrelated kinds of work (structural debt, new behavior,
  hygiene) in one batch

Remedy: split the unit, add a gate unit, or send it back for the spec to
be re-phased.

## When NOT to use

- Deciding *what* to build — lock the spec first (`code-spec`).
- Running the units — hand off to a repo-execute skill; this skill never
  starts execution.
- Tiny tooling — a thin execute pass with no plan file is enough.

## Anti-patterns

- Vague mega-units ("deepen everything") with no per-outcome Done when and
  proof
- Layer-only slices (templates-only / tests-only) instead of vertical
  outcomes
- Done when = "files edited" with no observable behavior or named proof
- Mixing waves in one mutate batch to skip a gate unit
- Starting execution from this skill
- Dropping or inventing a disposition for an Unresolved row
- Circular or missing dependencies on the frontier
