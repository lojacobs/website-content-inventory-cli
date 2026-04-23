# Fix missing domain segregation in page/list crawl modes

**Task ID:** full-content-inventory-integrated-20n  
**File edited:** `src/packages/crawler/src/crawl.ts`

## Problem

In `crawl()`, the `domain` variable was only set when `mode === "domain"`. For `page` and `list` modes, it stayed as an empty string `""`. This empty string was passed through to `processPage()`, so all output files landed in `{outputDir}/{client}_{project}/` with no hostname subdirectory. When crawling two domains in `list` mode, both would write `/about/about.txt`, causing the second to overwrite the first.

## Fix

Inside `processPage()`, the hostname is now extracted directly from the `url` argument using `new URL(url).hostname`. The original `domain` parameter is retained (renamed to `_domain`) for backward compatibility but is no longer used. It only serves as a fallback for malformed URLs.

### Changes to `processPage` signature

- Parameter `domain` renamed to `_domain` (underscore prefix signals unused)
- JSDoc `@param domain` updated to `@param _domain`

### New hostname derivation block

```typescript
// Derive the domain (hostname) from the URL being processed.
// This ensures correct segregation for page and list modes where the
// caller passed an empty domain string.
const pageDomain = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return _domain || "unknown";
  }
})();

// Construct the full output directory for this domain
const domainDir = join(outputDir, `${client}_${project}`, pageDomain);
```

### Domain mode behavior

Unchanged. For `mode === "domain"`, `domain` is set to the seed URL's hostname in `crawl()` and passed to `processPage()`. `pageDomain` extracts the same value from the URL anyway, so both paths produce identical `domainDir`.

## Acceptance criteria — verified

| Criterion | Status |
|---|---|
| page/list mode files land in `{outputDir}/{client}_{project}/{hostname}/` | ✅ hostname derived from each URL |
| multi-domain list crawl produces no collisions | ✅ each domain gets its own subdirectory |

## Build result

```
> tsc --build
# (no errors)
```