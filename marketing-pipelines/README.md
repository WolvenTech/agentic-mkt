# Marketing Pipelines — n8n Workflow Exports

## Purpose

Version-controlled n8n workflow JSON for the M1 ClickUp → agent → ClickUp marketing pipeline. Generated from TypeScript builders in `src/workflows/` — **do not hand-edit these files**. All runtime Code node logic lives in source `.js` files; see [Workflow Architecture](#workflow-architecture) below.

## Key files

| Path | Purpose |
|------|---------|
| `call-agent-subworkflow.json` | Sub-workflow: load agent config from GitHub, invoke OpenAI, parse `AgentOutput` |
| `marketing-pipeline-main.json` | Main workflow: webhook ingress, status transitions, comment post |

I/O contracts and troubleshooting: [`agents/harness/io-contract.md`](../agents/harness/io-contract.md).

## Workflow Architecture

### Code Node Source Files

All n8n Code node runtime logic is authored as normal JavaScript source files. **Do not hand-edit the `jsCode` parameter in the workflow JSON** — instead, edit the corresponding `.js` source file.

| Workflow | Code Node | Source File |
|----------|-----------|-------------|
| Call Agent | `Assemble Prompt` | `../src/workflows/call-agent/code-nodes/assemble-prompt.js` |
| Call Agent | `Parse Agent Config` | `../src/workflows/call-agent/code-nodes/parse-agent-config.js` |
| Call Agent | `Parse Agent Output` | `../src/workflows/call-agent/code-nodes/parse-agent-output.js` |
| Call Agent | `Store Input Context` | `../src/workflows/call-agent/code-nodes/store-input-context.js` |
| Call Agent | `Unsupported Provider Error` | `../src/workflows/call-agent/code-nodes/unsupported-provider-error.js` |
| Marketing Pipeline | (15 Code nodes) | `../src/workflows/marketing-pipeline/code-nodes/*.js` |

When Code node source files change, regenerate the workflow JSON using `pnpm build:workflows` from the repo root.

### Token Placeholders in Source Files

Code node `.js` files may contain placeholder tokens (e.g., `@@FIELD_IDS@@`) for build-time values. These are replaced during workflow generation. Placeholder lines may have lint exceptions for `@eslint-disable` — that is expected and safe. The rendered JavaScript is what n8n executes.

## Manual setup

### Regenerate or deploy

```bash
pnpm build:workflows      # rewrite JSON in this folder from src/workflows/
pnpm deploy:workflows     # push to n8n.wolven.com.br (requires N8N_API_KEY)
```

Run `pnpm vendor:gate` before any live operation (see root [README](../README.md)).

### Import order (first-time setup)

1. **Call Agent sub-workflow** — import `call-agent-subworkflow.json` into `n8n.wolven.com.br`. Bind **GitHub** (read-only PAT on `rafiti052/agentic-mkt`) and **OpenAI** credentials. Run **Manual Trigger (Isolation Test)**; confirm **Parse Agent Output** returns `deliverable_markdown`, `resumo`, and `autochecagem`. Leave **Inactive** (invoked by main workflow only).
2. **Marketing Pipeline main workflow** — import `marketing-pipeline-main.json`. Bind **ClickUp** credential; on **Execute Call Agent**, select the **Call Agent** sub-workflow. **Activate** the main workflow.
3. **ClickUp webhook** — copy production URL from **ClickUp Webhook** node (`https://n8n.wolven.com.br/webhook/marketing-pipeline-ready-to-work`). Register in ClickUp: **Task Status Updated** on the Marketing Pipeline list.

Host credentials, GitHub PAT setup, and MCP stub: [`n8n/README.md`](../n8n/README.md).

### Green run timing

| Checkpoint | Target |
|------------|--------|
| ready → writing | ≤ 5 s |
| writing → comment posted | ≤ 60 s total |
| Final status | approval |

Record actuals in [`agents/harness/green-run-evidence.json`](../agents/harness/green-run-evidence.json) after a verified run.

### Revision trigger

Phase 2 revision ingress uses the same main workflow: the lead leaves feedback in the ClickUp task comments, then moves the task from **approval** to **needs review**. The workflow moves the task **needs review → writing → approval** while it produces the revised draft comment.

## M2 operational runbook

1. After builder changes: `pnpm build:workflows` then `pnpm deploy:workflows` (or manual re-import from this folder).
2. First-time setup: follow **Manual setup → Import order** above; credential details in [`n8n/README.md`](../n8n/README.md).
3. Troubleshooting and I/O contracts: [`agents/harness/io-contract.md`](../agents/harness/io-contract.md).
4. Revision runs are triggered by comment feedback plus **needs review** status; no separate n8n workflow is imported for revisions.
