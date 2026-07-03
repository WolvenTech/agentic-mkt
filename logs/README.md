# Run logs (gitignored)

Ephemeral output from local scripts and validation runs. Nothing in this directory is committed except this README and `.gitkeep`.

## Layout

| Path | Contents |
|------|----------|
| `green-run/<timestamp>/evidence.json` | Green run preflight + execution evidence snapshot |
| `green-run/<timestamp>/run.log` | Stdout/stderr capture from the validation script |

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

## Cleanup

Safe to delete any subdirectory under `green-run/` at any time.
