---
type: note
title: Harness init 2026-09-29
description: Initial harness setup session for agentic-mkt
status: stable
---

# Harness init 2026-09-29

## Entry integration

Asked whether to fold `WOLVEN.md` into `AGENTS.md` via Light, Full, or Mention-only mode. Recommended Light mode because `AGENTS.md` is a long (388-line), curated file defining canonical guidelines, and Light mode avoids burying existing project rules under router and skills tables. The Human chose Light mode.

Checks raised and resolved:
- Existing `AGENTS.md` content preserved intact; appended the concise `## Wolven harness` section and removed `WOLVEN.md`.
- `CLAUDE.md` already imported `@AGENTS.md`.
- No conflicting routers or standing rules identified.
- Harness-ignored check flagged `.agents/hooks`, `.agents/rules`, `.agents/skills`, and `.claude/skills` excluded by ignore rules in `.gitignore`. Proposed re-include rules appended to `.gitignore`; the Human approved and applied them.
- Doc folders under `docs/` contain only `.gitkeep` placeholders and seeded 000, Record architecture decisions.

## ADR migration

| Number | Title | Legacy status | Mapped status | Evidence | Decision |
| --- | --- | --- | --- | --- | --- |
| 001 | V1 Scope — Happy Path with n8n Orchestration | Superseded by 004; dedup deferral still applies | stable | Body states idempotency/dedup-deferral decision is still source of truth; asserted in tests/contracts/harness.test.ts | Human chose to keep stable as binding decision for idempotency deferral |
| 002 | Agent Config Colocated in agentic-mkt | Accepted | stable | adrs/adr-002.md Status heading | table |
| 003 | Gemini 2.5 Flash as Worker LLM | Superseded — provider is now OpenAI gpt-4.1-mini | stable | adrs/adr-003.md Status heading notes record is kept for provider-agnostic schema and LLM evaluation rationale; no successor ADR written | Human chose to keep stable to preserve evaluation rationale and schema design |
| 004 | Replace Single-Agent Marketing Flow with Staged Content Quality Workflow | Accepted | stable | adrs/adr-004.md Status heading | table |
| 005 | Use Local-First Verification with Live Proof as a Follow-Up Task | Accepted | stable | adrs/adr-005.md Status heading | table |
| 006 | Use Stage-Aware Agent Contracts and Reference Files | Accepted | stable | adrs/adr-006.md Status heading | table |
| 007 | Tag-Based AI Activity Signaling for Staged Columns | Accepted | stable | adrs/adr-007.md Status heading | table |
| 008 | Enforce Exit-Code Contract for Proof and Green-Run Scripts | Accepted | stable | adrs/adr-008.md Status heading | table |
| 009 | Strict Staged Output and Early Editorial Doc Pointer Persistence | Accepted | stable | adrs/adr-009.md Status heading | table |

Relative links were rewritten in all migrated ADRs and referencing caller documents (`integrations/marketing-pipelines/README.md`, `agents/README.md`, `agents/harness/README.md`, `agents/harness/io-contract.md`, `agents/harness/LIVE-PROOF-RUNBOOK.md`, `README.md`). Legacy index `adrs/README.md` was deleted as approved by the Human. All 47 claims resolve cleanly to stable profile ADRs under `docs/adrs/`.

## Discovery

### Context
- Repository: `agentic-mkt`
- Purpose: Configuration-first home for Wolven's agentic marketing pipeline build/test tooling.
- Core architecture:
  - ClickUp for UI/human review gates, task state, and Docs API editorial workspace.
  - n8n for orchestration of the staged marketing pipeline (`investigate` -> `brief review`, `write` -> `content review`, `format` -> `final review`).
  - TypeScript builders (`src/workflows/`) compiling bitwise-stable workflow JSON exports (`integrations/marketing-pipelines/`).
  - OpenAI `gpt-4.1-mini` as compute LLM for stage worker agents (`investigative-brief`, `long-form-argument`, `linkedin-format`).
  - Local-first verification with strict exit-code contracts and live gated proofs.
  - Architecture decisions documented under `docs/adrs/` as profile ADRs.

### Lifecycle
MVP: Core staged pipeline is operational, but features and automation are still evolving.

