# Task Memory: task_29.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Enforce distinct green-run exit behavior so `validation_status: passed` exits 0, `ready` exits non-zero, and `blocked` keeps the existing non-zero failure behavior.
- Update CLI output to explain skipped live phases and the live execution command for ready/unverified runs.
- Add/adjust tests for passed, ready, and blocked exit behavior plus wrapper propagation.

## Important Decisions
- Use the existing `vendor-gate.ts` failure-output style as the reference for actionable terminal messaging.
- The ready/unverified exit code is `3`; `blocked` keeps the existing non-zero failure behavior.

## Learnings
- Current `src/clickup/green-run-validation.ts` still returns 0 for `validation_status: ready`; `scripts/green-run.ts` only forwards the code it receives.
- A subprocess-based wrapper test with a `--require` preload is the stable way to verify `scripts/green-run.ts` propagation without contaminating the module cache.

## Files / Surfaces
- `src/clickup/green-run-validation.ts`
- `scripts/green-run.ts`
- `tests/green-run.test.ts`

## Errors / Corrections
- A direct pass-path `main()` test with immediate timers caused runaway recursion and was removed in favor of the existing `buildEvidence` pass-state coverage plus the ready/passed CLI checks.

## Ready for Next Run
- Task 29 is complete; task 30 should mirror the same actionable failure-output style for proof-script failures.
