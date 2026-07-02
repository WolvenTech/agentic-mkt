---
status: completed
title: Enforce green-run ready/unverified exit-code contract
type: backend
complexity: medium
dependencies:
    - task_23
---

# Task 29: Enforce green-run ready/unverified exit-code contract

## Overview
Change green-run validation so preflight-ready but live-unverified runs no longer exit like a verified pass. This turns the live-proof gap into an automatable signal for operators and CI.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
- MUST return exit 0 only when `validation_status` is `passed`.
- MUST return a distinct non-zero exit code when `validation_status` is `ready`.
- MUST preserve the existing blocked/non-ready failure behavior.
- MUST print which runtime phases were skipped and the command needed for live execution.
- SHOULD mirror the existing `vendor-gate.ts` style for actionable exit output.
</requirements>

## Subtasks
- [x] 29.1 Define explicit green-run exit code mapping for passed, blocked, and ready/unverified states.
- [x] 29.2 Update CLI output for ready/unverified status with skipped-phase details.
- [x] 29.3 Add tests for ready/unverified exit behavior.
- [x] 29.4 Add tests that passed remains exit 0 and blocked remains non-zero.
- [x] 29.5 Confirm wrapper script propagates the new exit code.

## Implementation Details
Modify the green-run CLI entrypoint and tests without changing the evidence JSON schema unless required for clarity. See ADR-010 and TechSpec "Core Interfaces" for the proof exit-code contract.

### Relevant Files
- `src/clickup/green-run-validation.ts` — computes `validation_status` and currently returns 0 for `ready`.
- `scripts/green-run.ts` — wrapper that propagates the returned code.
- `tests/green-run.test.ts` — existing tests for evidence status and live/preflight behavior.
- `src/clickup/vendor-gate.ts` — reference pattern for exit-code and failure messaging.

### Dependent Files
- `agents/harness/green-run-evidence.json` — canonical evidence uses `validation_status`.
- `agents/harness/LIVE-PROOF-RUNBOOK.md` — documentation should describe the new exit-code semantics in task_31.
- `agents/harness/io-contract.md` — documentation should stop implying ready equals pass.

### Related ADRs
- [ADR-010: Enforce Exit-Code Contract for Proof and Green-Run Scripts](adrs/adr-010.md) — Requires distinct exit behavior for ready/unverified state.
- [ADR-007: Use Local-First Verification with Live Proof as a Follow-Up Task](adrs/adr-007.md) — Original local-first verification decision.

## Deliverables
- Green-run CLI with distinct ready/unverified exit code.
- Actionable terminal output for skipped live phases.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for wrapper exit propagation **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] `validation_status: passed` returns exit 0.
  - [ ] `validation_status: ready` returns the new ready/unverified non-zero code.
  - [ ] `validation_status: blocked` returns the blocked non-zero code.
  - [ ] Ready/unverified output names skipped runtime phases and `GREEN_RUN_EXECUTE=1 pnpm green-run`.
- Integration tests:
  - [ ] `scripts/green-run.ts` propagates the non-zero ready/unverified code.
  - [ ] Existing evidence shape tests continue to pass.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Operators cannot mistake preflight-ready output for completed live proof based on exit code.
- Failure output explains the next command to run.

## Status
completed
