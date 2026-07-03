# Content Quality Pipeline — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Update ClickUp staged statuses and field mapping | completed | medium | — |
| 02 | Document staged ClickUp operator workflow | completed | low | task_01 |
| 03 | Add stage definitions and status mapping helpers | completed | medium | task_01 |
| 04 | Add stage output types and parser validation | completed | medium | task_03 |
| 05 | Extend agent config types for references | completed | medium | task_04 |
| 06 | Add GitHub reference path loading helpers | completed | medium | task_05 |
| 07 | Update Call Agent prompt assembly for skills plus references | completed | medium | task_06 |
| 08 | Create investigative brief agent package | completed | medium | task_07 |
| 09 | Create long-form argument agent package | completed | medium | task_07 |
| 10 | Trim LinkedIn format package for final adaptation | completed | medium | task_07 |
| 11 | Add ClickUp Doc pointer extraction and validation | completed | medium | task_01, task_03 |
| 12 | Add ClickUp Doc/page create and replace helpers | completed | medium | task_11 |
| 13 | Assemble stage input from task fields, Doc pages, and comments | completed | medium | task_04, task_12 |
| 14 | Filter actionable lead feedback and AI pointer comments | completed | low | task_13 |
| 15 | Replace old ingress checks with staged AI status detection | completed | medium | task_03 |
| 16 | Route each staged ingress to the correct agent and stage metadata | completed | medium | task_15, task_13 |
| 17 | Handle successful stage outputs with Doc write and pointer comment | completed | medium | task_16, task_12 |
| 18 | Handle blocker outputs with blocker comment and previous-gate return | completed | medium | task_16 |
| 19 | Update generated marketing workflow topology tests | completed | medium | task_17, task_18 |
| 20 | Update Call Agent workflow tests and code-equivalence checks | completed | medium | task_07 |
| 21 | Update local content-quality proof script for staged assumptions | completed | medium | task_19, task_20 |
| 22 | Add live proof follow-up task and rollout readiness notes | completed | low | task_21 |
| 23 | Live proof of staged content quality pipeline and rollout readiness validation | completed | high | task_22 |
| 24 | Add ClickUp task-tag client support and stage tag constants | completed | medium | task_23 |
| 25 | Remove legacy single-agent ingress helper surface | completed | medium | task_23 |
| 26 | Rebuild Marketing Pipeline as staged-only topology | completed | medium | task_25 |
| 27 | Add best-effort n8n tag helper code nodes | completed | medium | task_24 |
| 28 | Wire AI activity tag lifecycle into staged workflow | completed | medium | task_26, task_27 |
| 29 | Enforce green-run ready/unverified exit-code contract | completed | medium | task_23 |
| 30 | Enforce content-quality proof failure exit-code contract | completed | medium | task_23 |
| 31 | Update staged-only rollout and webhook documentation | completed | medium | task_26, task_28, task_29, task_30 |
| 32 | Generate staged Call Agent prompt examples from output_schema | completed | medium | task_31 |
| 33 | Switch generated Call Agent parsing to the staged-aware dispatcher | pending | low | task_32 |
| 34 | Harden staged Call Agent contract parity fixtures | pending | medium | task_33 |
| 35 | Persist and normalize the Editorial Doc pointer before page work | pending | medium | task_31 |
| 36 | Fail closed on missing staged artifact content before Doc writes | pending | medium | task_33 |
| 37 | Regenerate workflows and assert strict staged Doc topology | pending | medium | task_33, task_35, task_36 |
| 38 | Run ADR-011 live proof for one-Doc reuse and non-placeholder pages | pending | high | task_37 |
