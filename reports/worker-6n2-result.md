# Task full-content-inventory-integrated-6n2 — Result

## Status: ✅ All acceptance criteria met

Both build commands exit 0.

---

## Changes made

### `src/packages/crawler/src/discover.ts`

**New exported members:**
- `extractLinks(html, base)` — shared link-extraction helper reused by both BFS
  implementations. Returns deduplicated absolute HTTP(S) URLs parsed from `<a href>`
  elements.
- `deriveFolderPrefix(seedUrl)` — derives the path prefix per the spec rules:
  - URL ending with `/` → use as-is
  - Last path segment contains a dot (e.g. `page.html`) → strip it, return parent dir
  - No trailing slash, no extension (e.g. `/section`) → append `/`
  - Always returns a prefix starting and ending with `/`
- `discoverFolderUrls(seedUrl, options)` — exported async function; calls
  `bfsFolderCrawl` with the derived prefix.
- `bfsFolderCrawl(seedUrl, seedHostname, folderPrefix, options)` — BFS that
  enqueues only same-hostname links whose `pathname.startsWith(folderPrefix)`.

**Refactored:**
- `bfsCrawl` (domain-wide BFS) now uses `extractLinks` instead of duplicating the
  cheerio link-parsing logic inline.

### `src/packages/crawler/src/crawl.ts`

- Added `discoverFolderUrls` to the import from `"./discover.js"`.
- Replaced the `mode === "folder"` stub with a working implementation:
  - Validates that `urls.length > 0`, else exits with error.
  - Derives `domain` from `new URL(urls[0]).hostname`.
  - Calls `discoverFolderUrls(urls[0], { userAgent, timeout })`.
  - Assigns returned URLs to `urlsToCrawl`.
  - Logs `[crawl] folder mode: discovered N URL(s)`.

---

## Acceptance criteria checklist

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `discoverFolderUrls` exported from `discover.ts` | ✅ |
| 2 | `https://example.com/espace-citoyen/page.html` → prefix `/espace-citoyen/` | ✅ |
| 3 | `https://example.com/espace-citoyen/` → prefix `/espace-citoyen/` | ✅ |
| 4 | `https://example.com/section` → prefix `/section/` | ✅ |
| 5 | Cross-domain links never enqueued | ✅ (hostname check) |
| 6 | `crawl()` calls `discoverFolderUrls()` when `mode='folder'` | ✅ |
| 7 | `pnpm --filter @full-content-inventory/crawler build` exits 0 | ✅ |
