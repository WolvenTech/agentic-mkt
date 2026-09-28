---
type: note
title: Harness init 2026-09-28 run report
description: Detailed report of the harness-init session that installed the Wolven harness, migrated the legacy ADRs, and stubbed two repo skills.
status: stable
---

# Harness init 2026-09-28 run report

The harness-init session took the repo from a fresh `wolven-harness init`
to a working harness in three phase commits on `chore/wolven-harness`. Every
write was shown to the Human as a diff first, and every decision came from
the Human's answer to one question at a time. The run's own record is
`docs/notes/harness-init-2026-09-28/harness-init-2026-09-28-note.md`; this
report expands on it.

| Commit | Phase | Files |
| --- | --- | --- |
| `5959774` | Entry integration: harness install and `AGENTS.md` fold | 62 |
| `895a639` | Legacy ADR migration | 26 |
| `0eec788` | Setup: discovery, stubs, session note | 6 |

Final state: `harness:validate` exits 0 (48 claims ok, 0 legacy-warn,
0 fail; 2 expected `skill-stub-open` warnings). `pnpm test` (494 passed,
5 skipped), `build:workflows:check`, `lint:code-nodes`, and
`harness:comments` all pass.

## Starting state

- Uncommitted init output: `package.json`, `pnpm-lock.yaml`, and
  `pnpm-workspace.yaml` modified (harness dependency and scripts);
  `.agents/`, `.claude/skills`, `.qmd/`, `docs/`, `CLAUDE.md`, `WOLVEN.md`,
  and `.wolven-harness.json` untracked.
- First `harness:validate` exited 1:
  - 4 `harness-ignored` errors: `.gitignore` excluded all of `.agents/` and
    `.claude/`.
  - 9 `legacy-adr` warnings for `adrs/adr-001.md` through `adr-009.md`,
    with 34 legacy claims.
  - 1 `step0-pending` warning.
- No earlier draft session note existed, so the run started fresh; the note
  was created `draft` before any other write.

## Entry integration

**Mode: light.** `AGENTS.md` was a 388-line curated policy file, so it got a
short `## Wolven harness` block (where skills and rules live, the three
standing rules, doc layout, the ADR-claims rule, QMD-first, the validate
command) instead of the full router and skills table. `WOLVEN.md` was
deleted.

Checks and the Human's decisions:

1. **`CLAUDE.md`** already imported `AGENTS.md`; no change.
2. **Ignored harness paths.** The Human chose to carve them out.
   Re-include rules were appended to `.gitignore` so `.agents/skills`,
   `.agents/rules`, `.agents/hooks`, and `.claude/skills` are tracked, with
   existing ignore lines kept. `AGENTS.md`'s "adapters are never versioned"
   policy now names those four paths as the one versioned exception, with a
   new source-of-truth row and corrected `check-ignore` validations.
3. **Overlap: "adapters must not define policy"** against the three standing
   rules (qmd-first, yagni-strict, comments). The Human chose to have
   `AGENTS.md` adopt them by reference; three passages were reworded.