### Decided tools
- **n8n**: Workflow orchestrator hosting the marketing pipeline and Call Agent workflows.
- **ClickUp**: Human gate review surface, task management, Docs API editorial workspace.
- **OpenAI (API / `gpt-4.1-mini`)**: Compute LLM for stage worker agents.
- **TypeScript / tsx**: Implementation language and runner for workflow builders and validation scripts.
- **Vitest**: Unit, integration, and live testing framework.
- **pnpm**: Package manager (pinned at 11.5.1).
- **ESLint**: Linter for source code and workflow Code nodes.
- **QMD**: Local documentation and knowledge base indexing tool (`.qmd/index.yml`).
- **GitHub Actions**: CI platform running lint, test, and workflow-check jobs (`.github/workflows/ci.yml`).

Decisions not yet visible in code: None; all active decisions are documented in code and the migrated ADRs.

## Research

Repo-only: Discovery evidence from repository files, manifests, lockfiles, and QMD index was sufficient; external web research was skipped per Human preference.

## Suggestions

Suggested three architectural skills based on decided tools:
1. `n8n-workflows`: Authoring and updating TypeScript workflow builders, Code nodes, and generated JSON exports (Evidence: `src/workflows/`, `integrations/marketing-pipelines/`, 004).
2. `clickup-integration`: Managing ClickUp API operations, Docs hierarchy, task tags, custom fields, and vendor gate validation (Evidence: `src/clickup/`, `integrations/clickup/`, 007, 009).
3. `stage-agent-config`: Developing stage agent definitions, role skills, reference templates, and StageAgentOutput schemas (Evidence: `agents/*.json`, `agents/harness/io-contract.md`, 006).

Human picked: `n8n-workflows` and `clickup-integration`.

## Stubs

Rendered ask-only stubs for the selected skills:
- `.agents/skills/n8n-workflows/SKILL.md` + `.agents/skills/n8n-workflows/agents/openai.yaml`
- `.agents/skills/clickup-integration/SKILL.md` + `.agents/skills/clickup-integration/agents/openai.yaml`

Both stubs carry discovery evidence and headed prompt placeholders, marked with `metadata.wolven-harness: stub` and `disable-model-invocation: true`.

## Harness score

- **Before**: Level L3 · Sensing, Score: 75/108 (69%)
- **Dimension decisions**:
  - Hooks & Guardrails (HKS-01..HKS-05): Dropped dimension by adding `"no-hooks"` to `extends` in `.harness-score.json` (repo runs without hooks currently).
  - Skills & Commands (SKL-03, AGT-01, AGT-02): Kept failing checks as gaps to build later.
  - Sensors & Feedback (SNS-04): Kept failing check (auto-formatter) as gap to build later.
  - CI Feedback (CI-04): Kept failing check (pre-commit tooling) as gap to build later.
  - Hygiene & Safety (HYG-05, HYG-08): Dropped HYG-05 (license not applicable for private repo); kept HYG-08 (MCP config credential interpolation) as gap for future MCP work.
- **After**: Level L3 · Sensing (capped), Score: 75/92 (82%)

## Validate wiring

Asked how `harness:validate` should run:
- Recommended: (a) CI job on pull requests (`.github/workflows/ci.yml`)
- Offered: (b) Chained into `validate` script in `package.json`, or (c) Local only
- Human answer: (b) Chained into script
- Applied change: Updated `validate` script in `package.json` to `"tsx scripts/validate.ts && pnpm harness:validate"`.

## Next steps for the Human

- Define the two skill stubs and remove the `wolven-harness: stub` marker once filled:
  - `.agents/skills/n8n-workflows/SKILL.md`: answer when to use, conventions, what to avoid, how to verify.
  - `.agents/skills/clickup-integration/SKILL.md`: answer when to use, conventions, what to avoid, how to verify.
- Address harness score gaps when ready:
  - Add explicit workflow/command entry points (SKL-03) and custom subagent definitions (AGT-01, AGT-02).
  - Add auto-formatter configuration such as Prettier or Biome (SNS-04).
  - Install pre-commit checks with Husky/Lefthook (CI-04).
  - Add MCP configuration with env var credential interpolation if MCP servers are integrated (HYG-08).
