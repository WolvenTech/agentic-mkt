---
name: n8n-workflows
description: Stub skill for n8n workflow builders and code nodes — not yet defined
metadata:
  wolven-harness: stub
disable-model-invocation: true
---

# n8n-workflows

Suggested while discovering this repo's decided tools, ask-only until the
Human defines it.

## Discovery evidence

- Workflow builders: `src/workflows/build-marketing-pipeline.ts`, `src/workflows/build-call-agent.ts`
- Generated workflow JSONs: `integrations/marketing-pipelines/marketing-pipeline-main.json`, `integrations/marketing-pipelines/call-agent.json`
- Workflow verification scripts: `scripts/build-workflows.ts`, `scripts/build-workflows-check.ts`, `scripts/deploy-workflows.ts`
- Architectural decisions: 001 (Happy Path with n8n Orchestration), 004 (Staged Content Quality Workflow)

## When to use

<Ask the Human: when should an agent reach for this skill?>

## Conventions

<Ask the Human: what did they decide for n8n workflows — naming, layout, its own rules?>

## What to avoid

<Ask the Human: what should this skill refuse, or never do?>

## How to verify

<Ask the Human: what command or read confirms this skill did its job?>
