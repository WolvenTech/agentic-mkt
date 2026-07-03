# Agent Harness

## Purpose

I/O contract and output schema for the Call Agent sub-workflow — the reusable API surface between n8n orchestration and worker agents. Enables validation, operator troubleshooting, and future MCP/CLI work without duplicating interface definitions across workflows.

## Contract overview

| Envelope | Direction | Documented in |
|----------|-----------|---------------|
| `CallAgentInput` | Main → Call Agent sub-workflow | [`io-contract.md`](io-contract.md#input-callagentinput) |
| `AgentOutput` | Sub-workflow → Main (success) | [`io-contract.md`](io-contract.md#output-agentoutput), [`output-schema.json`](output-schema.json) |
| `{ error, raw_response }` | Sub-workflow → Main (parse failure) | [`io-contract.md`](io-contract.md#error-envelope) |
| ClickUp comment template | Main → ClickUp | [`io-contract.md`](io-contract.md#clickup-task-comment-format) |

M1 has **no idempotency** (ADR-001). Field names match TechSpec **Core Interfaces**.

## Key files

| Path | Purpose |
|------|---------|
| [`io-contract.md`](io-contract.md) | Input envelope, sub-workflow contract, error handling, ClickUp comment template, troubleshooting, reusable patterns |
| [`output-schema.json`](output-schema.json) | JSON Schema for required Gemini response shape (`AgentOutput`) |
| [`green-run-evidence.json`](green-run-evidence.json) | Committed green-run scaffold; promote from `logs/green-run/` after verified run |
| [`../agents/linkedin-writer.json`](../linkedin-writer.json) | M1 agent config; `output_schema` is the semantic source of truth |

## M2 operational runbook

After the M1 green run (task_08), operators use this harness for diagnosis and cross-project replication:

1. **Verify a run succeeded** — compare against [`io-contract.md` → M1 green run evidence](io-contract.md#m1-green-run-evidence). Update [`green-run-evidence.json`](green-run-evidence.json) after each production validation.
2. **Trace failures** — follow [`io-contract.md` → Troubleshooting](io-contract.md#troubleshooting) (webhook ingress, stuck In Progress, Gemini parse, field ID mismatches).
3. **Understand timing** — [`io-contract.md` → Workflow sequence expectations](io-contract.md#workflow-sequence-expectations) documents the marketing lead experience and n8n node sequence.
4. **Replicate on new projects** — adopt the four patterns in [`io-contract.md` → Reusable harness patterns](io-contract.md#reusable-harness-patterns) (sub-workflow contract, status flow, brief gate, GitHub runtime config).

**MCP/CLI:** [`../../n8n/mcp-config.stub.json`](../../n8n/mcp-config.stub.json) remains a stub in M1 — no implementation required for Milestone 2.

## Manual setup

No runtime setup in M1. Contracts are referenced by:

- **task_06** — Call Agent sub-workflow Code node validation against `output-schema.json`
- **task_07** — Marketing Pipeline main workflow comment template from `io-contract.md`
- **task_09** — Expanded troubleshooting, patterns, and green-run evidence (Milestone 2 complete)

**Validation:** `pnpm test tests/harness.test.ts tests/documentation.test.ts`
