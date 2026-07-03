# Live Proof Runbook: Staged Content Quality Pipeline (Task 23)

**Last Updated:** 2026-07-02  
**Status:** Ready for manual execution  
**Preflight:** ✅ All checks pass

This document guides manual validation of the staged Content Quality Pipeline in the live ClickUp/n8n environment.

## Quick Links

- **Task Spec**: `.compozy/tasks/content-quality-pipeline/task_23.md`
- **Evidence Tracking**: `agents/harness/green-run-evidence.json`
- **ClickUp List**: [Linkedin Post Creator](https://app.clickup.com/901327635891)
- **n8n Instance**: https://n8n.wolven.com.br
- **Workflow Exports**: `marketing-pipelines/`

## Prerequisites Verified ✅

- ✅ `pnpm test` passes (519 tests)
- ✅ `pnpm build:workflows:check` passes
- ✅ `pnpm vendor:gate` passes
- ✅ ClickUp list configured with staged statuses
- ✅ Custom fields present: `ACs`, `Editorial Doc Url`
- ✅ n8n workflows exported and ready to import

**Activity Tags Reference** (ADR-008):

The workflow uses two task tags to signal AI activity at a glance:
- **`agent-working`**: Set when a stage begins (before Call Agent execution). Visible as a colored chip on ClickUp card.
- **`agent-blocked`**: Set when a blocker output is detected (swapped from `agent-working`). Indicates the stage needs human input before retrying.
- **Both tags cleared** when a stage completes (advances to next gate or returns to previous gate on blocker recovery).

These tags are **orthogonal to status** — they answer "is AI actively on this?" without adding more status columns.

## Phase 1: Call Agent Sub-Workflow Isolation Test

**Objective**: Verify Call Agent sub-workflow parses OpenAI outputs correctly.

### Setup

1. **Import Call Agent sub-workflow** into n8n.wolven.com.br
   - File: `marketing-pipelines/call-agent-subworkflow.json`
   - Bind credentials:
     - **GitHub**: Read-only PAT on `WolvenTech/agentic-mkt`
     - **OpenAI**: API key for gpt-4.1-mini

2. **Do NOT activate** — this workflow is invoked by the main workflow only.

### Test 1.1: Manual Trigger (Isolation Test)

**Expected Outcome**: Execution completes without error.

Steps:
1. Open Call Agent workflow in n8n
2. Click the **Manual Trigger** node (top-left)
3. Click **Test** (in test mode)
4. Inspect **Parse Agent Output** node:
   - Output should contain JSON with keys: `stage`, `artifact_markdown`, `resumo`, `self_check`, `next_gate`
   - Structured logs should include: `parse_success: true`, `stage`, `agent_id`, `execution_id`, `latency_ms`

**Record Evidence**:
- Execution ID from n8n console
- Confirm all required JSON keys present
- Screenshot of Parse Agent Output node result

### Test 1.2: Blocker Output

**Expected Outcome**: At least one test input produces `blocker_question` output.

Steps:
1. In Call Agent workflow, expand **Hardcoded Test Input** node
2. Check the comment for test payloads that should trigger blocker behavior
3. Run **Manual Trigger** with one of those payloads
4. Inspect **Parse Agent Output**: should include `blocker_question` field (non-empty string)

**Record Evidence**:
- Execution ID
- Confirm `blocker_question` is present in output

### Test 1.3: Parse Failure Handling

**Expected Outcome**: Graceful error handling when JSON parsing fails.

Steps:
1. In Call Agent workflow, open **OpenAI Chat** node
2. Temporarily edit: change `jsonSchema` mode to text mode (remove JSON mode)
3. Run **Manual Trigger** again
4. Inspect **Parse Agent Output**: should return error envelope, not partial output

**Record Evidence**:
- Confirm error handling is graceful
- Revert the change (put JSON mode back)

### Test 1.4: Prompt Assembly Validation

**Expected Outcome**: Assemble Prompt node includes all required files.

Steps:
1. In Call Agent workflow, open **Assemble Prompt** node
2. Verify the prompt includes:
   - Agent config (from GitHub)
   - `wolven-voice` skill markdown
   - Stage reference/template files (from GitHub)
3. Check **Console** logs to confirm files were fetched

**Record Evidence**:
- Screenshot of prompt content
- Confirm all three components present

---

## Phase 2: Main Workflow ClickUp/Doc Integration Test

**Objective**: Validate the complete happy path through all three AI stages.

### Setup

1. **Import Marketing Pipeline main workflow** into n8n.wolven.com.br
   - File: `marketing-pipelines/marketing-pipeline-main.json`
   - Bind **ClickUp** credential

2. **Configure sub-workflow call**:
   - In Marketing Pipeline workflow, open **Execute Call Agent** node
   - Select **Workflow** = "Call Agent" (the imported sub-workflow)

3. **Activate** the Marketing Pipeline workflow

4. **Register ClickUp webhook**:
   - Copy webhook URL from **ClickUp Webhook** node in n8n
   - In ClickUp: Marketing Pipeline list → Integrations → Webhooks
   - Create webhook: Event = **Task Status Updated**, Endpoint = webhook URL
   - Confirm webhook appears in ClickUp integration log

### Test 2.1: Happy Path Sequence

**Test Task Creation**:
```
Name: "Live Proof - Happy Path Test"
Description: "LinkedIn post on staged editorial workflows for AI-assisted content"
Criteria: "1. Explain staged workflow benefits
          2. Include concrete rework example
          3. Fit LinkedIn character limit
          4. Use Wolven tone"
Initial Status: Backlog
```

#### Stage 1: Investigate

**Action**: Move task to **Investigate** status

**Expected (within ~60s)**:
- [ ] Doc created
- [ ] URL appears in **Editorial Doc Url** custom field
- [ ] "Brief" page created with investigation artifact markdown
- [ ] Comment posted with `[CQ-AI]` prefix, resumo, and `next_gate: "brief review"`
- [ ] Status auto-advances to **Brief Review**

**Timing**: Record latency from status change to comment posted

**Evidence to capture**:
- ClickUp task URL
- Doc URL (from custom field)
- n8n execution ID (from workflow logs)
- Comment text (screenshot)
- Latency in seconds

#### Stage 2: Write

**Action**: Leave a feedback comment in ClickUp, then move task to **Write** status

Feedback comment example: `"Good brief. Add more emphasis on how rework preserves earlier stages."`

**Expected (within ~60s)**:
- [ ] "Argument" page created in Doc with new content
- [ ] Comment posted with resumo and next_gate
- [ ] Status auto-advances to **Content Review**

**Timing**: Record latency

**Evidence to capture**:
- n8n execution ID
- Doc "Argument" page content (screenshot)
- Latency in seconds

#### Stage 3: Format

**Action**: Leave another feedback comment, then move task to **Format** status

Feedback comment example: `"Strong argument. Now adapt for LinkedIn voice and character limit."`

**Expected (within ~60s)**:
- [ ] "Final Draft" page created with Wolven-voice LinkedIn post (≤280 characters)
- [ ] Comment posted with resumo and self-check summary
- [ ] Status auto-advances to **Final Review**

**Timing**: Record latency

**Evidence to capture**:
- n8n execution ID
- Doc "Final Draft" page (screenshot)
- Latency in seconds

### Test 2.2: Rework (Selective Re-Run)

**Action**: Move task back to **Write** (simulate feedback requiring argument revision)

**Expected (within ~60s)**:
- [ ] "Argument" page is **replaced** with new content
- [ ] "Brief" page is **preserved** (no changes)
- [ ] "Final Draft" page is **preserved** (no changes)
- [ ] Status auto-advances to **Content Review**

**Evidence to capture**:
- Confirm which pages were modified (only Argument changed)
- n8n execution ID
- Latency in seconds

**Summary for Phase 2**:
- Total latency across 3 stages: should sum to ≤180s
- All 3 pages created successfully
- Rework behavior correct (selective re-run, downstream preservation)

---

## Phase 3: Blocker Handling Test

**Objective**: Verify blockers post comments and return to previous gate.

### Test 3.1: Insufficient Criteria Blocker

**Test Task Creation**:
```
Name: "Live Proof - Blocker Test"
Description: "Minimal description"
Criteria: "" (leave empty or with minimal content)
Initial Status: Backlog
```

**Action**: Move task to **Investigate**

**Expected (within ~60s)**:
- [ ] n8n execution shows `blocker_question` in parsed output
- [ ] Comment posted with `[CQ-BLOCKER]` prefix and blocker question
- [ ] Status returned to **Backlog** (previous gate)

**Evidence to capture**:
- Blocker comment text (screenshot)
- n8n execution ID
- Latency in seconds

### Test 3.2: Blocker Recovery

**Action**: Add answer to blocker comment in ClickUp

Example answer: `"The post should announce our new dashboard feature targeting marketing leads."`

**Then move task to **Investigate** again**

**Expected (within ~60s)**:
- [ ] Stage succeeds and produces normal pointer comment (NOT a blocker)
- [ ] Status auto-advances to **Brief Review**
- [ ] Pointer comment includes the investigation artifact

**Evidence to capture**:
- n8n execution ID
- Confirm pointer comment is posted (not blocker)
- Latency in seconds

---

## Phase 4: Self-Echo and Filter Validation

**Objective**: Confirm status auto-advances don't trigger unnecessary re-runs.

**How to Monitor**:
1. Open n8n Marketing Pipeline workflow
2. Click **Execute** → **Execution** history
3. Monitor execution count per phase

**Expected Execution Pattern** (from Test 2.1 happy path):

| Event | Expected Executions | Type | Explanation |
|-------|---------------------|------|-------------|
| Move to Investigate | 1 | Full | Webhook triggers; AI stage runs |
| Auto-advance to Brief Review | 1 | Filtered | Self-echo detection blocks re-run |
| Move to Write | 1 | Full | New ingress; AI stage runs |
| Auto-advance to Content Review | 1 | Filtered | Self-echo detection blocks re-run |
| Move to Format | 1 | Full | New ingress; AI stage runs |
| Auto-advance to Final Review | 1 | Filtered | Self-echo detection blocks re-run |

**Verification**:
- [ ] Filtered executions appear in the log
- [ ] No duplicate comments posted on auto-advance
- [ ] No unexpected Doc mutations on filtered executions

**Evidence to capture**:
- Screenshot of n8n execution log showing filter behavior
- Confirm total execution count matches expected pattern

---

## Post-Validation Steps

### Step 1: Deploy Workflows

After all phases pass:

```bash
pnpm build:workflows       # Ensure JSON exports are fresh
pnpm deploy:workflows      # Push to n8n.wolven.com.br (requires N8N_API_KEY)
```

Or manually re-import and re-bind credentials if API deploy is unavailable.

### Step 2: Migrate Old-Status Tasks

Review the live Marketing Pipeline list for any tasks in old statuses:
- `Ready`
- `Writing`
- `Approval`
- `Needs Review`

**Decision tree** (see `clickup/list-schema.md`):
- **Ready**: Move to **Investigate** (for staged re-run) or **Backlog**
- **Writing**: Paste artifact link in description, move to **Investigate**
- **Approval/Needs Review**: Decide if re-running or keeping as-is

**Record**: Count of migrated tasks and their new statuses

### Step 3: Record Green-Run Evidence

Update `agents/harness/green-run-evidence.json`:
- Fill in all Phase 1–4 test results
- Record latency measurements
- Set `validation_status` to `"passed"` if all phases succeed
- Add any observations or anomalies

### Step 4: Team Sign-Off

Document:
- Go/no-go decision (via Slack, meeting notes, or PR comment)
- Any issues encountered and resolutions
- Confidence level for production rollout

---

## Rollout Gate Checklist

Before production rollout, verify:

- [ ] **Phase 1 passed**: Call Agent isolation test confirms parsing and blocker outputs
- [ ] **Phase 2 passed**: Happy path completes with Doc creation, comments, and status auto-advances
- [ ] **Phase 3 passed**: Blocker handling works correctly and recovery succeeds
- [ ] **Phase 4 passed**: Self-echo filtering confirmed; no duplicate executions
- [ ] **Latency verified**: All stages ≤60s (record actuals in green-run-evidence.json)
- [ ] **n8n deployed**: Workflows active and webhook registered
- [ ] **Old tasks migrated**: No tasks left in deprecated statuses
- [ ] **Team review complete**: Sign-off from marketing lead + engineering
- [ ] **Evidence recorded**: green-run-evidence.json fully populated

---

## Proof Script Exit Codes

Local verification scripts report their status via exit codes (per ADR-010). When running tasks 23+ validation, you may encounter these codes:

| Exit code | Meaning | Action |
|-----------|---------|--------|
| **0** | Fully verified pass | Live run completed and passed; production ready |
| **1** | Local check failed | Fix the issue per stderr message; re-run script |
| **2** | Blocked (missing prerequisite) | Verify ClickUp credentials, n8n workflow status, field IDs; re-run |
| **3** | Ready but unverified | Preflight passed but live execution not run. Run with: `GREEN_RUN_EXECUTE=1 pnpm green-run` |

**Important:** Exit code **3** is *not* a success. It means the code is structurally valid locally but hasn't been exercised end-to-end in live environment. Always run with `GREEN_RUN_EXECUTE=1` to get exit 0 before declaring production readiness.

## Troubleshooting

### Webhook not reaching n8n

**Check**:
1. Webhook URL copied correctly from n8n ClickUp Webhook node
2. Webhook registered in ClickUp (Integrations → Webhooks)
3. Status change actually triggered (move task, watch for webhook in ClickUp log)

**Fix**: Re-register webhook in ClickUp; restart n8n workflow if needed

### Task stuck in progress

**Check**:
1. n8n execution log for errors in Call Agent sub-workflow
2. OpenAI API quota (check n8n logs)
3. GitHub fetch failures (PAT valid and has repo access?)

**Fix**: See `agents/harness/io-contract.md` for detailed diagnostics

### Doc page not created

**Check**:
1. ClickUp Docs API working (test manually via API)
2. Editorial Doc Url field populated (visible in task custom fields)
3. n8n code node error logs (check "Create Doc" or "Create Page" nodes)

**Fix**: Verify ClickUp v3 API credentials; check field ID mapping in code nodes

### OpenAI JSON parse failure

**Check**:
1. OpenAI API returning valid JSON
2. Model set to `gpt-4.1-mini` (not older model)
3. JSON schema mode enabled in n8n OpenAI node

**Fix**: Temporarily test with `--local` mode; verify JSON schema syntax

---

## Success Criteria

✅ **Task is complete when**:

1. All Phase 1–4 tests pass with evidence recorded
2. Latency per stage documented in green-run-evidence.json
3. No unexpected behavior during live execution
4. Workflow stable for 24+ hours post-deployment
5. Team sign-off on production readiness
6. Go/no-go decision logged

---

## Next Steps

After this task completes:
- Scheduled deployment to production (all Wolven marketing processes move to staged pipeline)
- Ongoing monitoring for 24+ hours
- Feedback loop with marketing leads on staged workflow ergonomics
- Future PRD enhancements based on live learning
