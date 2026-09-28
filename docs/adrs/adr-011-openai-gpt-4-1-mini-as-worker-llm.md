---
type: adr
title: OpenAI gpt-4.1-mini as Worker LLM
description: All staged agents run on OpenAI gpt-4.1-mini after the Gemini 2.5 Flash path failed.
status: stable
---

# OpenAI gpt-4.1-mini as Worker LLM

## Context

The first worker LLM choice (003) was Google Gemini 2.5 Flash through the n8n
Gemini node. That path failed in practice. OpenAI `gpt-4.1-mini` through the
n8n OpenAI Chat Model node was the second attempt, and it worked.

## Decision

Use OpenAI `gpt-4.1-mini` as the worker LLM for every staged agent:

- `DEFAULT_PROVIDER = "openai"` and `DEFAULT_MODEL = "gpt-4.1-mini"` in
  `src/call-agent/logic.ts`.
- The staged agent configs under `agents/` declare
  `"provider": "openai"`, `"model": "gpt-4.1-mini"`.
- The Call Agent `Route Provider` node sends `openai`, and the legacy
  `google` value, to the OpenAI node, rewriting any `gemini*` model name to
  the default model; any other provider goes to `Unsupported Provider Error`.

## Consequences

- Changing the model within OpenAI is an agent-config edit; the workflow does
  not change.
- Adding another provider needs a new `Route Provider` branch and model node
  in `src/workflows/build-call-agent.ts`, not only an agent-config edit.
- The legacy `google` routing stays so older configs keep running on the
  default model.
