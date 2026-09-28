---
name: n8n-workflow-builders
description: >-
  Change this repo's n8n workflows through the TypeScript builders and Code node
  sources under src/workflows/, regenerate the exported JSON, and deploy behind
  the vendor gate. Use when editing src/workflows/**, a Code node .js source,
  node wiring, or integrations/marketing-pipelines/*.json. Not ClickUp API
  contract work (clickup-contract), agent JSON or skill content under agents/,
  or ad-hoc edits on the n8n server.
---

# n8n workflow builders

The two n8n workflows — Marketing Pipeline (main) and Call Agent (sub-workflow)
— are generated, never hand-built. TypeScript builders own nodes and wiring,
`.js` files own Code node logic, and `pnpm build:workflows` renders both into
`integrations/marketing-pipelines/*.json`, which n8n imports.

**Consult:** `AGENTS.md` (Protected Surfaces §3, Live-Operation Gating);
`clickup-contract` for anything the workflow sends to or reads from ClickUp;
[platform-facts.md](references/platform-facts.md) for n8n runtime rules.
Decisions: ADR-004 (staged workflow), ADR-006 (stage agent contracts),
ADR-010 (best-effort dedup), ADR-011 (provider routing).

## Hard gates

1. **Builders, never JSON.** Never hand-edit
   `integrations/marketing-pipelines/*.json`. Change the builder or the Code
   node source, then run `pnpm build:workflows`.
2. **Code node logic lives in `.js` sources.** Every Code node loads its body
   with `loadCodeNodeSource({ workflowSlug, nodeSlug, tokens })` from
   `src/workflows/<workflow>/code-nodes/<node-slug>.js`. No inline `jsCode`
   strings in a builder.
3. **IDs have one source each.**
   - Record IDs (task, workspace, doc, page, webhook, history item) come from
     the runtime payload or an earlier node's output.
   - Schema IDs (custom fields, statuses, list) come only from
     `integrations/clickup/field-mapping.json`, injected through builder
     tokens such as `@@FIELD_ID_EDITORIAL_DOC_URL@@`.
   - Credentials stay placeholders (`CLICKUP_CREDENTIAL_ID`,
     `OPENAI_CREDENTIAL_ID`, `GITHUB_CREDENTIAL_ID`).
   - Refuse any hand-typed ID literal in a builder or Code node source.
4. **Live n8n only behind the gate.** Deploy with `pnpm deploy:workflows`,
   which calls `runGate()` first. Never run `scripts/publish-new-workflows.ts`
   directly: it mutates n8n without the gate.
5. **Generated output is committed with its source.** A builder or Code node
   change and its regenerated JSON land in the same commit, so
   `build:workflows:check` stays green in CI.

## When NOT to use

- ClickUp endpoints, payload shapes, field mapping, fixtures, or the vendor
  gate itself → `clickup-contract`.
- Agent configs, runtime skills, references, or the output schema under
  `agents/` → edit those directly; validate with
  `pnpm test tests/contracts/agent-config.test.ts`.
- Debugging a live execution → `pnpm executions:inspect` after
  `pnpm vendor:gate`.
- Editing a workflow in the n8n UI or through an n8n MCP → refuse; the next
  deploy overwrites it (see Refuse).

## Workflow

1. **Locate the owner.** Node, wiring, or IF expression →
   `src/workflows/build-marketing-pipeline.ts` or `build-call-agent.ts`.
   Code node body → its `.js` source. Pure logic both sides share →
   `src/marketing-pipeline/logic.ts` or `src/call-agent/logic.ts`.
2. **Prefer the lightest node.** A one-field transform is an n8n expression;
   multi-source aggregation or stateful logic earns a Code node
   ([platform-facts.md](references/platform-facts.md#code-node-or-expression)).
3. **Write the Code node source** as the house shape: the
   `// n8n Code node source - wrapped in IIFE for parsing` header, an IIFE
   body, read input with `$input.first()` / `$input.all()`, and return
   `[{ json: { … } }]`. Build-time values are `@@TOKEN@@` placeholders passed
   through `tokens`; `loadCodeNodeSource` rejects unresolved and unused
   tokens.
4. **Keep logic mirrored.** When a Code node reimplements logic from
   `src/**/logic.ts`, add or update its case in
   `tests/consistency/n8n-code-equivalence.test.ts`, which runs the rendered
   `jsCode` through `runN8nCodeNode` against the TypeScript function.
5. **Register new sources.** A new Code node source also updates the counts
   and names in `tests/consistency/n8n-code-nodes-inventory.test.ts`;
   `code-node-ownership.test.ts` fails on any source without a node or node
   without a source.
6. **Regenerate** with `pnpm build:workflows`, then run the checks below.
7. **Deploy** only on the Human's explicit ask: `pnpm deploy:workflows`.

## How to verify

```bash
pnpm build:workflows
pnpm build:workflows:check   # committed JSON matches builder output
pnpm lint:code-nodes         # ESLint on every Code node source, tokens rendered
pnpm test                    # consistency suites + builder unit tests
```

A deploy is verified only by a live execution (`pnpm green-run` or
`pnpm executions:inspect`, both after `pnpm vendor:gate`), never by the
deploy command's exit code alone.

## Refuse

Do not hand-edit generated JSON, edit a workflow on the n8n server or UI,
inline Code node bodies in a builder, hard-code an ID literal, bypass the
vendor gate for a deploy or publish, or add a new workflow slug without
updating `APPROVED_WORKFLOWS` in `src/workflows/n8n-codegen.ts` and its
builder, sources, and tests together.
