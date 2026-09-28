# ADR Migration

Turns each legacy ADR `harness:validate` flagged with `legacy-adr` into a
profile ADR under `docs/adrs/`, then closes the step until the tree is
clean. The `adr` skill creates, promotes, and supersedes profile ADRs — it
explicitly leaves migrating an older decision record out of scope, which is
what this reference covers instead.

## Rules

Apply these to every legacy ADR, one at a time, with the Human watching the
diff before it's written:

1. **Keep the legacy number.** The migrated ADR keeps the same three-digit
   number it had as a legacy ADR, so every claim already pointing at that
   number keeps resolving (as a profile ADR now, instead of a legacy one).
   Never renumber a legacy ADR to make room for something else.
2. **Stop on a collision.** Before moving anything, check whether a profile
   ADR already exists under `docs/adrs/` with that same number — including
   `adr-000`, the profile's own seeded record. If one does, stop and ask the
   Human how to resolve the collision; do not invent a new number to work
   around it.
3. **Move it.** `git mv` the file to `docs/adrs/adr-NNN-<slug>.md`, keeping
   `NNN` from rule 1. Derive `<slug>` from the ADR's title, kebab-cased.
4. **Prepend frontmatter, keep the body verbatim.** Add a frontmatter block
   ahead of the existing content: `type: adr`, `title`, a one-sentence
   `description`, `status` (mapped from the legacy status — see below), and
   anything else the writing profile requires (`superseded_by` once
   `status` is `deprecated`). The body below the frontmatter — headings,
   sections, prose — is not rewritten; it moves across unchanged.

### Status mapping

The legacy status line (however the repo spelled it — a `## Status`
section, a table cell, a header note) maps to the profile's `status`:

| Legacy status | Maps to | Notes |
| --- | --- | --- |
| `Accepted` | `stable` | |
| `Proposed` | `draft` | |
| `Superseded by <ADR>` | `deprecated` | only when nothing in the ADR or an index of the legacy folder says part of it still applies (otherwise it is the next row); set `superseded_by` to the successor's new filename (without `.md`) — the successor must already be migrated and promoted before this ADR is deprecated, same order as the `adr` skill's own Supersede step |
| superseded, but the ADR or an index says part of it still applies | ask the Human | offer two options: split the part that still binds into a new ADR through `adr`, then deprecate this one with `superseded_by` set; or keep this one `stable` because the Human judges it still binding as a whole, with that decision recorded in the session note |
| anything else — superseded with no successor named, `Deprecated`, `Rejected`, `Amended`, several statuses at once, or no status line at all | ask the Human | offer only the options that would pass `harness:validate` once written; never guess a mapping for a shape this table doesn't cover |

The agent never guesses a status mapping outside this table's first three
rows.

### Before writing a status other than `stable`

A `draft` or `deprecated` status makes every claim to that ADR fail, and a
repo's own tests or fixtures may assert those claims. Before writing it,
search the whole repo, tests included, for the ADR's tokens (its bare
number form and its filename form). Show the Human every hit, marking the
ones a test or fixture asserts, and treat each test edit the change would
force as a claim to work through with the Human like any other — never as
a reason to pick a different status.

## Closure

A legacy ADR moving is not the whole step. Once every legacy ADR the repo
has is migrated:

- **Recompute every relative link.** A link into a moved file, and a link
  out of one, both changed depth — `docs/adrs/` sits at a different place
  in the tree than the legacy folder did. Walk every such link and rewrite
  it for the new path; don't leave a link that resolved before migration
  broken after it.
- **Never move a non-ADR file into `docs/adrs/`.** A file in the legacy
  folder that isn't itself a legacy ADR — an index, a README — is not
  migrated alongside the ADRs it lists. Ask the Human to choose: delete it,
  or keep it where it is with its links rewritten to the new paths.
- **Work the claim loop.** Run `harness:validate`. For each claim it now
  reports as failing (a claim that pointed at a legacy ADR now pointing at
  a `deprecated` one, say), take it to the Human and either repoint the
  claim to the right ADR, reword the sentence so it no longer makes the
  claim, or record a new decision through `adr` when the claim was really
  pointing at a decision that was never written down. A claim that starts
  failing after migration is expected input to work through, not a defect.
- **Check what each claim means.** `harness:validate` proves a claim's
  number resolves, not that it names the right decision — an older
  renumbering can leave a claim pointing at an unrelated ADR that happens
  to be `stable`. For every claim to an ADR this migration touched, read
  the line making the claim next to that ADR's title. Take each mismatch
  to the Human, one at a time: repoint it, reword it, or leave it as is.
