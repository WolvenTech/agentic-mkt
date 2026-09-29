---
description: Validate entire repo — offline unit tests, workflow builders, ClickUp verification, and harness claims
---

# Validate

Run the authoritative validation suite for the repository.

1. Read `AGENTS.md` Deterministic Command Matrix.
2. Run offline validation suite:
   ```bash
   pnpm validate
   ```
3. Run bitwise workflow builder checks:
   ```bash
   pnpm build:workflows:check
   ```
4. If working with live systems and credentials are configured in `.env`:
   ```bash
   pnpm vendor:gate
   ```
