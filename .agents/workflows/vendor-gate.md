---
description: Preflight vendor connectivity and credentials for ClickUp and n8n before live operations
---

# Vendor Gate

Check ClickUp and n8n environment variables and API reachability.

1. Confirm `.env` has `CLICKUP_API_TOKEN`, `CLICKUP_LIST_ID`, and `N8N_API_KEY`.
2. Run the gate:
   ```bash
   pnpm vendor:gate
   ```
3. Exit codes:
   - `0`: Healthy. Safe to proceed with live operations (`pnpm test:live`, `pnpm deploy:workflows`, `pnpm clickup:sync`).
   - `1`: Missing credentials in environment.
   - `2`: Network or authentication failure reaching vendor APIs.
