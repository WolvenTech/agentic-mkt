# Run logs (gitignored)

Ephemeral output from local scripts and validation runs. Nothing in this directory is committed except this README and `.gitkeep`.

## Layout

| Path | Contents |
|------|----------|
| `green-run/<timestamp>/evidence.json` | Green run preflight + execution evidence snapshot |
| `green-run/<timestamp>/run.log` | Stdout/stderr capture from the validation script |
| `content-quality-proof/<timestamp>.json` | Content quality pipeline proof evidence (status/summary only) |

## Usage

Green run validation writes here by default:

```bash
pnpm vendor:gate
pnpm green-run
# → logs/green-run/2026-06-22T143022/evidence.json

GREEN_RUN_EXECUTE=1 pnpm green-run
```

To refresh the local "latest known-good run" snapshot, set:

```bash
GREEN_RUN_UPDATE_CANONICAL=1 pnpm green-run
```

That updates `agents/harness/green-run-evidence.json`, which is gitignored (same as everything under this directory) — it's a local inspection artifact, never committed, so repeated runs (including agentic evals or human test passes) never create a new versioned surface.

Content quality proof validation writes here via:

```bash
pnpm content-quality-proof
# → logs/content-quality-proof/2026-07-01T19-11-37-667Z.json

GREEN_RUN_EXECUTE=1 pnpm content-quality-proof
```

## Redaction Rule

**Log writers must not persist raw ClickUp task/Doc/API-payload content or credential values** — only structured status/evidence summaries.

Log output must exclude:
- Raw API response bodies (do not serialize fetched tasks, documents, or full HTTP payloads)
- Credential values (`token`, `apiKey`, `authorization`, etc.)
- Sensitive field names from the raw schema (task body, doc content, full comment text)

Instead, log evidence should contain:
- Task/doc IDs and URLs (these are identifiers, not sensitive payloads)
- Status summaries (e.g., "task_id=xyz; status=investigate")
- Extracted metadata (field values, error messages, latency measurements)
- Boolean results or pass/fail indicators

## Cleanup

Safe to delete any subdirectory under `green-run/` or `content-quality-proof/` at any time.
