# Task Memory: task_27.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Add reusable n8n codegen helpers for ClickUp tag lifecycle: stage entry `agent-working`, stage exit cleanup, and blocker swap.
- Keep tag failures best-effort: log warnings, return the original item, and do not block Doc/status mutation paths.

## Important Decisions
- Helper generation stays in `src/workflows/marketing-pipeline-n8n.ts`; workflow wiring remains out of scope for task 28.
- Tag helper snippets should reuse `AGENT_WORKING_TAG` and `AGENT_BLOCKED_TAG` from `src/marketing-pipeline/stages.ts`.
- The n8n code-node test harness will need warning capture support so the generated snippets can be verified without throwing.
- `runN8nCodeNode` now executes snippets through an async function wrapper, which makes top-level `await` valid in generated code.

## Learnings
- `src/clickup/client.ts` already has `addTaskTag` / `removeTaskTag`, so this task only needs the n8n codegen layer.
- Existing n8n code snippets generally return the original item shape after side effects, which is the pattern to mirror for tag helpers.
- The helper tests need explicit env restoration because the generated snippets read `process.env.CLICKUP_API_TOKEN` / `CLICKUP_TOKEN` directly.

## Files / Surfaces
- `src/workflows/marketing-pipeline-n8n.ts`
- `tests/n8n-code-equivalence.test.ts`
- `src/workflows/n8n-codegen.ts`
- `.compozy/tasks/content-quality-pipeline/task_27.md`
- `.compozy/tasks/content-quality-pipeline/_tasks.md`

## Errors / Corrections

## Ready for Next Run
- Task 28 can wire `stageStartWorkingTagJs`, `cleanupStageTagsJs`, and `swapBlockerTagsJs` into the staged workflow graph without changing the helper contracts.
