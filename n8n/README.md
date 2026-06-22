# n8n — Marketing Pipeline Orchestration

## Purpose

Workflow JSON exports and n8n configuration for the ClickUp → agent → ClickUp marketing pipeline.

## Key files

| Path | Purpose |
|------|---------|
| `workflows/marketing-pipeline-main.json` | Main workflow: webhook ingress, status transitions, comment post |
| `workflows/call-agent-subworkflow.json` | Sub-workflow: load agent config, invoke Gemini, parse output |
| `mcp-config.stub.json` | MCP stub only — no implementation in M1 |

## GitHub repository (Call Agent config fetch)

Runtime agent configs and skills are loaded from this repository via the n8n GitHub node (ADR-004).

| Setting | Value |
|---------|-------|
| Repository | `rafiti052/agentic-mkt` (private) |
| Default branch | `main` |
| Agent config path | `agents/{agent_id}.json` |
| Skill path | `agents/skills/{skill_name}.md` |

Example raw URLs for `linkedin-writer`:

- `https://raw.githubusercontent.com/rafiti052/agentic-mkt/main/agents/linkedin-writer.json`
- `https://raw.githubusercontent.com/rafiti052/agentic-mkt/main/agents/skills/wolven-voice.md`
- `https://raw.githubusercontent.com/rafiti052/agentic-mkt/main/agents/skills/linkedin-format.md`

### GitHub credential (n8n)

Create a **fine-grained personal access token** scoped to this repository only:

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
2. **Repository access:** Only select repositories → `agentic-mkt`.
3. **Permissions → Repository contents:** Read-only.
4. Do not grant write, metadata beyond read, or organization-wide access.
5. In n8n (`n8n.wolven.com.br`), add a **GitHub** credential using the PAT.
6. Test the credential by fetching `agents/linkedin-writer.json` from the default branch.

The Call Agent sub-workflow depends on this repo being pushed before isolation testing (task_06).

## Manual setup

1. Import workflow JSON into `n8n.wolven.com.br` after tasks 06–07 populate exports.
2. Configure credentials: ClickUp, GitHub (read-only PAT on `agentic-mkt` — see above), Google AI (Gemini).
3. Activate the main workflow and copy the HTTPS webhook URL into ClickUp (see `clickup/webhook-contract.md`).
