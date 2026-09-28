# Handoff template

Save this file to the OS temp directory (never the repository workspace).
Tailor sections to what the next session actually needs; drop a section
only when it is genuinely empty.

```markdown
# Handoff — <short title>

**From session:** <date / runtime>
**Next-session goal:** <one sentence — what the next session should accomplish>

## Context

<3-8 bullets: decisions made, current state, what is blocked>

## Artifacts

| Path or link | Role |
|---------------|------|
| docs/specs/<slug>/<slug>-spec.md | Active spec |
| docs/specs/<slug>/<slug>-plan.md | Active plan |
| <branch name> @ <commit SHA> | In-flight work |
| <pull request link> | Open for review |

Cite paths and links only — never paste an artifact's body into this file.

## Open decisions

- <Decision still unset — include a recommended default if there is one>

## Suggested next skills

| Skill | Why |
|-------|-----|
| `code-execute` | Continue the next ordered work unit |
| `code-pr` | Push and open (or amend) a pull request once the change is ready |
| `grilling` | Pressure-test an open decision before committing to it |
| `research` | Settle an open question with primary evidence |

Name only skills that exist in this package.

## Cross-runtime notes

- **Claude Code:** attach this file, or reference its absolute path in the
  first prompt of the new session, so it is read before any other work
  starts.
- **Codex:** reference this file's absolute path in the first prompt; it
  reads like any other local file the session is pointed at.
- **Cursor:** attach or reference this file's absolute path in the first
  prompt of the new chat; treat it as context, not as instructions to run.

## Redactions

<List anything removed: secrets, tokens, credentials, personal data — or "none">
```

## When to use

- A session ends before the work completes and a fresh session — this
  runtime or another — will continue it.
- A machine or worktree hop moves the work to a different checkout.

## When NOT to use

- The same session keeps going with no runtime, machine, or worktree hop.
- One artifact already captures everything needed — send its path instead
  of writing a second document.

## Anti-patterns

- Pasting a full spec, plan, or diff body instead of citing its path
- Leaving a secret, token, credential, or personal detail in the file
- Saving the handoff file inside the repository workspace
- Missing suggested skills — the next session should not have to guess
  routing
- Naming a skill this package does not ship
