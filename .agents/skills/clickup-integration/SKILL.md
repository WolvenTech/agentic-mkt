---
name: clickup-integration
description: Manage ClickUp task lifecycles, single-Doc editorial hierarchies, and tag transitions through validated API clients. Use when implementing or testing ClickUp task operations, updating editorial doc pages (Brief/Argument/Final Draft), or syncing custom field schemas.
---

# clickup-integration

Interact with ClickUp tasks, custom fields, and Docs safely through validated clients and operational contracts.

## Overview

This repository orchestrates marketing pipelines that interface directly with ClickUp. All mutations must adhere to established architectural decisions:
- **ADR-007 (Tag-Based AI Activity Signaling)**: Manage tags `agent-working` during processing and `agent-blocked` when requiring human input.
- **ADR-009 (Editorial Doc Pointer Persistence)**: Maintain a single per-task Editorial Doc containing three sub-pages (`Brief`, `Argument`, and `Final Draft`), storing the Doc URL in the `Editorial Doc Url` custom field.
- **Schema Contracts**: Custom field schemas are governed by `integrations/clickup/field-mapping.json`, kept synchronized with the live workspace via `pnpm clickup:sync`.

## When to use

Use this skill when:
- Reading or updating ClickUp task statuses, custom fields, or tags.
- Creating or editing task Editorial Docs and their child pages (`Brief`, `Argument`, `Final Draft`).
- Syncing or verifying ClickUp custom field definitions against `integrations/clickup/field-mapping.json`.
- Debugging ClickUp webhook payloads and signature verification.
- Writing unit or integration tests for ClickUp API clients and helpers.

## Conventions & Rules

1. **Use Approved Client Abstractions**:
   - Always use `src/clickup/client.ts` for task and list operations.
   - Always use `src/clickup/docs-helpers.ts` for Editorial Doc lifecycle (checking existing doc pointer, creating doc/pages, updating content).
2. **Tag Lifecycle (ADR-007)**:
   - When an agent starts processing a task: add tag `agent-working`.
   - When an agent finishes successfully: remove tag `agent-working`.
   - When an agent encounters a blocker or gate requiring human review: remove `agent-working` and add `agent-blocked`.
3. **Single Editorial Doc Pattern (ADR-009)**:
   - Do NOT create multiple loose Docs per task.
   - Check `Editorial Doc Url` custom field first. If present, update existing pages. If absent, create one task Doc with `Brief`, `Argument`, and `Final Draft` pages, then persist the Doc URL into `Editorial Doc Url`.
4. **Field Mapping Contract**:
   - Never hand-edit `integrations/clickup/field-mapping.json`.
   - Synchronize schema using `pnpm clickup:sync` and verify with `pnpm clickup:verify`.
5. **Vendor Gating & Safety**:
   - Live mutations require `pnpm vendor:gate` passing with exit code 0 (`CLICKUP_API_TOKEN` configured and reachable).
   - **Log Redaction**: Never write raw ClickUp task payloads, document contents, or API credentials to logs. Persist only task IDs, Doc IDs, and structured status summaries.

## What to avoid

- **NEVER bypass `vendor-gate`** before live ClickUp mutations.
- **NEVER log raw task bodies, prompt text, or authentication tokens**.
- **NEVER create loose unlinked ClickUp Docs** outside the single-Doc editorial structure.
- **NEVER hand-edit custom field IDs** in `integrations/clickup/field-mapping.json`.

## How to verify

```bash
# 1. Run offline unit tests for ClickUp client and helpers
pnpm test src/clickup/

# 2. Verify ClickUp field mapping contract and schema integrity
pnpm clickup:verify

# 3. Test vendor gate connectivity (live environment required)
pnpm vendor:gate
```
