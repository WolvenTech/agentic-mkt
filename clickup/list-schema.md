# Marketing Pipeline List Schema

ClickUp list used as the sole GUI for the marketing lead. Status strings and custom field names in this document must match `field-mapping.json` exactly — n8n workflow expressions depend on them.

## List

| Property | Value |
|----------|-------|
| **Name** | Marketing Pipeline |
| **Purpose** | Structured briefs → AI LinkedIn drafts → human review |

Record the list ID in `field-mapping.json` → `clickup_list_id` after creation (see [`README.md`](README.md)).

## Status flow

**Staged editorial workflow** (humans approve by moving forward; AI stages run on entry):

```
Backlog [Human]
  → Investigate [AI] → Brief Review [Human]
  → Write [AI] → Content Review [Human]
  → Format [AI] → Final Review [Human]
  → Publish [Human] → Closed
```

**Rework flow:** moving a task back to an AI column re-runs only that stage; the lead re-runs downstream stages as needed.

**Blocker flow:** if an AI stage lacks material to produce output, it posts a blocker question and returns the task to the previous human column.

### Status reference

| Key (`field-mapping.json`) | Display name | Type | When set | Actor |
|----------------------------|--------------|------|----------|-------|
| `backlog` | Backlog | open | Initial state | — |
| `investigate` | Investigate | custom | **Webhook ingress** — lead triggers investigation | Lead / n8n |
| `brief_review` | Brief Review | custom | After Investigate completes | n8n (auto-advance) |
| `write` | Write | custom | Lead approves brief and moves forward | Lead |
| `content_review` | Content Review | custom | After Write completes | n8n (auto-advance) |
| `format` | Format | custom | Lead approves argument and moves forward | Lead |
| `final_review` | Final Review | custom | After Format completes | n8n (auto-advance) |
| `publish` | Publish | custom | Lead approves final draft and moves forward | Lead |
| `closed` | Closed | closed | Post-publication | Lead |

Configure statuses on the list in the order above. Status **display names must match exactly** (case and spacing).

## Custom fields

| Key (`field-mapping.json`) | ClickUp name | Type | Default | Required for brief gate |
|----------------------------|--------------|------|---------|-------------------------|
| `criterios_de_aceite` | ACs | Text | — | **Yes** |
| `agent_id` | Agent | Short text | `linkedin-writer` | No (defaults apply) |
| `editorial_doc_url` | Editorial Doc Url | URL | — | No (written by workflow) |

Custom fields must be created in the ClickUp UI — the public API cannot create new field definitions ([ClickUp custom fields API](https://developer.clickup.com/reference/getaccessiblecustomfields)).

## Brief gate (PRD F2)

Before moving a task to **Investigate**, the marketing lead must ensure:

1. **Task title** — present and descriptive
2. **Task description** — the content brief (topic, angle, audience, constraints)
3. **ACs** — custom field populated with acceptance criteria the agent must satisfy

**V1 enforcement:** Manual only. ClickUp does not block the status transition; the lead self-checks before moving to Investigate. n8n may still run if the field is empty — note behavior during validation.

## Approval and control model

**Human approval is movement forward.** Moving a task from a human gate to the next AI column triggers that stage. The AI stage writes its artifact into the ClickUp Doc, posts a short pointer comment summarizing what changed and what is needed, and the status auto-advances to the next human gate.

**Comments instruct; the Doc stores artifacts.** All human feedback (angle refinements, argument corrections, final edits) flows through **free-form task comments** only — not Doc comments. Each AI stage reads the latest actionable feedback from the comment thread and ignores its own pointer comments and stale history.

**Rework re-runs only the selected stage.** Moving a task *back* to an earlier AI column re-runs only that stage; downstream artifacts are **preserved until manually re-run**. This allows the lead to selectively fix an earlier stage without cascading re-runs.

**Blockers return to the previous human gate.** If an AI stage lacks enough material (e.g., insufficient evidence), it posts one high-impact blocker question as a comment and returns the task to the previous human gate. The lead answers the question via comment and re-moves the task forward to retry.

See [`webhook-contract.md`](webhook-contract.md) for ingress filter and [`../agents/harness/io-contract.md`](../agents/harness/io-contract.md) for agent I/O.

## Rollout Readiness

**Production rollout is blocked until live proof is complete.** See [`.compozy/tasks/content-quality-pipeline/task_23.md`](../.compozy/tasks/content-quality-pipeline/task_23.md) for live validation checklist.

### Pre-deployment Requirements

Before activating the staged workflow in production:

- [ ] All local tests pass: `pnpm test`
- [ ] Workflow topology tests pass: `pnpm build:workflows:check`
- [ ] Staged statuses exist in the Marketing Pipeline list (exactly as named above)
- [ ] Custom field `Editorial Doc Url` exists and is type Short Text
- [ ] n8n credentials configured: ClickUp (OAuth or PAT), GitHub (read-only), OpenAI
- [ ] GitHub repo pushed to `main` branch (Call Agent fetches at runtime)
- [ ] n8n workflows imported and active (Call Agent and Marketing Pipeline main)
- [ ] ClickUp webhook registered and confirmed working (see `n8n/README.md`)
- [ ] Phase 1–4 live validation tests pass (isolated n8n test, Doc/custom-field write, blocker routing, self-echo filtering)
- [ ] Green-run evidence recorded in `agents/harness/green-run-evidence.json`

### Post-Deployment Stability

After live activation:

- [ ] Monitor workflow executions for 24+ hours; record any errors or unexpected status transitions
- [ ] Latency per stage is consistently ≤60s (record actual in green-run-evidence.json)
- [ ] Blocker questions are clear and actionable
- [ ] Pointer comments are posted correctly with stage context
- [ ] Doc pages are created and updated without corruption
- [ ] Status auto-advances work consistently

## Migration: Old In-Flight Tasks

**Before deploying the staged workflow**, audit the live Marketing Pipeline list for tasks in deprecated statuses:

- `Ready` (old pre-stage status)
- `Writing` (old single-agent revision)
- `Approval` (old approval gate)
- `Needs Review` (old revision trigger)

### Migration Decision Tree

For each in-flight task:

**If task is in Backlog or earlier:**
- No action required; task is out of workflow scope.

**If task is Ready:**
- Option A: Move to **Investigate** (staged workflow; recommended for new work)
- Option B: Move to **Backlog** if not yet ready for editorial review

**If task is Writing:**
- Option A: Paste artifact link in task description, move to **Investigate** (re-run through staged workflow)
- Option B: Move to **Backlog** if still in prep

**If task is in Approval or Needs Review:**
- **Decision required:** Does the lead want to continue with old single-agent flow, or re-run staged?
- If re-running: paste artifact link in task description, move to **Investigate**
- If continuing old flow: **do not change status** (old workflow is removed; task will block)

### Migration Steps

1. Query all tasks with status in `[Ready, Writing, Approval, Needs Review]`
2. Triage each task using decision tree above
3. Bulk-move tasks to new statuses
4. **For tasks re-running staged:** verify artifact link is in task description before moving to **Investigate**
5. Record migration summary: count by old status → new status

### Important Notes

- The old single-agent `Marketing Pipeline` workflow is being **replaced**, not coexisting
- Tasks left in old statuses after deployment will block or fail in n8n
- After migration, `Ready`, `Writing`, `Approval`, and `Needs Review` may be removed from the list (see ClickUp UI)
- The staged workflow uses **human approval as movement forward** — leads move tasks to trigger stages, unlike the old auto-run behavior
