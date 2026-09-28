# Writing profile

`wolven-harness validate` enforces four rules on every profile doc under
`docs/{adrs,prds,specs,notes,deferrals}/`.

## Layout

`docs/adrs/` stays flat: `docs/adrs/adr-NNN-<slug>.md`.

Every other doc-folder holds one slug folder per document:
`docs/<folder>/<slug>/<slug>-<type>.md`. `docs/specs/<slug>/` may also hold
`<slug>-plan.md` (also `type: spec`). Other files in a slug folder, and
everything under a doc-folder's `archived/`, are not checked.

## Type map

| Folder | `type` |
| --- | --- |
| `adrs` | `adr` |
| `prds` | `prd` |
| `specs` | `spec` |
| `notes` | `note` |
| `deferrals` | `deferral` |

## The four rules

1. **Frontmatter.** Every main doc has non-empty `type`, `title`,
   `description`, and `status`.
2. **Status.** `status` is one of `draft`, `stable`, or `deprecated`.
3. **Type matches directory.** The main doc's `type` matches the type map
   above for its folder.
4. **Filename.** kebab-case, ASCII only — no spaces, underscores, or
   non-ASCII characters.

## Profile ADR shape

`docs/adrs/*.md` files carry two extra requirements:

- **Filename:** `adr-NNN-<kebab-slug>.md` — a three-digit number, a dash,
  then a kebab-case slug.
- **`superseded_by`:** required, and must name the ADR that replaces it,
  whenever `status: deprecated`.

## Why this matters

Any tracked file can reference an ADR as `ADR-NNN` or `adr-NNN-<slug>` — see
`WOLVEN.md`'s architecture-claims rule. `wolven-harness validate` resolves
every such reference against `docs/adrs/`, so a profile ADR that fails these
rules breaks every claim that depends on it, not just itself.

## Example

```yaml
---
type: adr
title: Short decision name
description: One sentence — what changed and why.
status: stable
---
```

A `deprecated` ADR adds `superseded_by: adr-NNN-<slug>`.
