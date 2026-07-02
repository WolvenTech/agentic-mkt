---
status: completed
title: Rebuild Marketing Pipeline as staged-only topology
type: backend
complexity: medium
dependencies:
  - task_25
---

# Task 26: Rebuild Marketing Pipeline as staged-only topology

## Overview
Remove the old Ready/Writing/Needs Review workflow branches from the generated Marketing Pipeline and make the staged route the only production path. This aligns the workflow export with ADR-005 and closes the live-proof finding that old and new topologies were running in parallel.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST remove old Ready/Needs Review/revision nodes from the workflow builder.
- MUST rename the webhook path to a staged-appropriate path.
- MUST keep Investigate, Write, and Format ingress routing independently testable.
- MUST regenerate workflow JSON from TypeScript source after builder changes.
- MUST assert the removed old node names are absent from the generated export.
</requirements>

## Subtasks
- [x] 26.1 Remove legacy Ready/Needs Review/revision nodes and connections from the workflow builder.
- [x] 26.2 Rename the webhook path away from the old Ready-to-work language.
- [x] 26.3 Simplify connections so staged ingress routes directly into staged processing.
- [x] 26.4 Update topology tests to assert staged-only nodes and absence of old nodes.
- [x] 26.5 Regenerate and check the workflow JSON export.

## Implementation Details
Modify the TypeScript workflow builder as the source of truth, then regenerate `marketing-pipelines/marketing-pipeline-main.json`. See TechSpec "Revision Build Order" steps 13, 15, and 18; do not hand-edit generated JSON except through the build command.

### Relevant Files
- `src/workflows/build-marketing-pipeline.ts` — source-of-truth builder containing old nodes and connections.
- `src/workflows/marketing-pipeline-n8n.ts` — contains helper snippets for old revision comments that may become unused after topology removal.
- `tests/marketing-pipeline.test.ts` — generated topology and connection assertions.
- `marketing-pipelines/marketing-pipeline-main.json` — generated n8n export that must reflect staged-only topology.

### Dependent Files
- `src/n8n/deploy-workflows.ts` — may reference old webhook node naming assumptions.
- `tests/deploy-workflows.test.ts` — may encode old webhook path or Ready-to-work node names.
- `agents/harness/io-contract.md` and `clickup/webhook-contract.md` — documentation will be updated after code behavior changes.

### Related ADRs
- [ADR-009: Complete Removal of Legacy Single-Agent Workflow Topology](adrs/adr-009.md) — Defines the staged-only topology requirement.
- [ADR-005: Replace Single-Agent Marketing Flow with Staged Content Quality Workflow](adrs/adr-005.md) — Requires replacement rather than dual production paths.

## Deliverables
- Staged-only Marketing Pipeline builder.
- Regenerated `marketing-pipelines/marketing-pipeline-main.json`.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for generated workflow topology **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Generated workflow does not contain `Staged or Ready?`, `Needs Review?`, `Set Revision Ingress`, `Revision Ingress?`, or `Prepare Revision Call Agent Input`.
  - [x] Generated workflow webhook path uses staged pipeline naming.
  - [x] Investigate route reaches staged input assembly and Call Agent.
  - [x] Write route reaches staged input assembly and Call Agent.
  - [x] Format route reaches staged input assembly and Call Agent.
- Integration tests:
  - [x] `pnpm build:workflows` regenerates workflow exports cleanly.
  - [x] `pnpm build:workflows:check` passes after regeneration.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Generated workflow contains only staged production routing.
- Old-status ClickUp tasks are documented as a migration concern, not supported by hidden builder branches.
