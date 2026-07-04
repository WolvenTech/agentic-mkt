# Canonical Agent Guidelines for agentic-mkt

This is the authoritative source of project policy, commands, protected surfaces, and standards for all agents and humans working in this repository. See the README for human-oriented quick start and overview; this document is the agent contract.

---

## Purpose: What This Document Governs

This document defines:
- **Source of Truth**: Ownership, edit policy, and validation for every repository artifact
- **Commands**: All deterministic commands agents must run with their scope, offline/live classification, and prerequisites
- **Protected Surfaces**: Files and contracts that require dual validation before breaking changes
- **Generated Artifacts**: Production and validation rules for generated outputs
- **Live Operations**: Gating and safety rules for vendor mutations (n8n, ClickUp, external APIs)
- **Secrets & Logs**: Handling rules for credentials, sensitive data, and runtime evidence
- **Local Adapters**: Policy for tool-specific, unversioned guidance files
- **Code Health**: YAGNI/AHA consolidation rules and cleanup judgment framework
- **Boundaries**: The 4-5 modular ownership/contract boundaries that define the repo scaffold

This guidance applies to the entire repository and supersedes tool-specific local adapters (`.agents/`, `.cursorrules`, `.clauderules`, `.claude/`, etc.), which must not define independent project policy.

---

## Source-of-Truth Map

Each row documents an artifact type, owner role, edit policy, and validation command. Breaking changes to protected surfaces require dual validation (producer + all callers).

