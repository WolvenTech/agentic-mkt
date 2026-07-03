# agentic-mkt

Configuration-first home for Wolven's **agentic marketing pipeline**: ClickUp briefs trigger n8n workflows that call OpenAI worker agents and deliver drafts back as task comments. This repository holds runtime configs, workflow exports, harness contracts, and build/test tooling — not an application server.

## Architecture

| Layer | Role |
|-------|------|
| **ClickUp** | Human GUI — briefs, status workflow, draft review |
| **n8n** | Orchestrator and sole ClickUp mutator |
| **GitHub (this repo)** | Versioned agent configs + skills fetched at execution |
| **LLM worker** | Pure function — no ClickUp write access |

```
ClickUp: backlog → investigate → brief review → write → content review → format → final review → publish
          (each AI stage writes to a shared Editorial Doc; human approval moves the task to the next stage)
```

## Repository layout

| Path | Purpose |
|------|---------|
| [`n8n/`](n8n/README.md) | Host runbook, credentials, MCP stub |
| [`marketing-pipelines/`](marketing-pipelines/README.md) | Workflow JSON exports, import/deploy runbook |
| [`clickup/`](clickup/README.md) | List schema, field mapping, webhook contract |
| [`agents/harness/`](agents/harness/README.md) | I/O contracts, output schema, troubleshooting |
| [`agents/`](agents/README.md) | Runtime agent configs and skills (loaded by n8n) |
| [`logs/`](logs/README.md) | **Gitignored** local run output (green-run evidence, transcripts) |
| [`tests/`](tests/) | Contract and scaffold validation suite |

Planning artifacts (PRD, TechSpec, tasks) live in `.compozy/tasks/` (local, gitignored).

## Quick start

### Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io) (`corepack enable` then `corepack use pnpm@11`)
- ClickUp API token and list ID for operational scripts (copy [`.env.example`](.env.example) → `.env`)

### Setup and tests

```bash
pnpm install

# Offline-safe — no ClickUp/n8n credentials required
pnpm test
```

### Vendor gate (required before live operations)

Before running live ClickUp/n8n CLI validation or live integration tests, verify vendor connectivity:

```bash
pnpm vendor:gate
```

Exit **0** means ClickUp and n8n are reachable with valid credentials. Exit **1** (missing env) or **2** (connectivity/config failure) means **stop** — fix `.env` or vendor setup before continuing tasks that depend on live APIs.

`pnpm test:live` runs `pnpm vendor:gate` first (`pnpm vendor:gate && vitest run --project live`) and stops automatically if vendor connectivity fails — Vitest never runs in that case.

`pnpm vendor:gate` and all ClickUp CLI scripts auto-load the repo-root `.env` (see [`src/load-env.ts`](src/load-env.ts)). Shell-exported vars take precedence over `.env` values. Set `SKIP_DOTENV=1` to skip file loading (used by offline tests). Set `VENDOR_GATE_STRICT=0` for warn-only diagnostics — the gate prints the same checklist but exits `0` regardless of failures (not for task completion gating).

### Common commands

| Task | Command |
|------|---------|
| Run offline test suite | `pnpm test` |
| Run live integration tests (gated) | `pnpm test:live` |
| **Vendor gate** (run first for live work) | `pnpm vendor:gate` |
| Regenerate workflow JSON | `pnpm build:workflows` |
| Deploy workflows to live n8n | `pnpm deploy:workflows` |
| Sync ClickUp field IDs | `pnpm clickup:sync` |
| Verify ClickUp API | `pnpm clickup:verify` |
| Green run preflight | `pnpm green-run` |
| Green run execute | `GREEN_RUN_EXECUTE=1 pnpm green-run` |

### Run logs

Scripts write ephemeral output under [`logs/`](logs/README.md). That directory is gitignored except `logs/README.md` and `logs/.gitkeep`. To promote a successful green run into committed docs:

```bash
GREEN_RUN_UPDATE_CANONICAL=1 pnpm green-run
```

Then commit `agents/harness/green-run-evidence.json` manually.

### Workflow deploy path

After changing workflow builders or logic under `src/workflows/`:

```bash
pnpm build:workflows    # regenerate marketing-pipelines/*.json in this repo
pnpm deploy:workflows   # upsert to n8n.wolven.com.br (requires N8N_API_KEY)
```

Use manual import from [`marketing-pipelines/README.md`](marketing-pipelines/README.md) only for first-time setup or when API deploy is unavailable.

## Domain documentation

Each top-level folder has a README with purpose, key files, and manual setup:

- [n8n](n8n/README.md) — credentials, GitHub PAT, MCP stub
- [marketing-pipelines](marketing-pipelines/README.md) — import workflows, activation, deploy
- [clickup](clickup/README.md) — list creation, field sync, webhook binding
- [agents/harness](agents/harness/README.md) — I/O envelopes, M2 operational runbook
- [agents](agents/README.md) — agent config, skill copy from skill-vault

## Production

- n8n host: `n8n.wolven.com.br`
- Runtime config repo: `WolvenTech/agentic-mkt`, branch `main`
- M1 model: OpenAI `gpt-4.1-mini` via n8n OpenAI Chat Model node (see [`src/call-agent/logic.ts`](src/call-agent/logic.ts))
