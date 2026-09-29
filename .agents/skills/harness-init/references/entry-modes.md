# Entry Modes

Step 0 folds `WOLVEN.md` into `AGENTS.md` in one of three modes — full,
light, or mention-only — and runs four checks alongside whichever mode the
Human picks. `WOLVEN.md`'s own first line names this step; every mode drops
that line from whatever it carries forward.

## Full

The `WOLVEN.md` body, without its first line, goes into `AGENTS.md` as a
new `## Wolven harness` section, added after whatever `AGENTS.md` already
holds.

**Heading levels:** the body opens with its own H1 title and continues in
H2 sections. The new `## Wolven harness` heading replaces that H1, so drop
it, and demote every remaining heading one level (`##` → `###`) so the
sections nest under `## Wolven harness` instead of sitting beside it.

**No-`AGENTS.md` case:** when the repo has no `AGENTS.md` yet, `WOLVEN.md`
(without its first line) becomes `AGENTS.md` outright — there is no
existing content to fold into, so nothing is appended, and the body's H1
stays as the file's title with its headings unchanged.

`WOLVEN.md` is deleted once the fold lands.

## Light

`AGENTS.md` gets a short `## Wolven harness` block, appended after whatever
it already holds. The block says where skills and rules live, copies the
standing-rule bullets from `WOLVEN.md`'s Standing rules section, gives the
doc layout and the writing profile, restates the architecture-claims rule,
points at QMD before memory or the web, and names the validate command. It
carries no router table and no skills table — those stay in `WOLVEN.md`'s
full text, which this mode does not reuse.

Hold this block when writing it into `AGENTS.md`. The `<standing-rules>`
line is not literal: replace it with the bullet list under `WOLVEN.md`'s
Standing rules heading.

```markdown
## Wolven harness

Skills live under `.agents/skills/` (one folder per skill, each with a
`SKILL.md`); standing rules live under `.agents/rules/` and load
unconditionally:

<standing-rules>

Docs follow `docs/<folder>/<slug>/<slug>-<type>.md`, except ADRs, which sit
flat as `docs/adrs/adr-NNN-<slug>.md`; `docs/WRITING-PROFILE.md` holds the
rules every `docs/**` markdown file follows.

Referencing an ADR as `ADR-NNN` or `adr-NNN-<slug>` anywhere in a tracked
file is a claim: it must resolve to exactly one `stable` profile ADR under
`docs/adrs/`, or the claim fails.

Search this repo's knowledge with `qmd query` before answering from memory
or the web — ADRs first, then widen.

Run `harness:validate` after any change to `.agents/**` or `docs/**`.
```

`WOLVEN.md` is deleted once the block lands.

## Mention-only

`AGENTS.md` gets one line pointing at `WOLVEN.md`, appended after whatever
it already holds.

Hold this line verbatim when writing it into `AGENTS.md`:

```markdown
This repo's Wolven harness router, with its skills table and full layout, lives in WOLVEN.md.
```

`WOLVEN.md` stays in the repo, without its first line — this is the one
mode that keeps it.

## Deletion rule

`WOLVEN.md` is deleted in full and light — both fold its content elsewhere,
so nothing is left for it to hold. It is kept, minus its first line, in
mention-only — the line in `AGENTS.md` only points at it, so the file it
points to has to remain.

## Already integrated

`setup` writes every path that is missing, so running it again after a full
or light fold (to wire another runtime, or after a package upgrade) brings
`WOLVEN.md` back. Neither the light block nor the full body names
`WOLVEN.md`, so `harness:validate` reports step 0 as pending again.

Before picking a mode, check whether `AGENTS.md` already holds the harness
section: a `## Wolven harness` heading (full or light into an existing
file), or the router's own `# Wolven harness — entry router` title (full
into a repo that had no `AGENTS.md`). If it does, an earlier run already
integrated the entry file — do not fold it a second time. Show the Human the
diff between that section and the new `WOLVEN.md` (a newer skills table,
say), ask whether to refresh the section from it, write only what the Human
agrees to, then delete `WOLVEN.md`.

## Recommending a mode

The agent reads what `AGENTS.md` already holds and recommends one mode
first, but the Human always picks:

- No `AGENTS.md`, or a short one → recommend full.
- A long, curated `AGENTS.md` → recommend light, so the fold doesn't bury
  the Human's own material under the router and the skills table.
- Anything in between is a question to the Human, the recommended option
  listed first, same as any other ambiguity this skill meets.

The mode is always put to the Human as one question: the recommended mode
first with the reason, the other two modes as the remaining options. Never
pick a mode silently, even when one recommendation looks obvious.

## Before writing

Alongside picking a mode, step 0 runs five checks. Each one is a question
to the Human when it finds something — never a silent write.

1. **Existing content stays put.** Whatever `AGENTS.md` already holds is
   never removed or rewritten without the Human's OK. Every mode above only
   appends.
2. **Overlaps are questions, one at a time.** A second router, or a rule in
   `AGENTS.md` that clashes with a standing rule under `.agents/rules/`, is
   never merged or dropped on the agent's own judgment — each overlap
   becomes its own question to the Human, one at a time.
3. **`CLAUDE.md` import offer.** When a `CLAUDE.md` exists and does not
   import `AGENTS.md`, the agent offers to add an `@AGENTS.md` line to it.
   The Human's no leaves `CLAUDE.md` untouched.
4. **Harness paths must reach other clones.** `harness:validate` fails
   with `harness-ignored` for each harness path an ignore rule excludes —
   `.agents/skills`, `.agents/rules`, `docs`, the wired runtime paths such
   as `.claude/skills` — naming the rule and the file it came from (run
   `git check-ignore -v <path>` to see it again). An ignored harness path
   exists on this machine only: teammates and CI clone an `AGENTS.md` that
   cites skills and rules they don't have. A repo often ignores these
   folders on purpose, since personal assistant settings live there too,
   so never delete its ignore lines. Propose re-include rules appended
   after them — they share the harness paths and keep everything else in
   those folders ignored — show the diff, and write them only on the
   Human's yes. If the Human declines, say plainly that `harness:validate`
   stays red until those paths are shared. See "Re-include rules" below.
5. **Existing doc folders.** List any content the harness did not write
   under `docs/adrs/`, `docs/prds/`, `docs/specs/`, `docs/notes/`, or
   `docs/deferrals/`. `harness:validate` holds those five folders to the
   writing profile, so a flat or frontmatter-less file there fails; the
   rest of `docs/` is left alone. For each one, ask the Human whether to
   reshape it into the doc-folder layout with frontmatter or move it out
   of those five folders. An ADR already in `docs/adrs/` without
   frontmatter takes the frontmatter and status rules of step 1, in place.
   Never move or rewrite one without the Human's answer.

## Re-include rules

Git cannot re-include a path inside a folder it excludes, so the rules
first re-include the folder, then ignore its contents again, then
re-include each harness path. For the common case where a repo ignores the
whole `.agents/` and `.claude/` folders, append:

```gitignore
# Wolven harness: shared skills and rules stay tracked
!.agents/
.agents/*
!.agents/skills/
!.agents/rules/
!.agents/hooks/
!.claude/
.claude/*
!.claude/skills
```

Adapt it to the paths `harness:validate` named, and keep it after the
lines it overrides — the last matching rule wins. `!.claude/skills` has no
trailing slash on purpose: it is a symlink, which git matches as a file.
A rule from a personal excludes file (`.git/info/exclude`, or the global
excludes file) lives on the Human's machine, not in the repo: point it out
rather than editing it.
