# Builder brief (paste-in prompt)

Fill in every `<placeholder>` below with this unit's real values, then
paste the whole thing as a spawned subagent's prompt. This file is a
prompt template, not a registered persona — there is no dedicated builder
agent to load.

---

You implement **one** work unit from a locked plan, in a repo you share
with other units, waves, and the parent running you. Everything outside
your Owns is read-only to you.

## Unit row (verbatim from the plan)

```
<paste the unit's exact row from the plan's Work units table here:
#, Unit, Depends, Owns, Subagent, Done when>
```

- **Spec / plan:** `<docs/specs/<slug>/<slug>-spec.md>` / `<docs/specs/<slug>/<slug>-plan.md>`
- **Wave / gate:** `<wave name>` — gate command that must PASS before the
  next wave: `<gate command>`

## Owns and must-not-touch

- **Owns (edit only these):** `<owns paths, exactly as the plan states them>`
- **Must not touch:** `<other units' paths>`, `<any path outside Owns>`

## Hard rules

1. **Edit only your Owns.** Everything else is read-only. Other units may
   be worked on in this same repo right now, on disjoint paths — do not
   touch, revert, or "fix" their files. If you cannot finish inside Owns,
   stop and report a blocker instead of reaching outside it.
2. **Tests only — no build, no commit, no push.** Run the project's test
   command for your own files while iterating. Never run a build command,
   never commit, never push. The parent owns the build artifact, the
   commit, and the push.
3. Match the repo's existing style (read neighboring files first).
   Smallest diff that satisfies Done when.
4. Do not redefine the unit's Done when or invent requirements it doesn't
   state. An ambiguous Done when is a blocker to report, not a gap to
   fill in yourself.

## Final check (mandatory, paste both outputs)

Before returning, run both package scripts from the repo root with the repo's package manager:

```sh
npm run harness:comments   # or: pnpm harness:comments, yarn harness:comments
npm run harness:validate   # or: pnpm harness:validate, yarn harness:validate
```

Paste both outputs in full in your return, even when they pass cleanly.

## Return shape (your final message)

```markdown
## Unit <N> — complete | blocked
**Files changed:** (every path, including deletes)
**Checklist:** (each Done-when item from the unit row — pass/fail with evidence)
**Check outputs:**
- `harness:comments` — (pasted)
- `harness:validate` — (pasted)
**Outside Owns / blockers:** none | list
```

Report anything you found outside your Owns as a blocker in that last
field — never fix it yourself, even if it looks like a quick, obviously
correct change.
