# Marketing Pipelines — n8n Workflow Exports

## Purpose

Version-controlled n8n workflow JSON for the **staged content quality pipeline** — a three-stage editorial workflow for Wolven LinkedIn posts. The workflow is triggered by ClickUp status changes, orchestrates three independent AI stages (investigate, write, format), writes artifacts to a ClickUp Doc per task, and posts pointer comments to keep the lead informed. Generated from TypeScript builders in `src/workflows/` — do not hand-edit unless re-exporting from n8n after credential binding.

## Key files

| Path | Purpose |
|------|---------|
| `call-agent-subworkflow.json` | Sub-workflow: load agent config and references from GitHub, invoke OpenAI, parse typed stage output (`investigate` / `write` / `format`) |
| `marketing-pipeline-main.json` | Main workflow: webhook ingress on `investigate/write/format`, stage ingress filtering, status advance to next human gate, Doc/comment creation, blocker handling |

For workflow operation details: [`../clickup/README.md`](../clickup/README.md). I/O contracts and troubleshooting: [`agents/harness/io-contract.md`](../agents/harness/io-contract.md).

## Manual setup

### Regenerate or deploy

```bash
pnpm build:workflows      # rewrite JSON in this folder from src/workflows/
pnpm deploy:workflows     # push to n8n.wolven.com.br (requires N8N_API_KEY)
```

Run `pnpm vendor:gate` before any live operation (see root [README](../README.md)).

### Import order (first-time setup)

1. **Call Agent sub-workflow** — import `call-agent-subworkflow.json` into `n8n.wolven.com.br`. Bind **GitHub** (read-only PAT on `WolvenTech/agentic-mkt`) and **OpenAI** credentials. Run **Manual Trigger (Isolation Test)**; confirm **Parse Agent Output** returns the stage contract fields for the selected agent/stage. Leave **Inactive** (invoked by main workflow only).
2. **Marketing Pipeline main workflow** — import `marketing-pipeline-main.json`. Bind **ClickUp** credential; on **Execute Call Agent**, select the **Call Agent** sub-workflow. **Activate** the main workflow.
3. **ClickUp webhook** — copy production URL from **ClickUp Webhook** node. Register in ClickUp: **Task Status Updated** on the Marketing Pipeline list.

Host credentials, GitHub PAT setup, and MCP stub: [`n8n/README.md`](../n8n/README.md).

### Stage timing targets

Each stage should complete within the responsiveness the lead already experiences:

| Stage | Target |
|-------|--------|
| Investigate → Brief Review | ≤ 60 s |
| Write → Content Review | ≤ 60 s |
| Format → Final Review | ≤ 60 s |

Record actuals in [`agents/harness/green-run-evidence.json`](../agents/harness/green-run-evidence.json) after a verified run.

### Rework and approval

- **Approval is movement forward:** moving a task from a human gate into an AI column triggers that stage.
- **Rework re-runs only the selected stage:** moving a task back to an earlier AI column runs only that stage; downstream artifacts are preserved until manually re-run.
- **Comments instruct; the Doc stores artifacts:** all human feedback flows through task comments; the Doc is the readable workspace.

## Operational runbook

1. **First-time setup:** follow **Manual setup → Import order** above; credential details in [`n8n/README.md`](../n8n/README.md).
2. **Workflow operation:** see [`../clickup/README.md`](../clickup/README.md) for the complete staged workflow, rework flow, and blocker handling.
3. **After builder changes:** `pnpm build:workflows` then `pnpm deploy:workflows` (or manual re-import from this folder).
4. **Troubleshooting and I/O contracts:** [`agents/harness/io-contract.md`](../agents/harness/io-contract.md).

### Key workflow characteristics

- **Three independent stages** — investigate, write, format — each runs in the Call Agent sub-workflow and returns typed output.
- **One ClickUp Doc per task** — the workflow creates a Doc with one page per stage (Brief, Argument, Final Draft) and stores the Doc URL in the **Editorial Doc Url** custom field.
- **Auto-advance to the next human gate** — when a stage succeeds, the workflow posts a pointer comment and moves status to the next human column.
- **Blocker handling** — if a stage lacks material, it posts a blocker question and returns to the previous human column.
- **Preservation of downstream artifacts** — re-running an earlier stage preserves later artifacts until they are re-run.
