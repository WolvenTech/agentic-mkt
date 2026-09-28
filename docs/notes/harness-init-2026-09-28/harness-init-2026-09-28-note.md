---
type: note
title: Harness init 2026-09-28
description: Record of the harness-init run that set up the Wolven harness in this repo.
status: stable
---

# Harness init 2026-09-28

## Entry integration

Mode: **light**, chosen because `AGENTS.md` was a long, curated policy file.
The `## Wolven harness` block was appended and `WOLVEN.md` deleted.

Checks raised:

- **`CLAUDE.md`** already imported `AGENTS.md`; no change.
- **Harness paths ignored** (`.agents/skills`, `.agents/rules`,
  `.agents/hooks`, `.claude/skills`). The Human chose to carve them out:
  re-include rules appended to `.gitignore`, existing ignore lines kept.
- **Overlap: adapters never versioned.** `AGENTS.md` said `.agents/` and
  `.claude/` are never versioned. Amended to name the four harness paths as
  the one versioned exception, with a new source-of-truth row and corrected
  `check-ignore` validations.
- **Overlap: adapters must not define policy.** The Human chose to have
  `AGENTS.md` adopt the three standing rules by reference.
- **Overlap: deferral location.** The Human chose to drop Compozy entirely:
  the harness is the only planning tooling. Removed the `.compozy/` row,
  rule section, ignore line, boundary mention, and README lines; the
  `defer` cleanup category now records to `docs/deferrals/`. Task-ID
  implementation notes were rewritten to the verified state: the CI bypass
  rejection is done; `deploy-workflows.ts` and `inspect-executions.ts` call
  `runGate()` but `green-run.ts` and `verify-clickup.ts` do not; the
  gitleaks CI step is absent.
- **Existing doc folders:** only harness-written content; nothing to
  reshape.
- **Noted for step 1:** the `.gitignore` row in `AGENTS.md` cites legacy
  002 for adapter ignore rules, but 002 decides agent-config colocation.

## ADR migration

Nine legacy ADRs moved from `adrs/` into `docs/adrs/`, keeping their numbers,
with frontmatter prepended and bodies kept verbatim apart from recomputed
relative links. No number collided with 000. Two new ADRs were recorded
through `adr` and promoted on the Human's confirmation: 010, Defer Durable
Webhook Idempotency, and 011, OpenAI gpt-4.1-mini as Worker LLM.

| Number | Title | Legacy status | Mapped status | Evidence | Decision |
| --- | --- | --- | --- | --- | --- |
| 001 | V1 Scope — Happy Path with n8n Orchestration | Superseded by 004; idempotency-deferral part still applies | deprecated, superseded by 004 | its Status section and the legacy index row | Human: split the still-binding deferral into new 010, then deprecate |
| 002 | Agent Config Colocated in agentic-mkt | Accepted | stable | Status section | table |
| 003 | Gemini 2.5 Flash as Worker LLM | Superseded, no successor written | deprecated, superseded by 011 | Status section; `src/call-agent/logic.ts` defaults | Human: record successor 011 ("Gemini path failed, gpt-4.1 was a successful second try"), then deprecate |
| 004 | Replace Single-Agent Marketing Flow with Staged Content Quality Workflow | Accepted | stable | Status section | table |
| 005 | Use Local-First Verification with Live Proof as a Follow-Up Task | Accepted | stable | Status section | table |
| 006 | Use Stage-Aware Agent Contracts and Reference Files | Accepted | stable | Status section | table |
| 007 | Tag-Based AI Activity Signaling for Staged Columns | Accepted | stable | Status section | table |
| 008 | Enforce Exit-Code Contract for Proof and Green-Run Scripts | Accepted | stable | Status section | table |
| 009 | Strict Staged Output and Early Editorial Doc Pointer Persistence | Accepted | stable | Status section | table |

Before deprecating 001, its tokens were searched: `tests/contracts/harness.test.ts`
asserted the 001 token in the I/O contract and harness README.

Claim loop (each answered by the Human):

- **Idempotency, six claims** (`agents/harness/io-contract.md` ×2,
  `agents/harness/README.md`, `src/clickup/green-run-validation.ts`,
  `tests/contracts/harness.test.ts` ×2): repointed from 001 to 010, and the
  stale "no dedup" wording corrected to "best-effort dedup", matching the
  `Dedup?` / `Mark History Item Seen` nodes.
- **Provider notes, two claims** (`agents/README.md`,
  `agents/harness/io-contract.md`): repointed from 003 to 011; a broken
  `../src/call-agent/logic.ts` link on the same line fixed.
- **`eslint.config.mjs`**: cited 003 for `@@TOKEN@@` placeholders, a
  planning-era number no ADR records. Claim dropped; the comment gained a
  `why:` tag to satisfy `harness:comments`.
- **`src/types/agent-config.ts`**: cited 003 as "Role-Focused Self-Contained
  Stage Agents". Repointed to 006.

