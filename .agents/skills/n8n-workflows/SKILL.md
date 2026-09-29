---
name: n8n-workflows
description: Author, build, and verify n8n workflows from TypeScript builders in src/workflows/ without hand-editing generated JSON. Use when modifying marketing pipeline stages, adding or updating workflow Code nodes, or validating pipeline integrity.
---

# n8n-workflows

Author, build, test, and deploy n8n workflows using the TypeScript builder pattern.

## Overview

In this repository, n8n workflow JSON files (`integrations/marketing-pipelines/*.json`) are **strictly generated, read-only artifacts**. They must never be edited by hand.

All workflow topology, parameters, expressions, and node wiring are authored in TypeScript builders under `src/workflows/`. Code node runtime JavaScript is extracted into standalone `.js` files under `src/workflows/*/code-nodes/` to enable isolated linting, syntax checking, and unit testing.

## When to use

Use this skill when:
- Creating a new n8n workflow or altering an existing pipeline topology.
- Modifying node parameters, routing expressions, or webhook configurations.
- Adding, refactoring, or testing Code node runtime JavaScript.
- Regenerating `integrations/marketing-pipelines/*.json` and verifying bitwise consistency.
- Preparing workflow changes for deployment to a live n8n instance.

## Workflow Builder Pattern

1. **Locate or Create Builder**:
   - Main pipeline builder: `src/workflows/build-marketing-pipeline.ts`
   - Call agent builder: `src/workflows/build-call-agent.ts`
2. **Code Node Extraction**:
   - Place runtime JavaScript for Code nodes in dedicated files (e.g. `src/workflows/marketing-pipeline/code-nodes/<node-name>.js`).
   - Reference them in the builder using `fs.readFileSync` or imported strings.
   - Run `pnpm lint:code-nodes` to ensure ESLint passes on all Code node scripts.
3. **Regenerate Workflows**:
   - Run `pnpm build:workflows` to compile TypeScript builders and write output JSON to `integrations/marketing-pipelines/`.
4. **Validate Bitwise Consistency**:
   - Run `pnpm build:workflows:check` to ensure committed JSON files match the builder output exactly. CI enforces this on every commit.

## Deployment & Safety

- Live deployment pushes generated workflows to the live n8n endpoint via `pnpm deploy:workflows`.
- **Mandatory Vendor Gate**: Live deployment must always be preceded by `pnpm vendor:gate`. The script verifies that `N8N_API_KEY` and connectivity are healthy before any push occurs.
- Never edit live workflows directly in the n8n UI without backporting changes to TypeScript builders.

## What to avoid

- **NEVER hand-edit `.json` files** in `integrations/marketing-pipelines/`.
- **NEVER inline complex JavaScript strings** directly in builders without creating a separate `.js` file under `code-nodes/`.
- **NEVER deploy without passing `pnpm build:workflows:check` and `pnpm vendor:gate`**.

## How to verify

```bash
# 1. Lint Code node JavaScript
pnpm lint:code-nodes

# 2. Rebuild and check generated JSON consistency
pnpm build:workflows
pnpm build:workflows:check

# 3. Run full test suite including workflow contract tests
pnpm test
```
