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

## Production Status

**Live.** The staged workflow passed live validation (Phase 1–4: Call Agent isolation, ClickUp/Doc integration, blocker routing, self-echo filtering) and is the only workflow running against this list — the old single-agent flow (`Ready` / `Writing` / `Approval` / `Needs Review`) has been fully retired and migrated; those statuses no longer exist on the list.

See [`LIVE-PROOF-RUNBOOK.md`](../agents/harness/LIVE-PROOF-RUNBOOK.md) for the validation record and ongoing operational runbook (monitoring, latency targets, troubleshooting).
