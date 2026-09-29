---
name: research
description: Investigate a question against primary sources, cite every claim, and land the answer as a note in the repository. Refuses secondary-only summaries.
---

# Research

Investigates a question against high-trust primary sources and lands the
answer as a cited note: frame the question, search local docs first, follow
every claim to its primary source, draft, verify, and finalize.

**Consult:** `qmd`.
**Output:** `docs/notes/<slug>/<slug>-note.md` (frontmatter `type: note`).

**References (read when):**

| File | When to read |
|------|--------------|
| [note-template.md](references/note-template.md) | Before drafting the note — the skeleton and required sections |

## Hard gates

1. Search local docs with `qmd` before the web — the question may already be
   answered on disk.
2. Primary sources only: official docs, specs, source code, standards. A
   secondary write-up may point at a primary source but is never the
   citation on its own.
3. Every claim in the note carries a citation — a URL or a repository path.
4. Re-open each cited source and confirm the claim still matches before
   finalizing.
5. Refuse a request to just summarize a secondary source with no primary
   follow-through.

## Workflow

### 1. Frame

State the exact question being investigated and what would count as
answering it.

### 2. QMD first

Search local docs with `qmd` before going to the web. When it already
answers the question, cite what's already there and stop, or extend the
existing note instead of starting a new one.

### 3. Primary sources

Follow every claim to the source that actually makes it true: official
docs, the spec, the source code, or a standard. A secondary write-up may
point the way but is never cited on its own — read past it to what it
cites.

### 4. Cited note

Draft the note from [note-template.md](references/note-template.md) at
`docs/notes/<slug>/<slug>-note.md`, frontmatter `type: note`. Every claim
carries an inline citation. Saved excerpts or other supporting material may
sit beside the note in its folder — they are extras, not the main doc.

### 5. Verify

Re-open each cited source and check the claim still matches what's
written. Drop or fix any claim that no longer holds up before moving on.

### 6. Finalize

Once the Human accepts the note, set `status: stable` and run
`harness:validate`.

## When not to use

- The ask is "summarize this" with no primary follow-through — refuse and
  go find the primary source instead, or say plainly that none is
  reachable.
- The work is urgent implementation, not reading legwork — build it
  instead of researching it.
- `qmd` already answers the question in full — cite the existing note
  instead of duplicating it.

## Pragmatic-guard

Refuse an uncited claim, a note built entirely from secondary summaries,
and research requested as a stand-in for shipping now.

## Anti-patterns

- A claim with no citation, or "reportedly" standing in for a source
- Citing a summary or write-up instead of the primary source it describes
- Skipping `qmd` and re-researching something already on disk
- Finalizing without re-checking each cited source
