# Agents — Runtime Configs

## Purpose

Colocated agent JSON configs and skill markdown loaded by the Call Agent sub-workflow via GitHub.

## Key files

| Path | Purpose |
|------|---------|
| `linkedin-writer.json` | Worker agent config (provider, model, skills, output schema) |
| `skills/*.md` | Brand voice and format rules inlined at execution |

## Agent JSON schema

Each `agents/{id}.json` file defines the runtime contract for the Call Agent sub-workflow:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Agent identifier; must match filename without `.json` |
| `provider` | string | LLM provider (currently `"openai"` for all agent configs) |
| `model` | string | Model name (currently `"gpt-4.1-mini"`) |
| `skills` | string[] | Skill filenames without `.md` extension |
| `temperature` | number | Sampling temperature |
| `max_output_tokens` | number | Maximum tokens in model response |
| `output_schema` | object | Required JSON output keys and descriptions |

**Two `output_schema` shapes exist.** `linkedin-writer.json` is the legacy, pre-staged single-agent config; its `output_schema` keys (must align with `agents/harness/output-schema.json`) are:

- `deliverable_markdown` — Full draft in markdown
- `resumo` — 2–3 sentence summary
- `autochecagem` — Bullet list validating draft against acceptance criteria

The staged pipeline's three active agents — `investigative-brief.json`, `long-form-argument.json`, `linkedin-format.json` — use `StageAgentOutput` instead: `stage`, `artifact_markdown`, `resumo`, `self_check`, `next_gate`, and optional `blocker_question`. See [`harness/io-contract.md` → Output (`StageAgentOutput`)](harness/io-contract.md#output-stageagentoutput) for the authoritative staged contract.

## GitHub load paths

The Call Agent sub-workflow fetches configs from the `agentic-mkt` GitHub repo ([ADR-002](../adrs/adr-002.md)):

| Resource | GitHub path |
|----------|-------------|
| Agent config | `agents/{agent_id}.json` |
| Skill markdown | `agents/skills/{skill_name}.md` |

Example for `linkedin-writer`:

- `agents/linkedin-writer.json`
- `agents/skills/wolven-voice.md`
- `agents/skills/linkedin-format.md`

Requires a fine-grained GitHub PAT (read-only, repo scope) in n8n. Push this repo to GitHub before testing.

## Skill copy procedure (from skill-vault)

Runtime skills are adapted from the sibling `skill-vault` catalog. **Manual copy until sync automation exists** ([ADR-002](../adrs/adr-002.md)).

### Copy steps

1. **Source paths** (skill-vault repo, sibling to agentic-mkt):
   - `catalog/marketing/skills/wolven-voice/SKILL.md` → `agents/skills/wolven-voice.md`
   - `catalog/marketing/skills/linkedin-format/SKILL.md` → `agents/skills/linkedin-format.md`
   - Agent persona reference: `catalog/marketing/agents/linkedin-writer/AGENT.md` (used in n8n system prompt assembly, not stored as a separate runtime file)

2. **Adaptation rules**:
   - Strip YAML frontmatter (`---` block) not needed at runtime.
   - Preserve voice pillars, tone rules, format structure, and actionable constraints in body markdown.
   - Keep flat filenames under `agents/skills/` (no nested catalog paths).
   - Update `skills[]` in agent JSON to match filenames without `.md`.

3. **Verify** after copy:
   ```bash
   pnpm test tests/agents.test.ts
   ```
   Confirm each `skills[]` entry resolves to `agents/skills/{name}.md`.

4. **Push to GitHub** — Call Agent sub-workflow fetches skills at execution time via GitHub node.

### Drift risk and planned sync script

| Risk | Current mitigation | Planned |
|------|---------------------|---------|
| skill-vault catalog updated but `agents/skills/` not | Manual copy procedure above; document changes in commit message | On-demand sync script: skill-vault → `agents/skills/` |
| Agent JSON `skills[]` out of sync with files on disk | `tests/agents.test.ts` validates resolution | Sync script updates both files and JSON refs |
| Proprietary voice skills diverge from public catalog | Keep voice/tone skills in private `agentic-mkt` only | Same sync script with proprietary path filter |

**Do not block current work on the sync script** — stubs and manual copy are sufficient per PRD scope. Track drift in PR reviews when skill-vault changes land.

### Provider note ([ADR-003](../adrs/adr-003.md))

All staged agent configs (`investigative-brief.json`, `long-form-argument.json`, `linkedin-format.json`) and the legacy `linkedin-writer.json` currently ship with `"provider": "openai"`, `"model": "gpt-4.1-mini"`. The PRD originally specified Claude Sonnet 4.6; an earlier draft used Gemini. Phase 2 may swap providers by updating agent JSON only — no workflow restructure required. Evaluate draft quality during Phase 2 planning.

## Operational runbook

1. After skill copy, run `pnpm test tests/agents.test.ts`.
2. Push `agentic-mkt` to GitHub (`main` branch).
3. Verify n8n Call Agent isolation test loads both skills in **Assemble Prompt** output.
4. See [GitHub Runtime Config Pattern](harness/io-contract.md#4-github-runtime-config-pattern) for cross-project replication.

## Manual setup

1. Push `agentic-mkt` to GitHub before testing the Call Agent sub-workflow.
2. Configure a fine-grained GitHub PAT (read-only, repo scope) in n8n.
