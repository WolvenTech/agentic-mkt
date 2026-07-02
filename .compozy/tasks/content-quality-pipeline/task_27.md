---
status: completed
title: Add best-effort n8n tag helper code nodes
type: backend
complexity: medium
dependencies:
  - task_24
---

# Task 27: Add best-effort n8n tag helper code nodes

## Overview
Add reusable n8n code-generation helpers that can add and remove ClickUp task tags while treating failures as warnings. This gives the workflow graph a safe primitive for AI activity tags without making tag API failures block Doc writes or status transitions.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST generate n8n code for adding `agent-working` at accepted stage ingress.
- MUST generate n8n code for removing `agent-working` and `agent-blocked` at stage exits.
- MUST generate n8n code for swapping `agent-working` to `agent-blocked` on blocker outputs.
- MUST log tag API failures without throwing when status/Doc mutation can still proceed.
- SHOULD reuse canonical tag constants from task_24 rather than hardcoding names repeatedly.
</requirements>

## Subtasks
- [x] 27.1 Add shared n8n ClickUp tag request helper code.
- [x] 27.2 Add codegen function for stage-start working tag behavior.
- [x] 27.3 Add codegen function for successful gate-advance tag cleanup.
- [x] 27.4 Add codegen function for blocker tag swap behavior.
- [x] 27.5 Add equivalence tests for generated tag helper code.

## Implementation Details
Work in code-generation helpers only; wiring the helpers into the workflow graph belongs to task_28. See ADR-008 for the best-effort failure model and TechSpec "Monitoring and Observability" for warning behavior.

### Relevant Files
- `src/workflows/marketing-pipeline-n8n.ts` — existing n8n JavaScript helper generation for staged workflow code nodes.
- `tests/n8n-code-equivalence.test.ts` — validates generated n8n code against TypeScript behavior.
- `src/marketing-pipeline/stages.ts` — source of canonical activity tag constants after task_24.
- `src/clickup/client.ts` — API semantics reference for tag endpoints after task_24.

### Dependent Files
- `src/workflows/build-marketing-pipeline.ts` — task_28 will place the generated helper code into actual nodes.
- `marketing-pipelines/marketing-pipeline-main.json` — regenerated export will include these helpers after task_28.
- `tests/marketing-pipeline.test.ts` — task_28 will assert the helper nodes are present and connected.

### Related ADRs
- [ADR-008: Tag-Based AI Activity Signaling for Staged Columns](adrs/adr-008.md) — Requires best-effort working/blocked tag lifecycle.

## Deliverables
- n8n codegen helpers for working tag set, tag cleanup, and blocker tag swap.
- Tests for generated code behavior and warning-only failures.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for code-generation compatibility **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Generated stage-start helper attempts to add `agent-working` for the current task.
  - [x] Generated success cleanup helper attempts to remove both activity tags.
  - [x] Generated blocker helper removes `agent-working` and adds `agent-blocked`.
  - [x] A failed tag API call logs a warning payload and returns the original item.
- Integration tests:
  - [x] n8n code-equivalence tests pass for tag helper snippets.
  - [x] Generated helper code does not require unavailable n8n credentials beyond ClickUp token access.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Tag helper snippets are safe to insert before and after staged workflow mutation nodes.
- Tag failures cannot prevent primary status or Doc writes from continuing.
