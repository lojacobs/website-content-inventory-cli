# Questions Log — bootstrap-and-crawler

## full-content-inventory-integrated-3ck
**Title:** Non-domain crawl modes dump all URLs into same directory — missing domain segregation  
**Date:** 2026-04-23  
**Disposition:** Bug — create task

**Analysis:**  
In `page` and `list` mode, the `domain` variable in `crawl()` is never set (it remains `''`). This causes all output files to land in `{outputDir}/{client}_{project}/` with no subdirectory separation. When a user passes URLs from different domains in `list` mode, filename collisions will occur (e.g., two pages both at `/about` → both write `about.txt`, second overwrites first).

This is not intentional — domain-based directory segregation is clearly the design intent (evidenced by `domain` mode doing it correctly). The flat-directory fallback is a gap, not a feature.

**Fix:** In `processPage()`, derive domain from the URL being processed rather than the `domain` parameter passed from `crawl()`:
```ts
const urlDomain = new URL(url).hostname;
const domainDir = join(outputDir, `${client}_${project}`, urlDomain);
```

**Action:** Created task `full-content-inventory-integrated-3ck` (bug, bootstrap-and-crawler) to implement the fix.
