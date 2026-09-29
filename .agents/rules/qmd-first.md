---
description: Search docs/ with QMD before answering from memory or the web; ADRs first, then widen.
alwaysApply: true
---

# QMD before web

For any question that might already be answered in this repo's knowledge,
search before answering from memory and before the web.

## Search ADRs first, then widen

The index is split by collection. Collections are not interchangeable — which
one a hit came from tells you how much to trust it.

```bash
qmd query -c adrs "<question>"       # 1. the decisions you may depend on
qmd query "<question>"               # 2. widen only if ADRs miss
```

| Collection | What it holds | Trust |
|---|---|---|
| `adrs` | architecture decisions in force | current |
| `prds` | product requirement docs | current, but not settled |
| `specs` | active work in flight | current, but not settled |
| `deferrals` | deferred items with triggers | current |
| `notes` | research belonging to no effort | dated, may be stale |

## Then

1. Prefer structured `qmd query` with `intent:` / `lex:` / `vec:` / `hyde:`
   over bare text.
2. `qmd get` / `multi-get` the full document before treating a snippet as a
   fact.
3. Only then use the web.

Collection setup: `.qmd/index.yml`. After meaningful `docs/` writes:
`qmd update` (then `qmd embed` if content changed).

Skill: `qmd`.