- **Done condition.** The step is done only when `harness:validate` exits 0
  with `0 legacy-warn`. Short of that, keep working the loop above.
- **Point at the repo's own checks.** Moving files can move links inside
  source files too (a code comment citing a decision doc by path, say) —
  things `harness:validate` doesn't scan. Once validate is clean, point the
  Human at the repo's own test and lint commands to catch those.
- **The Human reviews the whole diff.** Every moved file, every rewritten
  link, every reworded claim, together, before the migration commit is
  offered — on top of the diff shown before each write.

## Worked example

A fictional expense-ledger service, "Lumen Ledger," kept its architecture
decisions as plain Nygard-format files under `doc/architecture/decisions/`
long before this profile existed. `harness:validate` reports two
`legacy-adr` warnings, and, because one file elsewhere cites one of them
by both its bare form and its filename, two `legacy-warn` claims.

`<A>` and `<B>` below stand in for two distinct three-digit ADR numbers
(this file ships inside every consumer repo's own tree, so it never spells
one out literally — a real number here would read as this skill's own
claim on an ADR that doesn't exist).

### Before

`doc/architecture/decisions/adr-<A>-cache-with-memcached.md`:

```
# <A>. Cache with Memcached

## Status

Superseded by ADR-<B>

## Context

Session lookups were hitting Postgres directly and the connection pool
couldn't keep up under load.

## Decision

Cache session state in Memcached, keyed by session id, with a five-minute
TTL.

## Consequences

Read latency drops, but the fleet now needs a Memcached cluster and cache
invalidation on session updates.
```

`doc/architecture/decisions/adr-<B>-cache-with-redis.md`:

```
# <B>. Cache with Redis

## Status

Accepted

## Context

Memcached's lack of persistence meant a restart cleared every session,
logging every user out at once.

## Decision

Replace Memcached with Redis, using its append-only file for persistence
across restarts.

## Consequences

Sessions survive a cache restart. The fleet now runs Redis instead of
Memcached, and the ops runbook needs updating.
```

`README.md`:

```
# Lumen Ledger

See ADR-<A> (`doc/architecture/decisions/adr-<A>-cache-with-memcached.md`) for the caching decision.
```

### After

`docs/adrs/adr-<A>-cache-with-memcached.md`:

```
---
type: adr
title: Cache with Memcached
description: Lumen Ledger cached sessions in Memcached until superseded by the Redis decision.
status: deprecated
superseded_by: adr-<B>-cache-with-redis
---

# <A>. Cache with Memcached

## Status

Superseded by ADR-<B>

## Context

Session lookups were hitting Postgres directly and the connection pool
couldn't keep up under load.

## Decision

Cache session state in Memcached, keyed by session id, with a five-minute
TTL.

## Consequences

Read latency drops, but the fleet now needs a Memcached cluster and cache
invalidation on session updates.
```

`docs/adrs/adr-<B>-cache-with-redis.md`:

```
---
type: adr
title: Cache with Redis
description: Lumen Ledger caches sessions in Redis, persisted across restarts.
status: stable
---

# <B>. Cache with Redis

## Status

Accepted

## Context

Memcached's lack of persistence meant a restart cleared every session,
logging every user out at once.

## Decision

Replace Memcached with Redis, using its append-only file for persistence
across restarts.

## Consequences

Sessions survive a cache restart. The fleet now runs Redis instead of
Memcached, and the ops runbook needs updating.
```

`README.md`:

```
# Lumen Ledger

See ADR-<B> (`docs/adrs/adr-<B>-cache-with-redis.md`) for the caching decision.
```

The README's citation moved with the claim loop: ADR-`<A>` is now
`deprecated`, so a claim against it fails, and the citation was repointed —
both its visible ADR token and the path beside it — to the `stable` ADR
that replaced it, not reworded to drop the claim entirely.

## Anti-patterns

- Guessing a status mapping for a shape the table above doesn't cover
  instead of asking the Human.
- Renumbering a legacy ADR, or resolving a collision without asking.
- Moving a legacy folder's index or README into `docs/adrs/` alongside the
  ADRs it lists.
- Rewriting a moved ADR's body instead of keeping it verbatim below the
  new frontmatter.
- Calling the step done while `harness:validate` still reports any
  `legacy-warn`, even with the exit code at 0.
