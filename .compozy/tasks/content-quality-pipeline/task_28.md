---
status: completed
title: Wire AI activity tag lifecycle into staged workflow
type: backend
complexity: medium
dependencies:
  - task_26
  - task_27
---

# Task 28: Wire AI activity tag lifecycle into staged workflow

## Overview
Connect the tag helper nodes into the staged Marketing Pipeline so ClickUp cards show whether AI is working or blocked. This completes the board-level activity signal found missing during live proof while keeping the existing status gates as the workflow source of truth.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add `agent-working` when a staged AI ingress is accepted.
- MUST clear both activity tags on successful gate advance.
- MUST swap to `agent-blocked` when a blocker output returns to the previous human gate.
- MUST keep tag writes best-effort and non-blocking for status, comment, and Doc operations.
- MUST regenerate workflow JSON and verify generated topology contains the tag lifecycle.
</requirements>

## Subtasks
- [x] 28.1 Insert working-tag node after staged ingress acceptance and before the agent call.
- [x] 28.2 Insert success cleanup before or alongside next-gate status advancement.
- [x] 28.3 Insert blocker tag swap before or alongside previous-gate status return.
- [x] 28.4 Add workflow topology tests for tag lifecycle nodes and ordering.
- [x] 28.5 Regenerate workflow export and run workflow check.

## Implementation Details
Wire only the staged path produced by task_26. Tags must not be added to human-gate columns, and tag operations should not resurrect the removed legacy flow. See ADR-008 and TechSpec "Revision Component Changes" for placement rules.

### Relevant Files
- `src/workflows/build-marketing-pipeline.ts` — add tag lifecycle nodes and connections to staged routes.
- `src/workflows/marketing-pipeline-n8n.ts` — codegen helpers from task_27.
- `tests/marketing-pipeline.test.ts` — assert lifecycle node presence, ordering, and old-topology absence.
- `marketing-pipelines/marketing-pipeline-main.json` — regenerated export with tag lifecycle nodes.

### Dependent Files
- `agents/harness/LIVE-PROOF-RUNBOOK.md` — later documentation should tell operators how to observe tags during live proof.
- `clickup/webhook-contract.md` — later documentation should describe staged-only trigger and tag side effects.
- `n8n/README.md` — later documentation should reference staged webhook path and tag behavior.

### Related ADRs
- [ADR-008: Tag-Based AI Activity Signaling for Staged Columns](adrs/adr-008.md) — Defines tag lifecycle behavior.
- [ADR-009: Complete Removal of Legacy Single-Agent Workflow Topology](adrs/adr-009.md) — Requires wiring tags only into the staged production path.

## Deliverables
- Generated workflow builder with tag lifecycle nodes connected.
- Regenerated n8n workflow JSON.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for workflow generation **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Each staged ingress path reaches `agent-working` tagging before Call Agent execution.
  - [x] Success path clears `agent-working` and `agent-blocked` before or with next-gate completion.
  - [x] Blocker path swaps `agent-working` to `agent-blocked` before or with previous-gate return.
  - [x] No tag nodes are reachable from removed Ready/Needs Review paths.
- Integration tests:
  - [x] `pnpm build:workflows` regenerates the workflow export with tag nodes.
  - [x] `pnpm build:workflows:check` passes after tag lifecycle wiring.
- Test coverage target: >=80%
- [x] All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- ClickUp board tags reflect AI working and blocker states during staged execution.
- Tag lifecycle is observable without changing the status gate model.
