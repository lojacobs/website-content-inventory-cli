# Worker 6n2 Retry — Result

## Bug Fixed

File: `src/packages/crawler/src/discover.ts`  
Function: `discoverFolderUrls`

**Root cause:** The first argument to `bfsFolderCrawl` was `seed.hostname` (a bare hostname string like `"example.com"`), but `bfsFolderCrawl` expects the full starting URL as its first argument — otherwise `downloadPage` cannot fetch it (no protocol).

**Fix applied:**
```ts
// Before (broken)
return bfsFolderCrawl(seed.hostname, seed.hostname, folderPrefix, options);

// After (fixed)
return bfsFolderCrawl(seedUrl, seed.hostname, folderPrefix, options);
```

## Verification

- `pnpm --filter @full-content-inventory/crawler build` → **passed**
- `pnpm --filter @full-content-inventory/crawler exec tsc --noEmit` → **passed**

## Status: ✅ Complete
