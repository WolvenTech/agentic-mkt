# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State
- Tasks 01-36: Complete (staged workflow implementation, topology rebuild, tag lifecycle, exit-code contracts, staged prompt generation, Call Agent parser switch, contract parity fixtures, and fail-closed artifact validation)
- Task 35: Pending (Doc pointer persistence — blocked on task_36 completion)
- Tasks 37-38: Pending (workflow regeneration and ADR-011 live proof)

## Shared Decisions
- Stage output validation pattern: Use stages.ts helpers (isKnownStage, getStageDefinition) for deterministic validation
- Error envelope pattern: All parsers return structured { error, raw_response } on failure
- Type guard pattern: isAgentError() / isStageError() for discriminated unions

## Shared Learnings
- Stage metadata from task_03 (stages.ts) provides the validation substrate for next_gate validation
- parseStageOutput follows parseAgentOutput pattern exactly (JSON parse → validate → return union)
- Blocker outputs carry optional blocker_question field; when absent, all three artifact fields must be non-empty
- Coverage target 80%+ achieved: parseStageOutput at 81.91% branches, 100% functions
- Green-run validation now uses a distinct ready/unverified exit code (`3`) while preserving `0` for passed and the existing non-zero blocked behavior; the wrapper script must propagate that code unchanged.
- Marketing Pipeline now uses the staged-only webhook path `marketing-pipeline-staged-ingress` and a linear post-status chain of `GET Task Comments` -> `Collect Task Comments` -> `Read Current Page` -> `Extract Latest Lead Feedback` -> `Prepare Staged Call Agent Input`.
- The n8n code-node test harness now executes generated snippets as async functions and accepts injected `console.warn` capture, so future codegen tasks can safely test top-level `await` and warning-only side effects.
- Best-effort tag helper snippets should return the original item unchanged and log ClickUp failures as warnings instead of throwing, so status/Doc mutations can continue.
- Staged marketing workflow topology now includes `Add agent-working` before `Execute Call Agent`, `Clear activity tags` before `Update Status to Next Gate`, and `Swap activity tags` before `Update Status to Previous Gate`; topology tests and path constants must account for those nodes.
- Workflow-side fail-closed validation for artifact_markdown: Success path (no blocker) routes through `Validate Staged Artifact` node before `Format Pointer Comment` and `PUT Replace Doc Page Content`. Blocker path (has_blocker=true) bypasses validation and goes directly to `Format Blocker Comment`. Empty or missing artifact_markdown throws error with task_id and stage context, preventing Doc writes and status advancement (ADR-011).
- Live n8n deploy credential preservation must apply credentials by credential type for new nodes, not only by node name; otherwise newly added HTTP nodes keep placeholder IDs and fail at runtime. The live replacement ClickUp credential created during task_38 is `UWTBHE3QcxvabRWb` (`ClickUp Marketing Pipeline Codex 2026-07-03`).
- `Editorial Doc Url` is a ClickUp URL custom field; persist it through `POST /task/{task_id}/field/{field_id}` with `{ value: "https://app.clickup.com/{workspace_id}/v/dc/{doc_id}" }`. `PUT /task/{task_id}` with a `custom_fields` object does not set the field value.
- Generated n8n ClickUp HTTP nodes with JSON bodies should send an explicit `Content-Type: application/json` header; ClickUp Docs page creation returned HTTP 500 from n8n without it while the same API call succeeded directly with the header.

## Open Risks
- None currently identified. Stage output validation, parser equivalence, and fail-closed artifact checks are all complete.

## Handoffs
- For task_23 (Live proof validation): Four validation phases documented in task_23.md: (1) Call Agent isolation test, (2) ClickUp/Doc integration, (3) blocker handling, (4) self-echo filtering. Green-run-evidence.json captures production readiness proof. Migration of old-status tasks required before deployment (see list-schema.md).

## Reference Handling Pattern
- Agent configs declare `references?: string[]` as repo-relative GitHub file paths
- githubFetchPaths() includes references in the fetch list (alongside agent config and skills)
- Next task will pair reference responses using same merge pattern as skills
- assembleSystemPrompt() will include reference content inline (TBD task_07)
