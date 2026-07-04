# agentic-mkt

Configuration-first home for Wolven's **agentic marketing pipeline**: ClickUp briefs trigger n8n workflows that call OpenAI worker agents and deliver drafts back as task comments. This repository holds runtime configs, workflow exports, harness contracts, and build/test tooling — not an application server.

## For Agents and Maintainers

See **[`AGENTS.md`](AGENTS.md)** for the canonical policy document. It contains the authoritative source-of-truth map, command matrix, protected surfaces, live-operation gating rules, secrets handling policy, and cleanup guidance. Start there when in doubt about repository standards.

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
| [`adrs/`](adrs/README.md) | Architecture Decision Records — durable rationale for major design choices |
| [`n8n/`](n8n/README.md) | Host runbook, credentials, MCP stub |
| [`marketing-pipelines/`](marketing-pipelines/README.md) | Workflow JSON exports, import/deploy runbook |
| [`clickup/`](clickup/README.md) | List schema, field mapping, webhook contract |
| [`agents/harness/`](agents/harness/README.md) | I/O contracts, output schema, troubleshooting |
| [`agents/`](agents/README.md) | Runtime agent configs and skills (loaded by n8n) |
| [`logs/`](logs/README.md) | **Gitignored** local run output (green-run evidence, transcripts) |
| [`tests/`](tests/) | Contract and scaffold validation suite |

Planning artifacts (PRD, TechSpec, tasks) live in `.compozy/tasks/` (local, gitignored).

### Source-of-Truth Surfaces and Local State

This repository contains several types of surfaces with different versioning and edit policies:

**Committed & Versioned**
- `src/`, `scripts/`, `tests/` — Source code, utilities, and test fixtures
- `agents/`, `clickup/`, `n8n/` — Agent configs, field contracts, deployment runbooks
- `.env.example` — Committed environment template (never contains real secrets)
- `AGENTS.md` — Canonical agent policy (the authoritative source for repository standards)

**Generated (Protected from Hand-Edit)**
- `marketing-pipelines/*.json` — Workflow exports, auto-generated from TypeScript builders in `src/workflows/`. Use `pnpm build:workflows` to regenerate; never hand-edit. Validated by `pnpm build:workflows:check` in CI.

**Runtime Configs**
- `.env` — Local secrets and API keys (not committed; copy from `.env.example`)
- `clickup/field-mapping.json` — ClickUp schema snapshot, synced via `pnpm clickup:sync`

**Local-Only & Gitignored**
- `.compozy/` — Planning state, task records, cleanup reports (unversioned, local-only)
- `logs/` — Run output from `pnpm green-run` and scripts (ephemeral, untracked except README)
- `agents/harness/green-run-evidence.json` — Local inspection artifact from live proof runs
- `.agents/`, `.cursorrules`, `.clauderules`, `.claude/` — Local IDE/tool adapters (optional, can be symlinks to canonical `AGENTS.md`)

**Key Principle:** Only durable architectural rules are committed (in `AGENTS.md` and this README). Generated outputs, local planning state, and tool-specific adapters remain local-only or unversioned.

For the full source-of-truth map and edit policies, see [`AGENTS.md`](AGENTS.md) — especially the "Source-of-Truth Map" section.

## Workflow Architecture

### Code Node Source Ownership

All n8n **Code node runtime logic** is authored as normal JavaScript source files in `src/workflows/<workflow-slug>/code-nodes/<node-slug>.js`. These `.js` files are the only source of truth for the logic that runs inside n8n Code nodes.

**TypeScript workflow builders** in `src/workflows/build-*.ts` own the workflow topology, node IDs, non-Code-node parameters, credential placeholders, expressions, and generated export shape.

| Surface | Ownership | Edit | Test |
|---------|-----------|------|------|
| `src/workflows/*/code-nodes/**/*.js` | Code node runtime logic (source of truth) | Edit as normal JavaScript | `pnpm lint:code-nodes`, `pnpm test` |
| `src/workflows/build-*.ts` | Workflow topology, shape, non-Code-node params | Edit TypeScript builders | `pnpm test`, `pnpm build:workflows` |
| `marketing-pipelines/*.json` | Generated workflow exports (artifact) | Do not hand-edit | `pnpm build:workflows:check` |

### Editing Code Node Logic

When you need to change the logic that runs inside an n8n Code node:

1. Find the matching Code node `.js` file under `src/workflows/<workflow-slug>/code-nodes/`
2. Edit it as normal JavaScript (uses n8n runtime globals: `$input`, `$json`, `$execution`, `$getWorkflowStaticData`, `Buffer`, `console`)
3. Run verification:
   ```bash
   pnpm lint:code-nodes      # Check for lint issues
   pnpm test                 # Run offline tests
   pnpm build:workflows      # Regenerate workflow JSON
   pnpm build:workflows:check # Verify generated output matches committed baseline
   ```
4. Review the diff — Code node changes appear as readable JavaScript diffs, while generated JSON remains an artifact.

### Editing Workflow Shape

When you need to change workflow topology, routing, node IDs, or non-Code-node parameters:

1. Edit the TypeScript builder: `src/workflows/build-call-agent.ts` or `src/workflows/build-marketing-pipeline.ts`
2. Run verification:
   ```bash
   pnpm test                 # Run offline tests
   pnpm build:workflows      # Regenerate from the builder
   pnpm build:workflows:check # Verify generated output
   ```

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

Scripts write ephemeral output under [`logs/`](logs/README.md). That directory is gitignored except `logs/README.md` and `logs/.gitkeep`. To refresh the local "latest known-good run" snapshot:

```bash
GREEN_RUN_UPDATE_CANONICAL=1 pnpm green-run
```

This writes `agents/harness/green-run-evidence.json`, which is itself gitignored — it's a local inspection artifact, not a committed one, so re-running it never creates a new versioned surface.

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
- [agents/harness](agents/harness/README.md) — I/O envelopes, operational runbook
- [agents](agents/README.md) — agent config, skill copy from skill-vault

## Production

- n8n host: `n8n.wolven.com.br`
- Runtime config repo: `WolvenTech/agentic-mkt`, branch `main`
- Model: OpenAI `gpt-4.1-mini` via n8n OpenAI Chat Model node (see [`src/call-agent/logic.ts`](src/call-agent/logic.ts))