4. **Overlap: deferral location** (`AGENTS.md`'s `defer` category, recorded
   in `.compozy/`, against yagni-strict's `docs/deferrals/`). The Human
   answered: "drop compozy altogether, this new harness is the only
   tooling." This removed the `.compozy/` row, rule section, ignore line,
   boundary mention (the boundary became "Local Run State"), and README
   lines. The `defer` category now records to `docs/deferrals/`. The
   task-ID notes were checked against the code and rewritten to the
   verified state:
   - The CI bypass rejection is done (`src/clickup/vendor-gate.ts`).
   - `deploy-workflows.ts` and `inspect-executions.ts` call `runGate()`;
     `green-run.ts` and `verify-clickup.ts` do not.
   - The gitleaks CI step is absent.
5. **Existing doc folders** held only harness-written content.

A self-inflicted bug was caught and fixed: the new `.gitignore` row's
validation used `! git check-ignore -q` with several paths. Git rejects
`-q` with more than one path, and the `!` turned that fatal error into a
false pass. Dropping `-q` fixed it, and the check was verified.

## ADR migration

No number collided with 000. Status mapping:

| Number | Title | Legacy status | Result | Decided by |
| --- | --- | --- | --- | --- |
| 001 | V1 Scope — Happy Path with n8n Orchestration | Superseded by 004; idempotency-deferral part still applies | deprecated, superseded by 004 | Human: split the still-binding part out |
| 002, 004–009 | seven ADRs | Accepted | stable | direct mapping |
| 003 | Gemini 2.5 Flash as Worker LLM | Superseded, no successor written | deprecated, superseded by 011 | Human: record a successor |

Two new ADRs were created through `adr` and promoted only after the Human
confirmed them:

- **010, Defer Durable Webhook Idempotency.** While drafting it, the docs
  turned out to be stale: the workflow already has a best-effort dedup
  (`Dedup?` checks `history_item_id` against n8n workflow static data;
  `Mark History Item Seen` records it). The ADR records that state and
  defers a durable idempotency store.
- **011, OpenAI gpt-4.1-mini as Worker LLM.** The Context uses the Human's
  reason ("gemini path failed, gpt 4.1 was a successful second try"). The
  Decision and Consequences come from the code: `DEFAULT_PROVIDER` and
  `DEFAULT_MODEL`, the three agent JSONs, and `Route Provider` sending
  `openai` and legacy `google` to OpenAI.

Each legacy ADR was moved with `git mv` to
`docs/adrs/adr-NNN-<slug>.md`, with frontmatter prepended and the body kept
verbatim apart from recomputed relative links, all verified to resolve.

Claim loop (10 failures after the moves):

- **Six idempotency claims** (`agents/harness/io-contract.md` ×2,
  `agents/harness/README.md`, `src/clickup/green-run-validation.ts`,
  `tests/contracts/harness.test.ts` ×2): repointed from 001 to 010, and
  "no dedup" corrected to "best-effort dedup". The test's name and token
  assertion changed with them.
- **Two provider notes** (`agents/README.md`, `io-contract.md`):
  repointed from 003 to 011, and a broken `../src/call-agent/logic.ts`
  link on the same line fixed.
- **`eslint.config.mjs`** cited 003 for `@@TOKEN@@` placeholders, a
  planning-era number no ADR records. The claim was dropped.
- **`src/types/agent-config.ts`** cited 003 as "Role-Focused
  Self-Contained Stage Agents". Repointed to 006.

Meaning check (claims that resolved but named the wrong decision). Git
blame showed several predate tracked ADRs, when numbers belonged to local
planning ADRs:

- The `AGENTS.md` `.gitignore` row cited 002 for ignore rules; it now
  points at the Local-Adapter Policy section.
- The `AGENTS.md` footer cited 006 for its own rewrite scope; the line was
  dropped and "Last updated" set to 2026-09-28.
- Both workflow builders said "Source of truth per" 006; they now cite
  `AGENTS.md` (Generated n8n Workflow JSON).
- The other 18 claims were read against their ADR titles and are correct.

Closure: 11 links into the old `adrs/` folder were rewritten; the legacy
index `adrs/README.md` was deleted on the Human's choice, and the root
README row now points at `docs/adrs/`. `harness:comments` flagged the
edited eslint comment as untagged; a `why:` tag fixed it.

## Setup

**Discovery.** QMD was configured but never built; `qmd update` indexed
13 documents (no embeddings). The Human named the lifecycle **prototype**.
Decided tools: n8n (self-hosted), ClickUp API v2 and Docs v3, OpenAI
`gpt-4.1-mini` through n8n, GitHub (agent-config fetch), TypeScript with
`tsx`, Vitest, ESLint, ajv, pnpm, Node, GitHub Actions, QMD, and the Wolven
harness. The Human named no decisions beyond the code.

**Research.** Repo-only; the Human declined the optional web pass.

**Suggestions.** Three, grounded in repo evidence and not duplicating an
installed skill: `n8n-workflow-builders` (picked), `clickup-contract`
(picked), and `stage-agent-configs` (not picked).

**Stubs.** Written to `.agents/skills/<name>/` as `SKILL.md` and
`agents/openai.yaml`. Both are ask-only
(`disable-model-invocation: true`, `allow_implicit_invocation: false`),
with discovery evidence and four headed prompts for the Human.

**QMD side effects**, resolved on the Human's choice: `.qmd/index.sqlite*`
was added to `.gitignore`, and the `models:` block `qmd update` wrote into
`index.yml` was kept.

## Open items

1. **Define the two stubs**, then remove `wolven-harness: stub`.
2. **Two safety gaps** that lost their tracker when Compozy was dropped:
   `scripts/green-run.ts` and `scripts/verify-clickup.ts` don't call
   `runGate()`, and the gitleaks step is missing from CI although
   `AGENTS.md` describes it. Fix them, or record deferrals under
   `docs/deferrals/` with a risk-acceptance owner and trigger date.
3. **Stale leftovers:** `GOOGLE_API_KEY` in `.env.example` belongs to the
   retired Gemini path; planning task IDs remain in comments in
   `src/marketing-pipeline/logic.ts`, `src/clickup/verify-api.ts`, and
   `src/workflows/build-marketing-pipeline.test.ts`.
4. **QMD:** run `qmd embed` for vector search, and `qmd update` after
   `docs/` changes.
