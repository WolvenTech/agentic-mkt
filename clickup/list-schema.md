# Marketing Pipeline List Schema

ClickUp list used as the sole GUI for the marketing lead. Status strings and custom field names in this document must match `field-mapping.json` exactly — n8n workflow expressions depend on them.

## List

| Property | Value |
|----------|-------|
| **Name** | Marketing Pipeline |
| **Purpose** | Structured briefs → AI LinkedIn drafts → human review |

Record the list ID in `field-mapping.json` → `clickup_list_id` after creation (see [`README.md`](README.md)).

## Status flow

Primary workflow (M1 automation covers **Ready → Writing → Approval** only):

```
Backlog → Ready → Writing → Approval → Publish → Completed
```

Reserved statuses (defined on the list; **not automated in V1**):

| Status | V1 behavior |
|--------|-------------|
| *(none in current list)* | — |

### Status reference

| Key (`field-mapping.json`) | Display name | Type | M1 automation |
|----------------------------|--------------|------|---------------|
| `backlog` | Backlog | open | — |
| `ready` | Ready | custom | **Webhook ingress** — triggers n8n main workflow |
| `writing` | Writing | custom | Set by n8n after webhook accepted |
| `review` | Approval | custom | Set by n8n after draft comment posted |
| `publish` | Publish | custom | Manual — marketing lead after draft OK |
| `completed` | Completed | closed | Manual — post-publish |

Configure statuses on the list in the order above. Status **display names must match exactly** (case and spacing).

## Custom fields

| Key (`field-mapping.json`) | ClickUp name | Type | Default | Required for brief gate |
|----------------------------|--------------|------|---------|-------------------------|
| `criterios_de_aceite` | Critérios de Aceite | Text | — | **Yes** |
| `agent_id` | agent_id | Short text | `linkedin-writer` | No (defaults apply) |
| `revision_count` | revision_count | Number | `0` | No (Phase 2 revision loop) |

Custom fields must be created in the ClickUp UI — the public API cannot create new field definitions ([ClickUp custom fields API](https://developer.clickup.com/reference/getaccessiblecustomfields)).

## Brief gate (PRD F2)

Before moving a task to **Ready**, the marketing lead must ensure:

1. **Task title** — present and descriptive
2. **Task description** — the content brief (topic, angle, audience, constraints)
3. **Critérios de Aceite** — custom field populated with acceptance criteria the agent must satisfy

**V1 enforcement:** Manual only. ClickUp does not block the status transition; the lead self-checks before dragging to Ready. n8n may still run if the field is empty — note behavior during green run (task_08).

## M1 automation boundary

| Transition | Actor |
|------------|-------|
| Any → Ready | Marketing lead (manual) |
| Ready → Writing | n8n main workflow |
| Writing → Approval | n8n main workflow |
| Approval → Publish → Completed | Marketing lead (manual) |

See [`webhook-contract.md`](webhook-contract.md) for ingress filter and [`../agents/harness/io-contract.md`](../agents/harness/io-contract.md) for agent I/O.