| Surface | Type | Owner | Edit Policy | Validation Command | Status |
|---------|------|-------|------------|-------------------|--------|
| `README.md` | File | Repo Maintainers | Edit to reflect major changes; points to `AGENTS.md` for canonical policy | `grep -q "AGENTS.md" README.md` | Exists; human onboarding |
| `AGENTS.md` (root) | File | Repo Maintainers | Canonical policy; version-controlled; breaking changes require community review | `pnpm test && grep -E "(source-of-truth\|command matrix\|protected surfaces)" AGENTS.md` | This file |
| `agents/` | Directory | Agent Config Maintainers | Modify agent JSON configs; add/update skills; protect from deletion | `pnpm test tests/agents.test.ts` | Runtime contracts; GitHub-loaded |
| `agents/harness/io-contract.md` | File | Harness Maintainers | Strictly document harness I/O shape; breaking changes require dual validation | `pnpm test && grep -E "(input\|output)" agents/harness/io-contract.md` | 25KB; harness contract |
| `agents/harness/output-schema.json` | File | Harness Maintainers | JSON schema for harness output; validate against all callers before changes | `pnpm test && jq '.properties' agents/harness/output-schema.json > /dev/null` | Protected |
| `agents/harness/green-run-evidence.json` | File | Local Run Output | Generated during `pnpm test:live`; ignored in `.gitignore`; local-only proof | `git check-ignore agents/harness/green-run-evidence.json` | Ignored; never committed |
| `clickup/field-mapping.json` | File | ClickUp Integration Owner | Synced via `pnpm clickup:sync`; manual edits risk desynchronization | `pnpm clickup:verify && jq '.fields' clickup/field-mapping.json > /dev/null` | External API contract |
| `clickup/webhook-contract.md` | File | ClickUp Integration Owner | Operational reference for webhook shapes; update only when ClickUp API changes | `pnpm test && grep -q "signature\|validation" clickup/webhook-contract.md` | 8.4KB; API contract |
| `clickup/list-schema.md` | File | ClickUp Integration Owner | Operational reference for ClickUp list structure; update when API version changes | `pnpm test && grep -q "task\|field" clickup/list-schema.md` | 5.3KB; API reference |
| `clickup/fixtures/` | Directory | ClickUp Integration Owner | Test fixtures lock ClickUp API response shapes; update only when API version changes (document the change in fixture comments) | `jq '.' clickup/fixtures/*.json > /dev/null` | 10 JSON contracts |
| `marketing-pipelines/` | Directory | n8n Workflow Owner | DO NOT hand-edit `.json` files; change via `src/workflows/` builders + `pnpm build:workflows` | `pnpm build:workflows:check` | Generated; read-only |
| `marketing-pipelines/*.json` | Files | Generated (`pnpm build:workflows`) | Generated from `src/workflows/`; never hand-edited; delete and regenerate if cleanup needed | `pnpm build:workflows:check` | Bitwise-stable; 2 files |
| `src/workflows/` | Directory | Workflow Builders | Source-of-truth for workflow logic; edit to change n8n behavior; regenerate JSON after | `pnpm build:workflows && pnpm build:workflows:check` | 5 builders; authoritative |
| `src/workflows/build-marketing-pipeline.ts` | File | Workflow Builders | Edit to change marketing pipeline behavior and Code node logic | `pnpm build:workflows && pnpm build:workflows:check` | 32KB builder |
| `src/workflows/build-call-agent.ts` | File | Workflow Builders | Edit to change call-agent workflow behavior | `pnpm build:workflows && pnpm build:workflows:check` | 9.6KB builder |
| `src/`, `scripts/` | Directories | Source Code Owner | Edit to add/refactor source modules and CLI scripts; validate with `pnpm test && pnpm build:workflows` | `pnpm test && pnpm build:workflows:check` | Authoritative logic |
| `tests/` | Directory | Test Maintainers | Add/modify unit and integration tests; protect test fixtures | `pnpm test` | 20+ test files |
| `.env.example` | File | Repo Maintainers | Committed environment contract; never expose real secrets | `grep -v "^#" .env.example \| grep -E "^[A-Z_]+="`  | Template; never secrets |
| `.github/workflows/ci.yml` | File | CI/CD Owner | Modify to add CI steps (e.g., secret scanning); preserve validation gates | `pnpm test && pnpm build:workflows:check` | Lives CI pipeline |
| `.gitignore` | File | Repo Maintainers | Preserve ignore rules for secrets, local state, logs, adapters (per ADR-002) | `git check-ignore .compozy/ .agents/ .env logs/ .claude/` | Protective |
| `logs/` | Directory | Local Run Output | Local-only logs and run evidence; explicitly ignored except for README and .gitkeep | `git check-ignore logs/example.log && git ls-files logs/` | Ignored; ephemeral |
| `logs/README.md` | File | Repo Maintainers | Document log layout, purpose, and redaction rule for log writers | `grep -q "content-quality-proof\|redaction" logs/README.md` | (Incomplete; task_18) |
| `.agents/` | Directory | Local/Tool Adapters | Local guidance for agents; can symlink or mirror `AGENTS.md`; NOT versioned | `git check-ignore .agents/ && ! git ls-files .agents/` | Ignored; optional mirror |
| `.cursorrules` | Symlink | Cursor IDE | Symlink to canonical `AGENTS.md`; never hand-edit | `ls -l .cursorrules && git check-ignore .cursorrules` | Ignored; optional |
| `.clauderules` | Symlink | Claude IDE | Symlink to canonical `AGENTS.md`; never hand-edit | `ls -l .clauderules && git check-ignore .clauderules` | Ignored; optional |
| `.compozy/` | Directory | Local Planning | Task records, cleanup reports, execution artifacts; explicitly ignored | `git check-ignore .compozy/ && ! git ls-files .compozy/` | Ignored; transient |
| `package.json` | File | Repo Maintainers | Edit to add/update scripts and dependencies; preserve command matrix | `pnpm install --dry-run && jq '.scripts' package.json > /dev/null` | Workspace config |