Meaning check (claims that resolved but named the wrong decision):

- **`AGENTS.md` `.gitignore` row** cited 002 for ignore rules. Reworded to
  point at the Local-Adapter Policy section.
- **`AGENTS.md` footer** cited 006 for its own rewrite scope. Line dropped;
  "Last updated" bumped to 2026-09-28.
- **Both workflow builders** said "Source of truth per" 006, a planning-era
  number. Reworded to cite `AGENTS.md` (Generated n8n Workflow JSON).
- The other 18 claims (002, 004–009) were read against their ADR titles and
  name the right decision.

Closure: eleven links into the old `adrs/` folder rewritten to `docs/adrs/`;
the legacy index `adrs/README.md` deleted on the Human's choice, and the root
README row pointed at `docs/adrs/`. `harness:validate` exits 0 with
0 legacy-warn; `pnpm test` (494 passed, 5 skipped), `build:workflows:check`,
`lint:code-nodes`, and `harness:comments` all pass.

## Discovery

Context, from the repo's own files:

- agentic-mkt runs a staged Content Quality Pipeline: ClickUp webhooks start
  n8n workflows that call stage agents (investigate, write, format), write
  one ClickUp Doc per task, and advance human gates.
- TypeScript builders under `src/workflows/` generate the n8n workflow JSON
  in `integrations/marketing-pipelines/`; Code node logic lives in `.js`
  sources. Agent configs, skills, and references live under `agents/` and are
  fetched from GitHub at run time.
- Tests: Vitest with co-located unit tests plus `tests/consistency`,
  `integration`, `contracts`, and gated `live` suites. CI (GitHub Actions)
  runs Code node lint, `pnpm test`, and `build:workflows:check`.
- Architecture is recorded in twelve profile ADRs (000–011) and in
  `AGENTS.md`'s source-of-truth map and protected surfaces.
- QMD was configured (`.qmd/index.yml`) but its index had never been built;
  `qmd update` indexed 13 documents. Embeddings were not generated.

Lifecycle: **prototype** (named by the Human).

Decided tools: n8n (self-hosted), ClickUp API v2 and Docs v3, OpenAI
`gpt-4.1-mini` through n8n, GitHub (agent-config fetch), TypeScript with
`tsx`, Vitest, ESLint, ajv, pnpm, Node, GitHub Actions, QMD, and the Wolven
harness. The Human named no decisions beyond the code.

## Research

Repo-only: the Human declined the optional web pass. Findings come from the
repo and the QMD index: `integrations/clickup/webhook-contract.md`,
`integrations/clickup/list-schema.md`, `agents/harness/io-contract.md`,
`src/workflows/`, `src/clickup/`, and the ADRs in `docs/adrs/`.

## Suggestions

Three suggested, none duplicating an installed skill:

- **n8n-workflow-builders**: builders, Code node sources, generate/check/
  deploy flow. Picked.
- **clickup-contract**: ClickUp API v2 and Docs v3, field-mapping sync,
  webhook and list contracts, fixtures, vendor gate. Picked.
- **stage-agent-configs**: agent JSON, skills, references, output schema.
  Not picked.

The evidence did not support a fourth.

## Stubs

- `.agents/skills/n8n-workflow-builders/` (`SKILL.md`, `agents/openai.yaml`)
- `.agents/skills/clickup-contract/` (`SKILL.md`, `agents/openai.yaml`)

Both are ask-only (`disable-model-invocation: true`,
`allow_implicit_invocation: false`) and carry the `wolven-harness: stub`
marker, so `harness:validate` warns `skill-stub-open` for each.

Also in the setup phase: `.qmd/index.sqlite*` added to `.gitignore`, and the
`models:` block `qmd update` wrote into `.qmd/index.yml` kept, both on the
Human's choice.

## Next steps for the Human

- **Define the stubs.** For each, answer When to use, Conventions, What to
  avoid, and How to verify, then remove `wolven-harness: stub`. Remove
  `disable-model-invocation` and `agents/openai.yaml` only if the skill
  should be model-invocable.
- **Open gaps now visible in `AGENTS.md`** (they lost their tracker when
  Compozy was dropped): `scripts/green-run.ts` and `scripts/verify-clickup.ts`
  do not call `runGate()`, and the gitleaks step is missing from CI. Both
  touch irreversible-harm surfaces, so either fix them or record deferrals
  under `docs/deferrals/` with a risk-acceptance owner and trigger date.
- **Stale leftovers:** `GOOGLE_API_KEY` in `.env.example` belongs to the
  Gemini path (003); planning task IDs remain in source comments
  (`src/marketing-pipeline/logic.ts`, `src/clickup/verify-api.ts`,
  `src/workflows/build-marketing-pipeline.test.ts`), which the `comments`
  rule forbids in new comments.
- **QMD:** run `qmd embed` for vector search, and `qmd update` after
  `docs/` changes.
- **Review before pushing:** the three phase commits sit on
  `chore/wolven-harness`, unpushed.
