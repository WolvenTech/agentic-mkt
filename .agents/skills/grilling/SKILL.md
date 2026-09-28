---
name: grilling
description: Interview relentlessly about a plan, decision, or idea until every open branch is settled, one question at a time
---

Interview the Human relentlessly until you reach a shared understanding. Map the decision as a **design tree**: every choice branches into the choices that hang off it.

Work the tree in **rounds**. The **frontier** is every branch whose prerequisites are already settled — the questions you can ask right now without guessing at answers you haven't heard yet.

## One question at a time

Ask a single question per round.

- If your runtime has a native question tool, use it.
- Otherwise, ask in markdown, in the same shape:

```
❓ **Q1 — <question title>**: <question body>

Options:
a) (Recommended) <option A>
b) <option B>
c) <option C>

➡️ Recommended: a — <one-line why>
```

Either way, give at least two options, with the recommended one listed first and labelled `(Recommended)`. Label every option with a letter (`a)`, `b)`, `c)`) or a number (`1.`, `2.`, `3.`), so the Human can answer by typing just the label, or point to an option by its label inside a free-text answer.

**Stop after every question.** Do not answer for the Human, do not continue the tree, and do not queue the next round until the Human responds.

## Round mechanics

Each answer reshapes the tree: a settled branch pushes the frontier outward. Recompute the frontier, then ask the single next question. A question whose answer depends on another still-open branch belongs to a later round, not this one.

Finding facts is your job, never the Human's. When a frontier question needs a fact you can look up — a file's contents, a command's output, a value already on record — go find it yourself; don't ask the Human for anything you could look up. A lookup still in flight is an unsettled prerequisite: ask the rest of the frontier while it resolves, or park that branch until it returns.

## Done when

The session is done only when the frontier is empty — every branch visited, nothing left silently assumed — **and** the Human confirms the shared understanding. Don't act on the plan before both are true.

## When not to use

- An urgent decision that must ship now — decide and execute, and grill afterward only if it still matters.
- A path already agreed and ready to execute — run that instead of reopening it with another interview.

## Anti-patterns

- Monologue grilling — talking at the Human instead of asking.
- Asking more than one question in a single turn.
- Answering your own question, or moving on before the Human responds.
- Grilling to stall a decision that's already made.
