# Questions Log — gw-sync

## full-content-inventory-integrated-3ub
**Title:** Shared InventoryRow missing status columns (crawl_status, sync_status, ai_status)
**Date:** 2026-04-24
**Disposition:** RESOLVED — no new task required

**Analysis:**
Verified `src/packages/shared/src/types.ts` and `src/packages/shared/src/constants.ts`. All three columns (`crawl_status`, `sync_status`, `ai_status`) are present as optional `string` fields in `InventoryRow` and as entries in `INVENTORY_COLUMNS`. The fix was applied inline by worker integrated-74i during sync.ts implementation. The Orchestrator's note is accurate — the concern is already addressed.

---

## full-content-inventory-integrated-wfr
**Title:** Orchestrator self-correction: sync.ts urlToTxtPath fix was applied by Orchestrator instead of worker
**Date:** 2026-04-24
**Disposition:** DISMISSED — process note only, no deliverable required

**Analysis:**
This is a process observation, not a functional or security defect. The Orchestrator corrected `urlToTxtPath` to use the full relative path instead of just the basename. The resulting code is correct. The process violation (editing code during verification instead of rejecting and retrying) is noted for pattern tracking, but no rework is needed and no new task is warranted. The mitigation is already documented in the chore notes: "Reject worker output and retry, never edit code during verification."