**Key Principles:**
- Every surface is either **Authoritative** (source-of-truth), **Generated** (read-only, produced by builders), **External** (owned by external systems), **Protected** (contracts requiring dual validation), or **Local-Only** (unversioned).
- Generated artifacts must never be hand-edited.
- External API contracts are synced via deterministic commands (e.g., `pnpm clickup:sync`) and must not be manually adjusted.
- Breaking changes to protected surfaces require validation of all callers.
- Local adapters are tools-specific, unversioned, and must not define independent policy.

---

## Deterministic Command Matrix

Every command is classified as **Offline** (safe to run without live API access) or **Live** (requires valid ClickUp/n8n credentials and connectivity). Always run `pnpm vendor:gate` before any live command.

| Command | Purpose | Scope | Offline/Live | Prerequisites | When to Run |
|---------|---------|-------|-------------|---------------|------------|
| `pnpm test` | Run all offline unit tests | Unit tests for src/, scripts/, contracts, CLI | Offline | None | On every commit; CI gate |
| `pnpm test:watch` | Watch mode for unit tests | Same as `pnpm test` | Offline | None | During local development |
| `pnpm test:coverage` | Unit tests with V8 coverage | Same scope, with coverage stats | Offline | None | Before release; CI gate |
| `pnpm vendor:gate` | Verify ClickUp/n8n credentials & connectivity | Environment validation; gate prerequisite | Live | Valid `.env` with CLICKUP_API_TOKEN, N8N_API_KEY | Before any live command; required for `pnpm test:live` |
| `pnpm test:live` | Run live integration tests | Tests touching ClickUp/n8n APIs | Live | `pnpm vendor:gate` must pass first | In gated CI only; never in offline tests |
| `pnpm build:workflows` | Regenerate workflow JSON from builders | Produces `marketing-pipelines/*.json` from TypeScript builders | Offline | Valid TypeScript; no live dependencies | After editing `src/workflows/` builders |
| `pnpm build:workflows:check` | Verify committed JSON matches generated output | Compares `marketing-pipelines/*.json` against `pnpm build:workflows` output | Offline | None | Before commit; CI gate |
| `pnpm deploy:workflows` | Deploy generated workflows to live n8n | Pushes `marketing-pipelines/*.json` to n8n endpoint | Live | `pnpm vendor:gate` must pass; valid N8N_API_KEY | Only after `pnpm build:workflows` and `pnpm build:workflows:check` |
| `pnpm validate` | Run all validation checks | Combines test, build check, ClickUp verify | Offline (mostly) | None | Before PR; convenience wrapper |
| `pnpm clickup:sync` | Sync ClickUp custom field mapping | Updates `clickup/field-mapping.json` from live ClickUp API | Live | `pnpm vendor:gate` must pass; valid CLICKUP_API_TOKEN | After ClickUp custom field changes |
| `pnpm clickup:verify` | Verify ClickUp connection and schema | Validates connectivity and field-mapping structure | Live | `pnpm vendor:gate` must pass | Before live operations; part of vendor gate |
| `pnpm green-run` | Run end-to-end green-run validation | Validates pipeline logic without breaking production ClickUp | Live | `pnpm vendor:gate` must pass; safe test list configured | Staged CI or manual validation before deploy |
| `pnpm executions:inspect` | Inspect latest n8n execution results | Query and display n8n execution logs and status | Live | `pnpm vendor:gate` must pass; valid N8N_API_KEY | Debugging live workflows |
| `pnpm lint:code-nodes` | Lint workflow Code node JavaScript | ESLint check on `.js` files in `src/workflows/*/code-nodes/` | Offline | None | Before committing Code node changes |

**Gate Rules:**
- **Every live command must be preceded by `pnpm vendor:gate`** or must explicitly call the gate internally.
- `pnpm test:live` is wired to call `pnpm vendor:gate` automatically; other live scripts should either call `runGate()` or be routed through the gate explicitly (task_14–16 will harden this).
- Exit codes for `pnpm vendor:gate`: **0** = healthy, **1** = missing env vars, **2** = connectivity failure. Do not proceed if exit code is 1 or 2.

