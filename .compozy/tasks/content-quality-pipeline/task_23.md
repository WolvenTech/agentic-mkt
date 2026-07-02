---
status: completed
title: Live proof of staged content quality pipeline and rollout readiness validation
type: test
complexity: high
dependencies:
    - task_22
---

# Task 23: Live proof of staged content quality pipeline and rollout readiness validation

## Overview

Validate that the staged Content Quality Pipeline works correctly in the live ClickUp/n8n environment. This is the production readiness gate: local tests confirm code correctness, but live proof confirms that ClickUp statuses, Docs API integration, custom fields, pointer comments, blocker routing, n8n deployment, and end-to-end workflow execution all work as designed.

**Production rollout is blocked until this task passes.**

<critical>
- This task requires live ClickUp and n8n credentials
- This task may mutate production-like ClickUp objects, Docs, and n8n executions
- This task is scheduled AFTER local implementation is complete (ADR-007)
- Do NOT attempt this until task_22 (rollout readiness documentation) is complete
</critical>

<requirements>
- MUST validate the Call Agent sub-workflow in live n8n with GitHub and OpenAI credentials bound.
- MUST validate main workflow integration with live ClickUp task status moves, Doc creation, page replacement, pointer comments, and gate advancement.
- MUST validate blocker handling with a task that lacks sufficient acceptance criteria and then recovers after human feedback.
- MUST validate self-echo filtering so automated status advances do not produce duplicate AI runs or duplicate comments.
- MUST record execution IDs, task URLs, Doc URLs/page IDs, observed latency, and rollout go/no-go evidence before production rollout.
</requirements>

## Subtasks
- [x] 23.1 Prepare live proof evidence tracking structure and operator runbook.
- [x] 23.2 Run or document Call Agent sub-workflow isolation validation.
- [x] 23.3 Run or document main workflow ClickUp/Doc integration validation.
- [x] 23.4 Run or document blocker handling and recovery validation.
- [x] 23.5 Run or document self-echo filtering and rollout readiness validation.

## Implementation Details
This task is a live validation gate, not a source-code implementation task. Preserve the runbook and evidence files as the source of operational truth, and update them with observed live results rather than inventing success.

### Relevant Files
- `agents/harness/LIVE-PROOF-RUNBOOK.md` — step-by-step live validation procedure.
- `agents/harness/green-run-evidence.json` — canonical evidence structure for validation outcomes.
- `.compozy/tasks/content-quality-pipeline/TASK-23-STATUS.md` — manual execution status and preflight summary.
- `marketing-pipelines/call-agent-subworkflow.json` — sub-workflow imported for isolation validation.
- `marketing-pipelines/marketing-pipeline-main.json` — main workflow imported for ClickUp/Doc integration validation.

### Dependent Files
- `agents/harness/io-contract.md` — live evidence and proof semantics referenced by later docs updates.
- `clickup/list-schema.md` — staged status and old-status migration guidance.
- `n8n/README.md` — workflow import, credential binding, and webhook registration guidance.
- `scripts/content-quality-proof.ts` — proof path that later tasks harden with stricter exit behavior.
- `src/clickup/green-run-validation.ts` — green-run evidence path that later tasks harden with stricter exit behavior.

### Related ADRs
- [ADR-005: Replace Single-Agent Marketing Flow with Staged Content Quality Workflow](adrs/adr-005.md) — Live proof validates staged replacement behavior.
- [ADR-007: Use Local-First Verification with Live Proof as a Follow-Up Task](adrs/adr-007.md) — Establishes this task as the live production-readiness gate.
- [ADR-008: Tag-Based AI Activity Signaling for Staged Columns](adrs/adr-008.md) — Later live-proof follow-up found the missing activity signal.
- [ADR-009: Complete Removal of Legacy Single-Agent Workflow Topology](adrs/adr-009.md) — Later live-proof follow-up found the old topology still present.
- [ADR-010: Enforce Exit-Code Contract for Proof and Green-Run Scripts](adrs/adr-010.md) — Later live-proof follow-up found proof scripts could report incomplete verification as success.

## Deliverables
- Live proof runbook and evidence tracking files.
- Recorded preflight status for local tests, workflow builds, vendor gate, ClickUp list schema, and required credentials.
- Recorded live validation results or explicit manual-execution handoff.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for live proof readiness documentation **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Local test suite evidence is recorded before live proof execution.
  - [x] Workflow build/check evidence is recorded before live proof execution.
  - [x] Vendor gate evidence is recorded before live proof execution.
  - [x] Documentation/evidence files enumerate required live proof phases.
