# Task Memory: task_28.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Wire `agent-working` / `agent-blocked` lifecycle nodes into the staged Marketing Pipeline only.
- Keep tag writes best-effort and outside the status gate source of truth.
- Regenerate the workflow export and update topology tests for node ordering and legacy-path absence.
- Verification passed: workflow export regenerated and checked, full unit suite passed, coverage reached 90.77% statements / 80.61% branches / 91.79% functions / 91.3% lines.

## Important Decisions
- Place the working tag immediately before `Execute Call Agent` on all staged ingress paths.
- Clear both tags on the success branch before the next-gate status advance.
- Swap `agent-working` to `agent-blocked` on the blocker branch before the previous-gate status return.

## Learnings
- The tag helper snippets already exist in `src/workflows/marketing-pipeline-n8n.ts`; this task is wiring, not helper creation.
- The generated path constants in `src/marketing-pipeline/logic.ts` must include the tag lifecycle nodes or the topology tests will fail on exact path ordering.

## Files / Surfaces
- `src/workflows/build-marketing-pipeline.ts`
- `src/marketing-pipeline/logic.ts`
- `tests/marketing-pipeline.test.ts`
- `marketing-pipelines/marketing-pipeline-main.json`

## Errors / Corrections
- Coverage run used direct Vitest invocation to surface the v8 summary; package-script passthrough did not emit the report.

## Ready for Next Run
- Task 28 is complete; next tasks can rely on the staged workflow including the activity tag lifecycle nodes.
