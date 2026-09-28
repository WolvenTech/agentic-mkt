---
name: code-spec
description: Freeze design and requirements for a code initiative into a spec, from a PRD or a confirmed ask, with obligation-proof pairs, nine dimensions, and typed Unresolved rows
---

# Code Spec

Turns an approved PRD, or a confirmed code-shaped ask, into a frozen spec:
obligations paired with proofs, the nine-dimension sweep, typed Unresolved
rows, wave stops when the work spans more than one mutate batch, and gates —
ready for `code-plan` to slice into units.

**Consult:** `pragmatic-guard`.
**Input:** an approved PRD, or a code-shaped ask the Human confirms directly.
**Output:** `docs/specs/<slug>/<slug>-spec.md` (frontmatter `type: spec`).

**References (read when):**

| File | When to read |
|------|--------------|
| [TEMPLATE.md](references/TEMPLATE.md) | Before drafting — the spec skeleton |
| [EXAMPLE.md](references/EXAMPLE.md) | A short worked example of the obligation ↔ proof, nine-dimension, waves, and eval shapes |

## Where this sits

`create-prd` drafts and approves the problem and its user stories. `code-spec` freezes the requirements and design that follow from it. `code-plan` slices the frozen spec into ordered units. `code-execute` implements those units. Any of the four may be invoked directly when the Human asks for it out of order.

## Hard gates

1. Ceremony needed — skip this skill for a one-file change; go straight to
   `code-execute` with `harness:validate`.
2. Spec home is `docs/specs/<slug>/<slug>-spec.md`, never inline chat-only.
3. Real commands only — acceptance boxes and eval rows name real commands;
   no placeholder marked done.
4. Freeze — every acceptance criterion pairs with a named obligation ↔ proof
   row grounded in the repository, not an invented surface; all nine
   dimensions land; every `n/a` cites the unchanged surface it means;
   missing product decisions become a typed row under Unresolved — never
   invented behavior.
5. No executable plan — this skill freezes requirements and design only.
   Unit order and wave packing belong to `code-plan`, after the Human
   approves this spec.

## Workflow

1. Read the PRD in full, or the confirmed ask when there is no PRD.
2. **Term challenge.** List the terms this spec relies on and check each
   against `docs/` and the existing ADRs — search with a knowledge tool
   first, if one is available, before reading the tree by hand. Reuse a
   name already in use; record a new term at its first use.
3. **Repository grounding.** List what already exists on disk — skills,
   ADRs, scripts, prior specs — that this initiative depends on. Cite what
   exists; never invent a surface.
4. **Surface walk.** Name the paths and systems in mutate scope, and those
   deliberately left out of scope.
5. Draft from [TEMPLATE.md](references/TEMPLATE.md): obligation ↔ proof
   requirements, acceptance boxes, nine-dimension landings, typed
   Unresolved rows, out-of-scope, refuses.
6. **Nine-dimension landings.** Land all nine: validation, failure modes,
   idempotency and retry, authorization, concurrency and ordering, data
   lifecycle, external-dependency failure, state transitions, and
   observability. Each row is an obligation ↔ proof pair, an `n/a` naming
   the unchanged surface, or a typed row under Unresolved — never invented
   behavior.
7. **Waves.** When the work spans more than one mutate batch, add a Waves
   section: name each wave and its gate command, state that a failed gate
   aborts before the next wave, and encode the same stops as unit
   boundaries in `code-plan`. Prefer not mixing waves inside one batch.
8. **Eval / gates.** Fill the Eval / gates table with the deterministic
   checks a builder must run, including a structural check that every
   acceptance box pairs with a named obligation ↔ proof row, before handoff
   to `code-plan`. Consumers run `harness:validate`.
9. **Cross-domain leaks.** Fill the Cross-domain leak table with asks that
   belong to a different lane, and name where each one actually belongs.
10. **ADR.** When the spec settles a durable architecture decision, use the
    `adr` skill, by name, to create, promote, or supersede it. Numbering
    and supersession live in `adr`; this section only decides whether one
    is owed.
11. Present the draft for the Human to confirm when it changes something
    material; revise in place.
12. Hand off to `code-plan` once approved. This skill never emits an
    executable plan itself.

## When not to use

- A one-file tooling change — skip straight to `code-execute` plus
  `harness:validate`.
- The scope is still undecided — chart it first, then come back once the
  destination is clear.
- Slicing an already-frozen spec into ordered work — that is `code-plan`.

## Pragmatic-guard

Refuse an empty placeholder spec, a spec with no Eval / gates table, a
spec that emits its own plan units, invented product behavior where a
typed Unresolved row belongs, and a boilerplate `n/a` that names no
surface. Prefer the thinnest spec that unblocks `code-plan`.

## Anti-patterns

- A "deepen later" acceptance box marked done
- Skipping the nine-dimension sweep, or filling a row with a guess instead
  of a typed Unresolved row
- Mixing two waves into one mutate batch to skip a gate
- Emitting a plan file or a unit table from this skill
- One proof reused across more than one obligation
- Citing a doc path that doesn't exist yet instead of a `<slug>`
  placeholder