- Integration tests:
  - [x] Runbook covers Call Agent isolation, main workflow ClickUp/Doc integration, blocker handling, and self-echo filtering.
  - [x] Evidence schema includes task URL, n8n execution IDs, Doc URL/page IDs, latency, and rollout gate fields.
- Test coverage target: >=80%
- All tests must pass

## Readiness Checklist

Before starting live proof, ensure:

- [ ] All local tests pass: `pnpm test`
- [ ] Workflow builds pass: `pnpm build:workflows:check`
- [ ] Workflow exports are up to date: `pnpm build:workflows`
- [ ] Staged statuses exist in ClickUp Marketing Pipeline list (see `clickup/list-schema.md`)
- [ ] Custom field `Editorial Doc Url` exists in ClickUp
- [ ] n8n credentials configured: ClickUp (OAuth or PAT), GitHub (read-only), OpenAI
- [ ] GitHub repo pushed to `main` branch (Call Agent fetches configs at runtime)
- [ ] `pnpm vendor:gate` passes (see `README.md` prerequisites)

## Live Proof Validation Steps

### Phase 1: Sub-workflow isolation test

**Objective:** Confirm Call Agent sub-workflow invokes OpenAI correctly and parses outputs.

Steps:
1. Import `marketing-pipelines/call-agent-subworkflow.json` into n8n
2. Bind GitHub and OpenAI credentials
3. Run **Manual Trigger (Isolation Test)** and confirm:
   - [ ] Execution completes without error
   - [ ] **Parse Agent Output** node returns JSON with all required keys: `stage`, `artifact_markdown`, `resumo`, `self_check`, `next_gate`
   - [ ] Structured log fields include `parse_success: true`, `stage`, `agent_id`, `execution_id`, `latency_ms`
4. **Blocker test:** Inspect **Hardcoded Test Input** and confirm at least one payload produces `blocker_question` output
5. **Parse failure test:** Temporarily disable OpenAI JSON mode and confirm **Parse Agent Output** returns error envelope (not partial output)
6. Verify **Assemble Prompt** includes: agent config, `wolven-voice` skill, and stage reference/template files

**Evidence to record:**
- Successful execution IDs from Phase 1 tests
- Verify all three blockers (investigate, write, format) can be triggered

### Phase 2: Main workflow ClickUp/Doc integration test

**Objective:** Confirm Doc creation, page replacement, custom field writing, and status advancement work.

Steps:

1. **Setup:**
   - Import `marketing-pipelines/marketing-pipeline-main.json` into n8n
   - Bind ClickUp credential on all ClickUp nodes
   - On **Execute Call Agent**, select workflow = Call Agent (imported sub-workflow)
   - **Activate** the Marketing Pipeline workflow
   - Copy webhook URL from **ClickUp Webhook** node

2. **ClickUp webhook registration:**
   - In ClickUp Marketing Pipeline list: Integrations → Webhooks → Create webhook
   - Event: **Task Status Updated**
   - Endpoint: webhook URL from step 1
   - Confirm webhook appears in ClickUp log

3. **Happy path execution:**
   - Create ClickUp task with title, description, **ACs**
   - Move task to **Investigate**
   - Within ~60s, verify:
     - [ ] Editorial Doc created and URL appears in `Editorial Doc Url` custom field
     - [ ] "Brief" page created in Doc with investigation artifact
     - [ ] Pointer comment posted with `[CQ-AI]` prefix, resumo, and next steps
     - [ ] Status auto-advanced to **Brief Review**

4. **Test Write stage:**
   - Review brief in Doc, leave feedback comment
   - Move task to **Write**
   - Within ~60s, verify:
     - [ ] "Argument" page created in Doc
     - [ ] Pointer comment posted with resumo
     - [ ] Status auto-advanced to **Content Review**

5. **Test Format stage:**
   - Review argument in Doc, leave feedback comment
   - Move task to **Format**
   - Within ~60s, verify:
     - [ ] "Final Draft" page created in Doc with Wolven-voice LinkedIn post
     - [ ] Pointer comment posted with resumo and self-check
     - [ ] Status auto-advanced to **Final Review**