---

## Protected Surfaces and Dual-Validation Rule

The following surfaces are **protected** from direct edits. Breaking changes require dual validation: (1) update the producer/source, (2) validate all callers.

### 1. Agent Runtime Configs and Harness Contracts
- **Files**: `agents/{id}.json`, `agents/harness/io-contract.md`, `agents/harness/output-schema.json`
- **Rule**: Agent JSON configs are loaded from GitHub at execution time; local files are source-of-truth references only. Do not hand-edit. All agent changes flow through GitHub updates and n8n workflow reimport.
- **Validation**: `pnpm test tests/agents.test.ts` after any agent config or skill modification.

### 2. ClickUp Field Contract and API Schemas
- **Files**: `clickup/field-mapping.json`, `clickup/webhook-contract.md`, `clickup/list-schema.md`, `clickup/fixtures/*`
- **Rule**: The field-mapping.json is synced from the live ClickUp API via `pnpm clickup:sync`. Never hand-edit. Webhook and list schemas are operational references; update only when ClickUp API shapes change (document the change in fixture comments).
- **Validation**: `pnpm clickup:verify && pnpm test tests/clickup.test.ts` before commit.

### 3. Generated n8n Workflow JSON
- **Files**: `marketing-pipelines/*.json` (call-agent, marketing-pipeline-main)
- **Rule**: These are generated from TypeScript builders in `src/workflows/` and must never be hand-edited. Change workflow behavior via builders, then run `pnpm build:workflows` to regenerate JSON. All Code node runtime logic lives in `.js` source files, not in the JSON `jsCode` parameters.
- **Validation**: `pnpm build:workflows` to regenerate, then `pnpm build:workflows:check` to verify. The check is enforced in CI on every PR.

### 4. Environment Variable Contract
- **File**: `.env.example`
- **Rule**: Documents all required environment variables and their sources. Never expose real secrets. The contract defines the shape of the `.env` file; breaking changes to required vars require notice and migration guidance.
- **Validation**: Verify any new secrets are added to `.env.example` (without values) and documented.

---

## Generated-File Ownership and Validation

Every generated artifact has an identified producer. Generated output is **bitwise-stable**; drift between builder and committed file is detectable via validation commands.

### Rule: All Generated Artifacts Are Bitwise-Stable and CI-Validated

| Generated Artifact | Producer | Validation Command | CI Gate |
|--------------------|----------|-------------------|---------|
| `marketing-pipelines/*.json` | `pnpm build:workflows` (runs `scripts/build-workflows.ts`) | `pnpm build:workflows:check` | `.github/workflows/ci.yml` line 27 |
| `clickup/field-mapping.json` | `pnpm clickup:sync` | `pnpm clickup:verify` | Not in CI (live-only command) |
| `agents/harness/green-run-evidence.json` | `pnpm test:live` | (Local-only; ignored) | N/A |

**Procedure When Generated Output Drifts:**
1. If `pnpm build:workflows:check` fails, regenerate: `pnpm build:workflows`.
2. If `pnpm clickup:verify` fails, resync: `pnpm clickup:sync`.
3. Always validate the generated output with the appropriate check command before committing.
4. If a generator is broken or behaves non-deterministically, report it as a bug; do not hand-edit the output.

---

## Live-Operation Gating and Failure Containment

Vendor operations (n8n deployment, ClickUp task/Doc mutations, execution inspection) pose irreversible-harm risk. All live operations are gated behind deterministic checks.

### Rule: The Vendor Gate Is Mandatory

Before any live operation, **always run `pnpm vendor:gate`** (or call `runGate()` from TypeScript).

- **Exit Code 0**: Healthy. Environment is complete, and connectivity to ClickUp and n8n is confirmed. Proceed with live operations.
- **Exit Code 1**: Missing environment variables. Check `.env` and `.env.example`; ensure all required vars are set.
- **Exit Code 2**: Connectivity failure. ClickUp or n8n is unreachable. Fix network/credentials and retry.
- **Do not proceed if the gate returns 1 or 2.**

