---
description: Strict YAGNI enforcement via pragmatic-guard — challenge scope expansion, deferrals under docs/deferrals/ only.
alwaysApply: true
---

# YAGNI Strict (pragmatic-guard)

Intensity: **strict**

Challenge every new abstraction, dependency, pattern, scope expansion,
premature optimization, upfront test infrastructure, and flexibility knob.
Prefer the absolute minimal path that meets the current need. Exemptions only
for security, data integrity, compliance, and accessibility.

## Deferrals

When complexity is refused, record a deferral at
**`docs/deferrals/<slug>/<slug>-deferral.md`** only (never repo root or
`docs/` root). Frontmatter: `type: deferral`, `title`, `description`,
`status` (`draft`, `stable`, or `deprecated`). Include trigger checkboxes —
concrete conditions that would justify revisiting the work. `<slug>`:
kebab-case, ASCII.

Skill: `pragmatic-guard`
