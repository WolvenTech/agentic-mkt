---
status: completed
title: Add ClickUp task-tag client support and stage tag constants
type: backend
complexity: medium
dependencies:
  - task_23
---

# Task 24: Add ClickUp task-tag client support and stage tag constants

## Overview
Add the ClickUp task-tag API surface required for board-level AI activity signaling. This gives later workflow tasks a typed, reusable way to add and remove `agent-working` and `agent-blocked` tags without inlining endpoint strings.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST add ClickUp task tag helpers for adding and removing a named task tag.
- MUST expose canonical `agent-working` and `agent-blocked` constants for staged workflow use.
- MUST keep tag writes independent from status as a UX signal, not a persisted gate state.
- MUST cover success, 204/no-body, and ClickUp error behavior in tests.
- SHOULD avoid changing existing generic ClickUp request semantics beyond what tag helpers require.
</requirements>

## Subtasks
- [x] 24.1 Add a public helper for adding a tag to a ClickUp task.
- [x] 24.2 Add a public helper for removing a tag from a ClickUp task.
- [x] 24.3 Add exported constants for working and blocked activity tags.
- [x] 24.4 Update tests for task-tag endpoints and response handling.
- [x] 24.5 Confirm existing ClickUp client tests still pass.

## Implementation Details
Implement the tag API support in the existing ClickUp client layer and place tag constants near the stage model so workflow code can import a single canonical name. See TechSpec "Revision Component Changes" and ADR-008 for the expected API surface and failure semantics.

### Relevant Files
- `src/clickup/client.ts` — existing ClickUp HTTP wrapper and logical place for `POST`/`DELETE /task/{task_id}/tag/{tag_name}` helpers.
- `src/marketing-pipeline/stages.ts` — canonical staged pipeline metadata and likely home for `AGENT_WORKING_TAG` and `AGENT_BLOCKED_TAG`.
- `tests/clickup-client.test.ts` — existing client test coverage for HTTP method behavior and ClickUp errors.
- `tests/marketing-pipeline.test.ts` — may assert exported stage/tag constants used by workflow generation.

### Dependent Files
- `src/workflows/marketing-pipeline-n8n.ts` — later task will generate n8n tag helper snippets from the canonical tag names.
- `src/workflows/build-marketing-pipeline.ts` — later task will add tag lifecycle nodes to the generated workflow.
- `marketing-pipelines/marketing-pipeline-main.json` — regenerated workflow will include tag lifecycle calls after later tasks.

### Related ADRs
- [ADR-008: Tag-Based AI Activity Signaling for Staged Columns](adrs/adr-008.md) — Defines `agent-working`/`agent-blocked` semantics and the ClickUp tag API requirement.

## Deliverables
- ClickUp add/remove task-tag helper functions.
- Canonical staged activity tag constants.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for ClickUp client compatibility **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] Adding `agent-working` calls `POST /task/{task_id}/tag/agent-working` with ClickUp auth.
  - [ ] Removing `agent-blocked` calls `DELETE /task/{task_id}/tag/agent-blocked` with ClickUp auth.
  - [ ] A 204 response from a tag operation is treated as success.
  - [ ] A non-2xx ClickUp tag response preserves the existing `ClickUpHttpError` diagnostics.
- Integration tests:
  - [ ] Existing ClickUp client tests pass with unchanged GET/POST/PUT/DELETE behavior.
  - [ ] Stage constants are importable by workflow generation code without circular dependencies.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Tag names are defined once and reused by later workflow tasks.
- ClickUp tag helper errors are observable without changing the status-transition source of truth.
