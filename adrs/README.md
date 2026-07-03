# Architecture Decision Records

Durable architectural decisions for this repo. Promoted here (and renumbered into one
sequence) from internal planning history so future maintainers have a stable, versioned
place to find them — see [ADR-002](adr-002.md) for why agent runtime config lives in this
repo, [ADR-004](adr-004.md) for why the pipeline is staged, etc.

| ADR | Title | Status |
|-----|-------|--------|
| [001](adr-001.md) | V1 Scope — Happy Path with n8n Orchestration | Superseded by [ADR-004](adr-004.md) (staged pipeline); idempotency-deferral rationale still applies |
| [002](adr-002.md) | Agent Config Colocated in agentic-mkt | Accepted |
| [003](adr-003.md) | Gemini 2.5 Flash as Worker LLM | Superseded — provider is now `openai` / `gpt-4.1-mini` |
| [004](adr-004.md) | Replace Single-Agent Marketing Flow with Staged Content Quality Workflow | Accepted |
| [005](adr-005.md) | Use Local-First Verification with Live Proof as a Follow-Up Task | Accepted |
| [006](adr-006.md) | Use Stage-Aware Agent Contracts and Reference Files | Accepted |
| [007](adr-007.md) | Tag-Based AI Activity Signaling for Staged Columns | Accepted |
| [008](adr-008.md) | Enforce Exit-Code Contract for Proof and Green-Run Scripts | Accepted |
| [009](adr-009.md) | Strict Staged Output and Early Editorial Doc Pointer Persistence | Accepted |
