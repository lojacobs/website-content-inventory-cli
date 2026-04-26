# Security Review Log

> Append-only. One section per module security review.
> Written by the Orchestrator after the security-reviewer subagent completes.
> Read and resolved by the Planner at the next planning session.

---

## Module: gw-sync — 2026-04-24
**Triggered by:** full-content-inventory-integrated-c1p
**Findings:**
- [Medium] full-content-inventory-integrated-3ze: Path traversal in sync.ts urlToTxtPath — unsanitized URL pathname segments
**Verified (no issue):**
- No hardcoded credentials or secrets in gw-sync source files
- All execa invocations use array arguments (no shell string construction)
- `.sync-meta.json` is listed in `.gitignore`
- `DriveFileBody` has no duplicate definitions (single source in types.ts)
- `replaceImagesInDoc` remains a no-op stub per INV-05
- No eval() or child_process usage
**Disposition:** ACTIONABLE — hardening task created (full-content-inventory-integrated-3k8). The WHATWG URL parser normalizes `..` segments for URLs with valid authority, so the practical risk is low. However, `urlToTxtPath` has no explicit boundary guard; defense-in-depth requires (a) filtering `..` and `.` segments in `urlToTxtPath` and (b) asserting the resolved path stays within `invDir` before reading the file.

---

## Module: gw-sync — 2026-04-26
**Follow-up:** full-content-inventory-integrated-3k8 implemented and validated.
**Changes made:**
- `urlToTxtPath()` now applies bounded iterative `decodeURIComponent` (max 3 passes) to handle percent-encoded and double-encoded `.` / `..` segments, then filters them out.
- `assertPathWithinDir()` added — validates `resolve(invDir, path)` stays within `invDir` before every `readFile()` call in `sync()`.
- Symlink/TOCTOU consideration documented in code comment (acceptable per current threat model).
- Test coverage added for: literal `..`/`.`, single-encoded `%2e%2e`/`%2e`, double-encoded `%252e%252e`.
**Build & test:** `pnpm build` exits 0; `pnpm test` 28/28 pass.
**3ze status:** Fully resolved. Previously closed with "logged in reports/security.md"; now hardened in code.

<!-- Template for each review:

## Module: {module-name} — {YYYY-MM-DD}
**Triggered by:** {sentinel-task-id}
**Findings:**
- [Critical|High|Medium|Low] {chore-id}: {finding title}
**Disposition:** pending Planner review

-->
