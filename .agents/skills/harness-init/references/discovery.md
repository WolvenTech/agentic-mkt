# Discovery

Covers steps 2 through 4: reading the repo before asking anything, researching
its decided tools, and suggesting skills from what both turned up.

## Discovery

Read what the repo already shows before asking the Human anything: manifests,
lockfiles, `README`, `AGENTS.md`, CI config, `docs/adrs/`, installed skills
(`.agents/skills/`), and the top-level layout. Most of what discovery needs is
already sitting in the tree.

Before reading any of that by hand, check for a local search index this repo
already keeps over its own documentation:

> Before reading files by hand, check whether the repository already has a
> local search index over its own documentation (for example, a QMD
> collection). If one exists, query it for relevant documentation and
> architecture notes before reading further, and note the indexing tool
> itself as a decided tool. If none exists, skip this step and read the
> repository directly.

Only two things in this step go to the Human, and only because no file can
show them — one question at a time, same as any other ambiguity this skill
meets:

1. **Lifecycle stage** — prototype, MVP, production, or maintenance.
2. **Decisions not yet visible in code** — a choice the team has made but
   hasn't left a trace of in the tree yet.

Nothing else is asked here. Everything else this step produces comes from
what the repo already shows.

### Context

What the repo's own files say about itself: what it is, what it depends on,
how it's tested and shipped, what it already documents about its own
architecture.

### Lifecycle

The stage the Human named, held as a single line — this step never infers
it from code.

### Decided tools

Every tool or platform the repo has already committed to. A tool counts as
decided when the repo shows it in use, or the Human names it — never because
it merely seems a fit for the repo's shape. An index found in the check
above counts as one of these, same as any other tool the repo already runs.

## Research

Search the repo and `qmd` first — most of what research needs, discovery
already turned up or `qmd` already has indexed. Web research is optional: it
runs only once the Human says yes, is capped at five primary-source
fetches, and looks up decided tools only — never a tool that only seems like
a fit. Every finding this step keeps gets cited in the session note, source
alongside claim, so nothing here is asserted from memory.

For depth on a single tool worth digging into further, offer `research`
instead of widening this step's own web budget.

If the web is unavailable, or the Human declines it, this step continues
repo-only and says so in the note — a missing web pass is expected input to
record, not a gap to paper over.

## Suggestions

From the context, lifecycle, and decided tools discovery produced, and
whatever research added, suggest two to four architectural skills. Each one:

- is named for a decided tool or field, never a guess at what the repo might
  adopt later;
- cites the discovery (or research) evidence that grounds it;
- never duplicates a skill already installed under `.agents/skills/`.

When the evidence only supports fewer than two, say so rather than padding
the list to reach the range. The Human picks any subset of what's suggested,
including none of it — there is no catalogue to pick from instead; a
suggestion not grounded in this run's own evidence isn't offered.

For example: a fictional repo, `Petalworks`, lists a queueing library called
`Quinly` in its manifest, and `docs/adrs/adr-NNN-queue-with-quinly.md`
records the decision to adopt it. Discovery's decided-tools list already
carries `Quinly` from the manifest; this step suggests a `quinly-patterns`
skill, citing both the manifest line and the ADR as its evidence.