### Rule: The VENDOR_GATE_STRICT Bypass Is Restricted to Non-CI Contexts

The `VENDOR_GATE_STRICT=0` environment variable allows warn-only mode (the gate prints warnings but does not block). This bypass is permitted **only in non-CI contexts** (e.g., local development). CI must never set `VENDOR_GATE_STRICT=0`; any attempt to bypass in CI is an error.

**Implementation note**: The bypass is gated using `CI=false` logic in `src/clickup/vendor-gate.ts`. (Hardening this is task_14; currently deferred.)

### Rule: Scripts Must Route Through the Vendor Gate

All scripts that perform live operations must either:
1. Call `runGate()` internally (TypeScript), or
2. Be routed through `pnpm vendor:gate` before execution.

Scripts in scope: `scripts/deploy-workflows.ts`, `scripts/green-run.ts`, `scripts/verify-clickup.ts`, `scripts/inspect-executions.ts`.

**Implementation note**: Routing these scripts through the gate is tasks_14–16; currently deferred.

---

## Secrets and Sensitive Data Handling

Secrets (API keys, tokens, credentials) and sensitive data (raw ClickUp task bodies, API payloads, PII) must never be persisted in version control or logs.

### Rule: Secrets Are Always Local-Only; Never Committed

- Secrets are stored in `.env` (local-only, ignored in `.gitignore`) or external vaults, never committed to version control.
- `.env.example` is a committed template documenting required variables; it never contains real secrets.
- A `gitleaks-action` step runs in `.github/workflows/ci.yml` before `pnpm test`, providing automatic credential detection on every commit. If `gitleaks` fails, do not commit the sensitive content; rewrite history or create a new clean commit.

**Implementation note**: The gitleaks step is task_17; currently deferred.

### Rule: Log Writers Must Redact Sensitive Data

Log writers in `scripts/green-run.ts` and `scripts/content-quality-proof.ts` persist structured output to `logs/green-run/` and `logs/content-quality-proof/`, which are untracked and local-only.

**Redaction Policy:**
- Log writers must not persist raw ClickUp task bodies, Doc content, or API payload content.
- Only structured status/evidence summaries are permitted.
- Known-sensitive key names (`token`, `apiKey`, `authorization`, and full `body` fields) must be excluded from log output.
- `logs/README.md` documents the layout and redaction rule.
- A test validates log-writer output for compliance.

**Implementation note**: The logs/README.md update and redaction test are task_18; currently deferred.

---

## Local-Adapter Policy and Unversioned State

Local tool adapters (`.agents/`, `.cursorrules`, `.clauderules`, `.claude/`, `.codex/`) are tool-specific configurations and are **never versioned** in this repository.

### Rule: Local Adapters May Mirror or Symlink Canonical Rules; No Independent Policy

- Local tool adapters are explicitly ignored in `.gitignore` and are never committed.
- These may be symlinks or mirrors of the canonical root `AGENTS.md`, but must **not define independent project policy**.
- Reusable logic lives in `src/` modules, not adapter-specific scripts or guidance files.
- Composition roots (entry points, workflow builders, script runners) are clearly identified and reference the canonical rules, not adapter-specific guidance.

**Encouraged Pattern:**
```bash
# Symbolic link local adapter to canonical AGENTS.md
ln -s ../../AGENTS.md .agents/AGENTS.md
ln -s ../../AGENTS.md .cursorrules
ln -s ../../AGENTS.md .clauderules
```

This ensures agents reading local adapter files get the authoritative version.

### Rule: Planning State in .compozy/ Is Always Local-Only

The `.compozy/` directory and all its contents (task records, cleanup reports, run logs, execution state) are explicitly ignored in `.gitignore` and are never versioned.

