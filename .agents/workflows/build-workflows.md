---
description: Regenerate and verify n8n marketing pipeline workflows from TypeScript builders
---

# Build Workflows

Compile TypeScript workflow builders and verify generated JSON consistency.

1. Ensure all Code node JavaScript logic lives in `src/workflows/*/code-nodes/*.js`.
2. Lint Code node JavaScript:
   ```bash
   pnpm lint:code-nodes
   ```
3. Regenerate workflow JSON files in `integrations/marketing-pipelines/`:
   ```bash
   pnpm build:workflows
   ```
4. Verify bitwise stability:
   ```bash
   pnpm build:workflows:check
   ```
