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

M1 has **no idempotency** ([ADR-001](../.compozy/tasks/marketing-pipeline-clickup-n8n/adrs/adr-001.md)). Field names match TechSpec **Core Interfaces**.

## Key files

| Path | Purpose |
|------|---------|
| [`io-contract.md`](io-contract.md) | Input envelope, sub-workflow contract, error handling, ClickUp comment template |
| [`output-schema.json`](output-schema.json) | JSON Schema for required Gemini response shape (`AgentOutput`) |
| [`../agents/linkedin-writer.json`](../agents/linkedin-writer.json) | M1 agent config; `output_schema` is the semantic source of truth |

## Manual setup

No runtime setup in M1. Contracts are referenced by:

- **task_06** — Call Agent sub-workflow Code node validation against `output-schema.json`
- **task_07** — Marketing Pipeline main workflow comment template from `io-contract.md`

Expanded with execution IDs and troubleshooting in task_09.
