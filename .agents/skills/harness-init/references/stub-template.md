# Stub Template

Renders the ask-only stub step 5 writes for one skill the Human picked — a
`SKILL.md` plus an `agents/openai.yaml`, both held here verbatim with
placeholders — carrying the discovery evidence that led to the suggestion
and headed prompts for what only the Human can decide.

## Never overwrite

An existing skill folder is never overwritten. Before writing, check
`.agents/skills/<name>/` for a match; if it already exists, ask the Human
for another name or skip that suggestion instead. A half-written skill
therefore never lands on top of one that already works — and never fires
on its own either: `disable-model-invocation: true` in `SKILL.md` plus
`allow_implicit_invocation: false` in `agents/openai.yaml` hold until the
Human removes them.

## Files

`.agents/skills/<name>/SKILL.md`:

```markdown
---
name: <name>
description: Stub skill for <tool-or-field> — not yet defined
metadata:
  wolven-harness: stub
disable-model-invocation: true
---

# <name>

Suggested while discovering this repo's decided tools, ask-only until the
Human defines it.

## Discovery evidence

<evidence>

## When to use

<Ask the Human: when should an agent reach for this skill?>

## Conventions

<Ask the Human: what did they decide for <tool-or-field> — naming, layout, its own rules?>

## What to avoid

<Ask the Human: what should this skill refuse, or never do?>

## How to verify

<Ask the Human: what command or read confirms this skill did its job?>
```

`.agents/skills/<name>/agents/openai.yaml`:

```yaml
interface:
  display_name: "<name>"
  short_description: "Stub for <tool-or-field> — not yet defined"
policy:
  allow_implicit_invocation: false
```

## Until it's defined

`harness:validate` warns `skill-stub-open` for each stub's `SKILL.md`,
once per file, for as long as its `metadata` still carries
`wolven-harness: stub`. Defining a stub means writing its body from the
Human's answers to the headed prompts above and removing that marker —
and, only if the Human wants the skill model-invocable, also removing
`disable-model-invocation: true` and the `agents/openai.yaml` file. Short
of that, the warning stays and the skill stays ask-only.

## Commit

Every stub this step writes lands in the setup phase's single commit
offer, together with everything else steps 2 through 6 write — never a
commit per stub, and never a commit per file inside one.

## Hand-back

Hand back to the Human: define each stub, then remove the marker.
