# agentic-mkt

Configuration-first home for Wolven's **agentic marketing pipeline**: ClickUp briefs trigger n8n workflows that call Gemini worker agents and deliver drafts back as task comments. This repository holds runtime configs, workflow exports, harness contracts, and build/test tooling — not an application server.

## Architecture

| Layer | Role |
|-------|------|
| **ClickUp** | Human GUI — briefs, status workflow, draft review |
| **n8n** | Orchestrator and sole ClickUp mutator |
| **GitHub (this repo)** | Versioned agent configs + skills fetched at execution |
| **LLM worker** | Pure function — no ClickUp write access |

```
ClickUp: Ready to Work → webhook → n8n → Gemini → task comment → Review
```

## Repository layout

| Path | Purpose |
|------|---------|
| [`n8n/`](n8n/README.md) | Workflow JSON exports, orchestration runbooks |
| [`clickup/`](clickup/README.md) | List schema, field mapping, webhook contract |
| [`agent-harness/`](agent-harness/README.md) | I/O contracts, output schema, troubleshooting |
| [`agents/`](agents/README.md) | Runtime agent configs and skills (loaded by n8n) |
| [`logs/`](logs/README.md) | **Gitignored** local run output (green-run evidence, transcripts) |
| [`tests/`](tests/) | Contract and scaffold validation suite |

Planning artifacts (PRD, TechSpec, tasks) live in `.compozy/tasks/` (local, gitignored).

## Quick start

### Prerequisites

- Python 3 (current tooling — TypeScript migration in progress; see `.compozy/tasks/python-to-typescript-migration/`)
- ClickUp API token and list ID for operational scripts (copy [`.env.example`](.env.example) → `.env`)

### Run tests

```bash
python3 -m unittest discover -v
```

### Common commands (current — pre-migration)

| Task | Command |
|------|---------|
| Regenerate workflow JSON | `python3 n8n/scripts/build_call_agent_workflow.py` and `python3 n8n/scripts/build_marketing_pipeline_workflow.py` |
| Sync ClickUp field IDs | `python3 clickup/sync-field-mapping.py` |
| Verify ClickUp API | `python3 clickup/verify-api.py` |
| Green run preflight | `python3 clickup/green_run_validation.py` |
| Green run execute | `GREEN_RUN_EXECUTE=1 python3 clickup/green_run_validation.py` |

After migration, these become `pnpm build:workflows`, `pnpm clickup:sync`, etc. — see the migration TechSpec.

### Run logs

Scripts write ephemeral output under [`logs/`](logs/README.md). That directory is gitignored except `logs/README.md` and `logs/.gitkeep`. To promote a successful green run into committed docs:

```bash
GREEN_RUN_UPDATE_CANONICAL=1 python3 clickup/green_run_validation.py
```

Then commit `agent-harness/green-run-evidence.json` manually.

## Domain documentation

Each top-level folder has a README with purpose, key files, and manual setup:

- [n8n](n8n/README.md) — import workflows, credentials, isolation test
- [clickup](clickup/README.md) — list creation, field sync, webhook binding
- [agent-harness](agent-harness/README.md) — I/O envelopes, M2 operational runbook
- [agents](agents/README.md) — agent config, skill copy from skill-vault

## Production

- n8n host: `n8n.wolven.com.br`
- Runtime config repo: `rafiti052/agentic-mkt` (private), branch `main`
- M1 model: Gemini 2.5 Flash via n8n Google AI node
