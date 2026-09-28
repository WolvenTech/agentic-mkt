---
name: prototype
description: Build a throwaway prototype that answers one question — a runnable program for logic and state, or a few switchable variations for UI — then discard or promote it deliberately
---

# Prototype

A prototype is **throwaway code that answers one question**. The question
decides which branch to run, and everything else about the prototype
follows from that choice.

## Pick a branch

- **"Does this state model / logic feel right?"** → [LOGIC.md](LOGIC.md).
  A single runnable program the Human can drive by hand.
- **"What should this look like?"** → [UI.md](UI.md). A few radically
  different UI variations, switchable from one place.

If the question is genuinely both, split it into two prototypes and answer
the logic question first — a UI variation built on an unsettled data shape
just gets rebuilt. If it's ambiguous which branch fits and the Human is
unreachable, state the assumption at the top of the prototype and pick the
closer branch rather than blocking on it.

## Where it lives

Never in tracked product code, by default. Pick the location by how long
the prototype needs to survive and who else needs to reach it:

| Location | When to use it |
|---|---|
| The OS temp directory (`$TMPDIR`, `/tmp`, …) | A quick, disposable run with nothing nearby it needs to be linked from |
| A gitignored scratch folder in the repo (e.g. `scratch/`) | Proximity to the target module helps, and the folder never reaches a commit |
| A throwaway git branch, never merged | The prototype needs to be reachable from somewhere else, or to outlive a single sitting |

## `PROTOTYPE` marking

Every prototype file opens with a header stating plainly that it's
throwaway and naming the exact question it answers, e.g.:

```
PROTOTYPE — throwaway code. Answers: does the retry state machine let a
stuck "pending" state recover on its own, or does it need a manual reset?
```

On the OS temp directory or a gitignored scratch folder this header is
just a comment; nothing there is scanned. A throwaway branch is different:
its files are tracked, so a project whose comment rule judges added
comments on tracked code (an automated comments check, for instance) will
judge this header the same way it judges any other comment. Write the
header in whatever shape that rule accepts for a reviewed comment — for
example a `why:` line — instead of a bare header. Either way, keep the
prototype itself out of tracked product code paths; the branch that holds
it stays unmerged.

## Discard or promote, deliberately

Once the question has an answer, decide on purpose — never let throwaway
code linger because it "might be useful later":

- **Discard.** Delete the temp or scratch files, or leave the throwaway
  branch unmerged and stop pointing anyone at it.
- **Promote.** Rewrite the validated decision properly through the normal
  path — `code-spec` then `code-execute`, by name — starting from the
  decision itself, never by copying the prototype's file in as-is.

Either way, **record the verdict** — the question, the answer, discard or
promote, and the date — on the PRD: under its `## Open questions` section,
or as a short "Prototype verdicts" note, in
`docs/prds/<slug>/<slug>-prd.md`. If no PRD exists yet for this work,
record the verdict wherever the Human says to keep it instead.

## Rules that apply to both branches

1. **Throwaway from the first line.** No persistence by default; keep
   state in memory unless persistence is the question under test.
2. **Trivial to run.** One command, or a file that opens by double-click.
3. **Skip polish.** No tests, no production error handling, no
   abstractions "for later."
4. **Surface the state.** Show the full relevant state after every
   action, not just what changed.

## When not to use

- The decision is already locked — implement it properly instead
  (`code-spec` / `code-execute`).
- The prototype is a production feature wearing a "quick prototype"
  costume.

## Anti-patterns

- Treating the prototype as the implementation and folding it in as-is.
- Writing prototype files into tracked product code without the
  `PROTOTYPE` marking.
- Keeping throwaway code around "in case we need it" instead of recording
  a verdict and discarding or promoting it.