6. **Test rework (selective re-run):**
   - Move task back to **Write** (simulate feedback requiring argument revision)
   - Within ~60s, verify:
     - [ ] "Argument" page is replaced with new content
     - [ ] "Brief" and "Final Draft" pages are preserved
     - [ ] Status auto-advances to **Content Review**

**Evidence to record:**
- ClickUp task URL from happy-path test
- n8n execution IDs for each stage (investigate, write, format)
- Observed latency per stage (target: ≤60s)
- Doc URL and page IDs

### Phase 3: Blocker handling test

**Objective:** Confirm blockers post comments and return to previous gate.

Steps:

1. Create new ClickUp task without sufficient **ACs** (empty or minimal)
2. Move task to **Investigate**
3. Within ~60s, verify:
   - [ ] n8n execution shows `blocker_question` in parsed output
   - [ ] Blocker comment posted with `[CQ-BLOCKER]` prefix and blocker question
   - [ ] Status returned to **Backlog** (previous gate)

4. Add answer to blocker comment
5. Move task back to **Investigate**
6. Verify stage succeeds and produces normal pointer comment (not blocker)

**Evidence to record:**
- ClickUp task URL with blocker test
- n8n execution ID showing blocker output

### Phase 4: Self-echo and filter validation

**Objective:** Confirm status auto-advances do not trigger re-runs (self-echo rejection).

Steps:

1. Monitor n8n executions during happy-path test
2. Expect execution count:
   - Investigate ingress: 1 full execution
   - Brief Review auto-advance: 1 filtered execution (no-op, self-echo)
   - Write ingress: 1 full execution
   - Content Review auto-advance: 1 filtered execution
   - Format ingress: 1 full execution
   - Final Review auto-advance: 1 filtered execution

3. Confirm filtered executions do not post duplicate comments or mutate Doc

**Evidence to record:**
- n8n execution log showing filter behavior

## Deployment and Operations

### Deploy workflows to live n8n

After Phase 1–3 pass:

```bash
pnpm build:workflows       # ensure JSON exports are fresh
pnpm deploy:workflows      # push to n8n.wolven.com.br (requires N8N_API_KEY)
```

or if API deploy unavailable, manually re-import and re-bind credentials in n8n.

### Record green-run evidence

After a successful full happy-path run, document in `agents/harness/green-run-evidence.json`:

```json
{
  "validation_status": "passed",
  "main_workflow": {
    "verified": true,
    "n8n_execution_id": "EXECUTION_ID_FROM_FORMAT_STAGE",
    "clickup_task_url": "https://app.clickup.com/...",
    "latency_seconds": OBSERVED_TOTAL,
    "status_path": ["backlog", "investigate", "brief_review", "write", "content_review", "format", "final_review", "publish", "closed"]
  }
}
```

## Migration of In-Flight Old-Status Tasks

**Before deploying the staged workflow**, review the live Marketing Pipeline list for tasks still in old statuses (`Ready`, `Writing`, `Approval`, `Needs Review`).

Action required per task:

- **Ready or Writing:** Move to **Investigate** if ready for editorial review, or to **Backlog** if still in prep.
- **Approval or Needs Review:** Determine if the task needs the old single-agent flow or can be re-run through staged workflow. If re-running, place artifact link in task description and move to **Investigate**.
- **After migration:** Record count of migrated tasks and their new statuses.

See `clickup/list-schema.md` for migration details.

## Rollout Gate

**Production rollout is blocked until:**

- [ ] All Phase 1–4 validation steps pass
- [ ] Latency per stage is ≤60s (record actual in green-run-evidence.json)
- [ ] n8n workflow is deployed and active
- [ ] ClickUp webhook is registered and working
- [ ] In-flight old-status tasks are migrated
- [ ] Team review of staged workflow in live context confirms it's ready
- [ ] Go/no-go decision logged (Slack, meeting notes, or PR comment)

## Troubleshooting

See `n8n/README.md` and `agents/harness/io-contract.md` for:
- Webhook-not-reaching-n8n diagnostics
- Task-stuck-in-progress debugging
- OpenAI JSON parse failures
- Field-ID mismatches

## Success Criteria

- All Phase 1–4 validation steps pass with evidence recorded
- Latency per stage documented in green-run-evidence.json
- No unexpected behavior observed during live execution
- Workflow remains stable for 24+ hours post-deployment
- Team sign-off on production readiness