- Planning artifacts remain local-only.
- Only durable canonical rules are promoted to committed `AGENTS.md`.
- The cleanup-report.md records findings and dispositions locally; later tasks apply approved changes to the repository.

### Rule: Logs and Runtime Artifacts Are Ephemeral and Local-Only

Log files and runtime execution artifacts (`logs/`, `agents/harness/green-run-evidence.json`) are explicitly ignored in `.gitignore` and are never versioned.

- Run output is ephemeral; verified evidence is promoted into committed harness documentation only after review.
- `logs/README.md` documents the log layout and redaction rule; log writers must not persist sensitive data.

---

## Code Health: YAGNI/AHA Consolidation and Cleanup Judgment

The repository follows the YAGNI (You Aren't Gonna Need It) and AHA (Avoid Hasty Abstractions) principles for code quality. These rules guide cleanup and consolidation decisions.

### Rule: Consolidate Repeated Patterns; Test Before Deletion

When the same pattern appears in 3+ places, consider consolidating:

- **Example**: The three `ingressMatches*` functions in `src/marketing-pipeline/logic.ts` (ingressMatchesInvestigate, ingressMatchesWrite, ingressMatchesFormat) follow identical logic with only the stage name differing.
- **Judgment**: Extract a parameterized `ingressMatchesStage(payload, fieldMapping, stage)` function. Keep the three public functions as wrappers for backward compatibility or update all callers.
- **Validation**: Add a test validating the consolidated function against all three cases.

### Rule: All Public Exports Are Active and Well-Used; No Dead Code

- Before marking a function for deletion, verify it is not used in tests, builders, or external scripts via `grep`.
- Only remove dead code when it is confirmed unused across the entire repository.
- Document the removal in the commit message with the verification command.

### Rule: Do Not Design for Hypothetical Future Requirements

- Do not add abstractions or scaffolding for features that are not yet needed.
- If code is needed, build it. If it is not needed, delete it. Do not leave half-finished implementations.
- When in doubt, keep the simpler explicit version; three similar lines are better than a premature abstraction.

---

## Modular Scaffolding Principles

The repository is organized around **4-5 data-ownership and contract-crossing boundaries**, not folder structure. These boundaries define clear ownership, edit policy, and validation for the repository's major moving parts.

### The Five Boundaries

1. **Hand-Written Source and Scripts** (`src/`, `scripts/`, `tests/`, `package.json`)
   - Owner: Source Code Owner / Script Maintainers
   - Policy: Edit freely; validate with `pnpm test && pnpm build:workflows`.
   - Boundary Crossing: Code imports from other modules via TypeScript imports.

2. **Generated n8n Workflow Exports** (`marketing-pipelines/*.json`, produced by `pnpm build:workflows`)
   - Owner: n8n Workflow Owner (producers are the builders in `src/workflows/`)
   - Policy: Never hand-edit. Change via builders, then regenerate.
   - Boundary Crossing: n8n consumes the JSON; agents/scripts consume the JSON; CI validates the JSON.
   - Validation: `pnpm build:workflows:check`

3. **ClickUp API Contract** (`clickup/field-mapping.json`, `clickup/webhook-contract.md`, `clickup/list-schema.md`, `clickup/fixtures/`)
   - Owner: ClickUp Integration Owner (external API)
   - Policy: Synced via `pnpm clickup:sync`. Never hand-edit the field-mapping. Schemas updated when API version changes.
   - Boundary Crossing: External ClickUp API ↔ Local field-mapping; workflows consume field-mapping; tests validate with fixtures.
   - Validation: `pnpm clickup:verify && pnpm test tests/clickup.test.ts`

4. **Agent Harness I/O Contract** (`agents/harness/io-contract.md`, `agents/harness/output-schema.json`, agent JSON configs in `agents/`)
   - Owner: Harness Maintainers
   - Policy: Protect from direct edits. Agent configs are GitHub-loaded; harness contracts document the expected I/O shape.
   - Boundary Crossing: Call Agent workflow ↔ Agent I/O; harness validates output against schema.
   - Validation: `pnpm test tests/agents.test.ts`

5. **Local Planning State** (`.compozy/`, `logs/`, local adapter configs)
   - Owner: Local Planning / Task Runners
   - Policy: Never versioned. Local-only.
   - Boundary Crossing: Local artifacts inform decisions; durable rules are promoted to canonical `AGENTS.md`.
   - Validation: `git check-ignore` confirms files are ignored.

### Rule: Boundaries Are Defined by Data Ownership and Contracts, Not Folder Location

A new boundary is created when a distinct artifact type or consumer shape crosses existing boundaries. For example:
- If a new script consumes `marketing-pipelines/*.json` in a different shape (not just reading it as-is), it may require a new boundary definition and validation check in this source-of-truth map.
- If `agents/` expands to include runtime configs *and* persistent state, two separate boundaries (one per contract) should be listed.

---

## Cleanup Finding Categories

The repository uses six cleanup categories to classify artifacts. These guide code review and maintenance decisions.

### The Six Categories

1. **`delete`** — Remove obsolete, unused, or superseded artifacts.
   - Risk: Low (if artifact is verified unused and no runtime contracts depend on it).
   - Example: Unused test fixtures, dead functions, deprecated config files.
   - Validation: Verify via `grep` or automated dead-code detection that no tests, scripts, or external systems consume the artifact.

2. **`consolidate`** — Merge or refactor duplicated logic, overlapping modules, or redundant configuration.
   - Risk: Medium–High (requires careful validation of all consumers).
   - Example: Three functions with identical logic but different hardcoded values; consolidate into a parameterized version.
   - Validation: Add a test validating the consolidated version matches all original cases; verify all callers are updated.

3. **`document`** — Add or improve documentation, contracts, comments, or configuration clarity.
   - Risk: Low (improves maintainability without changing behavior).
   - Example: Add missing README section, clarify contract requirements in a docstring, document a protection rule.
   - Validation: Verify the documentation is accurate, matches the code, and improves clarity for future readers.

4. **`fix`** — Correct a defect, incomplete implementation, or contract violation.
   - Risk: Medium (validate the fix against all callers).
   - Example: A script that claims to enforce a rule but does not; a field that is documented but missing from validation.
   - Validation: Add or update tests validating the fix; confirm the fix does not break existing callers.

5. **`protect`** — Mark an artifact as protected or restricted to prevent accidental modification or misuse.
   - Risk: Low (communication-focused; no behavior change).
   - Example: Document that generated JSON files must not be hand-edited; mark a contract file as read-only in this guide.
   - Validation: Verify the protection mechanism is in place (e.g., validation gate in CI, documentation in README).

6. **`defer`** — Acknowledge a valid finding but postpone action.
   - Risk: Deferred findings with high risk on irreversible-harm surfaces (secrets, live-operation gates, PII) must include `risk_acceptance_owner` (a named person) and `risk_acceptance_trigger_date` (an ISO date for re-review).
   - Example: A necessary refactor that is blocked by another task, or a known risk that is being monitored.
   - Validation: Re-review on the trigger date; if the risk remains, apply the finding or escalate.

---

## Summary

This `AGENTS.md` is the canonical source of project policy. All other documentation (README, domain-specific READMEs, local adapters) must reference this file and remain subordinate to its rules. When in doubt about repo standards, read this file first.

**Key Takeaway for Agents**: This repository has clear boundaries, protected surfaces, and deterministic commands. Follow the source-of-truth map, use the command matrix, run `pnpm vendor:gate` before live operations, and validate every change with the appropriate test or check command. When you are unsure, stop and ask—never assume behavior from pre-existing code.

---

Last updated: 2026-07-04
Canonical scope per ADR-006 (rewrite from full scope, not extend pre-existing file)
