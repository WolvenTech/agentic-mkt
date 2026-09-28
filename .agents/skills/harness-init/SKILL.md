---
name: harness-init
description: Guide a repo through initial harness setup — fold the entry file into AGENTS.md, offer legacy ADR migration, discover the repo, research its decided tools, suggest skills, write stubs, and close with a session note
---

# Harness Init

One guided session that takes a repo from a fresh `wolven-harness init` (or a
bare `.agents/skills/` tree) to a working setup: the entry file folded into
`AGENTS.md`, any legacy ADRs migrated into `docs/adrs/`, the repo understood,
a short list of suggested skills stubbed out, and a session note recording
what happened. The Human steers every write.

**Consult:** `adr`, `research`, `code-commit`, `qmd`, `grilling`.

This skill is a runtime playbook, not a scripted fix: it gives the agent
rules for what it will meet in an unfamiliar repo, not a transcript to
replay.

## Hard gates

These rules hold across every step below.

1. **`harness:validate` drives what comes next.** Read its output before
   deciding the next move — never guess at a status, a warning, or an exit
   code it would have reported.
2. **One question at a time.** An ambiguity — an entry mode, an ADR status,
   a successor, anything the repo or the Human hasn't settled — becomes a
   single question to the Human, the recommended option listed first (see
   `grilling`).
3. **Never invent.** No status, successor ADR, entry mode, or decision is
   assumed on the agent's own judgment; each one comes from what the Human
   answers or what `harness:validate` reports. A claim that starts failing
   after migration is expected input to work through with the Human, not a
   defect to paper over.
4. **No consumer names.** This skill names no specific consumer repository
   and carries no steps special-cased for one. The rules hold for any repo it
   meets; when a repo presents something they don't cover, that is a question
   for the Human, not a new rule.

## Session note

`references/session-note-template.md` renders the record of this run at
`docs/notes/harness-init-<yyyy-mm-dd>/harness-init-<yyyy-mm-dd>-note.md`
(a second run on the same day adds `-2`). It is created `draft` at the start
of step 0. Each phase below adds its section to the note before that
phase's commit offer, so every phase commit carries its part of the note,
and the note turns `stable` at hand-back in step 6. A `draft` note left by
an interrupted run is where the next run resumes from — never start a
second note over it.

## Phased commits

The run has three writing phases:

| Phase | Steps |
|-------|-------|
| Entry | 0 |
| Migration | 1 |
| Setup | 2–6 |

At the end of each phase, once `harness:validate` exits 0 — `0 legacy-warn`
as well, for the migration phase — offer one commit of that phase's paths
through `code-commit`, and commit only on the Human's yes. Never a single
commit at the end of the whole run, and never a commit per file, ADR,
claim, or stub. A declined commit leaves that phase uncommitted, and the
next phase's offer covers only its own paths — the two never merge into
one.

Every writing step also runs `harness:validate` right after it writes,
shows the Human the diff before writing, and waits for the Human's choice
before moving on.

## Re-run skips

A re-run does not redo what an earlier run already finished:

- Step 0 is skipped when `WOLVEN.md` is already gone, or `AGENTS.md`
  already mentions it.
- An `AGENTS.md` that already holds the harness section was integrated by
  an earlier run, even when `init` has since brought `WOLVEN.md` back:
  never fold it a second time; show the diff, ask whether to refresh the
  section, then delete `WOLVEN.md`.
- Step 1 is skipped when there are no legacy-ADR warnings left.
- A `draft` session note from an interrupted run is resumed, not replaced.

## Workflow

### 0. Entry integration

Fold the entry file into `AGENTS.md` in one of three modes — full, light,
or mention-only — recommend one from what the repo already has, and let the
Human pick. This step also checks for existing `AGENTS.md` content, an
overlapping router or rule, a `CLAUDE.md` that should import `AGENTS.md`,
any harness path an ignore rule keeps from other clones (proposing
re-include rules), and existing content in the five doc folders the
writing profile governs. See
[references/entry-modes.md](references/entry-modes.md).

Skipped on a re-run once `WOLVEN.md` is gone or `AGENTS.md` already
mentions it. When `AGENTS.md` already holds the harness section, the step
offers a refresh instead of a second fold (see "Already integrated" in the
reference).

### 1. Legacy ADR migration (optional)

Offered only when `harness:validate` reports `legacy-adr`. Turns each
legacy ADR into a profile ADR under `docs/adrs/` — keeping its number,
moving it, prepending frontmatter, mapping its status (asking when part
of a superseded ADR still applies, and searching for the tokens tests pin
first) — and closes the step by recomputing links, working every failing
claim with the Human, and checking that each claim to a touched ADR names
the right decision, until `harness:validate` exits 0 with `0 legacy-warn`. See
[references/adr-migration.md](references/adr-migration.md).

Skipped on a re-run with no legacy-ADR warnings left.

### 2. Discovery

Read what the repo already shows — manifests, lockfiles, README, `AGENTS.md`, CI
config, `docs/adrs/`, installed skills, top-level layout — and ask the
Human only for what files can't show: lifecycle stage and decisions not yet
visible in code. Produces a context list, a lifecycle note, and a
decided-tools list. See [references/discovery.md](references/discovery.md).

### 3. Research

Search the repo and `qmd` first. Web research is optional, runs only on
the Human's yes, is capped at five primary-source fetches, and covers
decided tools only, with every finding cited in the session note; offer
`research` for depth on one tool. Continue repo-only, and say so in the
note, when the web is unavailable. See
[references/discovery.md](references/discovery.md).

### 4. Suggest 2–4 skills

Suggest two to four architectural skills, each named for a decided tool or
field and citing the discovery evidence, never duplicating an installed
skill. Say so, rather than padding, if the evidence supports fewer than
two. The Human picks any subset. See
[references/discovery.md](references/discovery.md).

### 5. Write stubs

Render each skill the Human picked as an ask-only stub — a `SKILL.md` plus
`agents/openai.yaml` — carrying the discovery evidence and headed prompts
for the Human's instructions. Never overwrite an existing skill folder. See
[references/stub-template.md](references/stub-template.md).

### 6. Session note and hand-back

Add the note's final sections, set it `stable`, and hand the run back to
the Human with what was done and what is left for them to define. See
[references/session-note-template.md](references/session-note-template.md).

## Anti-patterns

- Guessing at an ambiguous status, mode, or successor instead of asking the
  Human.
- Special-casing a known repo instead of applying these rules and asking
  the Human.
- One commit at the end of the run, or a commit per file, ADR, claim, or
  stub.
- Writing before showing the diff, or before the Human has chosen.
- Starting a new session note over a `draft` note left by an interrupted
  run.
- Treating a validate failure after migration as this skill's defect
  instead of expected input to work through with the Human.
