# Task Memory: task_26.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Remove the legacy Ready/Needs Review/revision topology from the Marketing Pipeline builder so the staged route is the only production path.
- Regenerate `marketing-pipelines/marketing-pipeline-main.json` from the TypeScript source after the builder change.
- Update topology and deploy-related tests to assert the staged-only shape and the absence of old node names.
- Completed: the staged-only export now uses `marketing-pipeline-staged-ingress` and a linear post-status chain through `GET Task Comments` -> `Collect Task Comments` -> `Read Current Page` -> `Extract Latest Lead Feedback` -> `Prepare Staged Call Agent Input`.

## Important Decisions
- Keep the current task scoped to workflow topology, generated JSON, and directly impacted tests.
- Leave unrelated local modifications in the worktree untouched.
- Use `marketing-pipeline-staged-ingress` as the webhook path for the staged-only marketing workflow.
- Keep the staged execution chain linear after `Status → In Progress`: collect task comments, read the current page, extract lead feedback, then prepare the staged Call Agent input.

## Learnings
- `src/workflows/build-marketing-pipeline.ts` now removes the legacy `Staged or Ready?`, `Needs Review?`, `Set Revision Ingress`, `Revision Ingress?`, `Prepare Revision Call Agent Input`, `Set Needs Review Skip Target`, and `Actionable Feedback?` branches.
- `tests/marketing-pipeline.test.ts` now asserts the staged-only node set, the new webhook path, and the linear staged execution chain.
- `tests/deploy-workflows.test.ts` now expects `marketing-pipeline-staged-ingress` from the deploy summary and live workflow mock.
- `build-marketing-pipeline.ts` now routes stage execution through `GET Task Comments` -> `Collect Task Comments` -> `Read Current Page` -> `Extract Latest Lead Feedback` -> `Prepare Staged Call Agent Input`.
- Verification succeeded: `pnpm build:workflows`, `pnpm build:workflows:check`, `pnpm test`, and `pnpm test:coverage` all passed; coverage reported 90.79% statements and 80.48% branches overall.

## Files / Surfaces
- `src/workflows/build-marketing-pipeline.ts`
- `src/workflows/marketing-pipeline-n8n.ts`
- `src/marketing-pipeline/logic.ts`
- `tests/marketing-pipeline.test.ts`
- `tests/deploy-workflows.test.ts`
- `tests/n8n-code-equivalence.test.ts`
- `src/n8n/deploy-workflows.ts`

## Errors / Corrections
- Repo root does not contain `AGENTS.md`; the active repo guidance file is `.agents/AGENTS.md`.

## Ready for Next Run
- Regeneration and verification are complete; next steps are tracking updates and commit.
- If a follow-up task touches marketing workflow deployment, remember the webhook path and staged input chain have already shifted to the staged-only topology.
