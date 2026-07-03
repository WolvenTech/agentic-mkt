# Repository Guidelines

## Project Structure & Module Organization

This repository is a configuration-first home for Wolven's agentic marketing pipeline, not an application server. Source code lives in `src/`, with workflow builders in `src/workflows/`, ClickUp clients and validation in `src/clickup/`, n8n integration in `src/n8n/`, and agent logic in `src/call-agent/` and `src/marketing-pipeline/`. CLI entrypoints live in `scripts/`. Tests live in `tests/`. Runtime agent configs and skills are under `agents/`, harness contracts under `agents/harness/`, ClickUp schema fixtures under `clickup/`, and generated n8n workflow exports under `marketing-pipelines/`.

## Build, Test, and Development Commands

- `pnpm test`: run offline Vitest unit tests.
- `pnpm test:watch`: run unit tests in watch mode.
- `pnpm test:coverage`: run unit tests with V8 coverage.
- `pnpm vendor:gate`: verify ClickUp and n8n credentials/connectivity before live work.
- `pnpm test:live`: run gated live integration tests.
- `pnpm build:workflows`: regenerate `marketing-pipelines/*.json` from TypeScript builders.
- `pnpm build:workflows:check`: verify committed workflow JSON matches generated output.
- `pnpm deploy:workflows`: deploy generated workflows to live n8n.

Use Node.js 20+ and pnpm 11.5.1. Copy `.env.example` to `.env` for live scripts.

## Coding Style & Naming Conventions

Use TypeScript ESM with strict compiler settings. Prefer 2-space indentation, double quotes, named exports, and explicit domain types in `src/types/`. Keep script files action-oriented, for example `scripts/build-workflows.ts`. Test files use `*.test.ts`; live tests use `*.live.test.ts`. Do not hand-edit `marketing-pipelines/*.json` after builder changes; edit `src/workflows/*` and run `pnpm build:workflows`.

## Testing Guidelines

Vitest has separate `unit` and `live` projects. Unit tests must remain offline-safe and exclude live vendor access. Coverage targets are 80% for lines, statements, functions, and branches across `src/**/*.ts`. Add or update focused tests when changing clients, workflow generation, contracts, or CLI scripts.

## Commit & Pull Request Guidelines

Recent commits use concise imperative summaries, sometimes with a conventional prefix such as `chore:`. Keep commits focused on one behavioral or documentation change. PRs should describe the workflow or contract impact, list verification commands run, and call out any live n8n or ClickUp validation. Include generated workflow diffs only after running `pnpm build:workflows:check`.

## Security & Configuration Tips

Never commit `.env`, credentials, run logs, or live-only n8n bindings. Run `pnpm vendor:gate` before scripts that touch ClickUp or n8n. Keep `logs/` ephemeral unless promoting verified evidence into committed harness documentation.
