# Task 74i Result: Implement sync.ts — orchestration, tree builder, marker parser

## Summary
Successfully implemented `sync.ts` and fixed the shared package dependencies.

## Changes Made

### 1. `src/packages/shared/src/types.ts`
Added three optional status fields to `InventoryRow` interface:
- `crawl_status?: string` — 'done' | 'error' | undefined
- `sync_status?: string` — 'done' | 'error' | undefined  
- `ai_status?: string` — 'done' | 'error' | undefined

Also extended `InventoryColumn` union type to include:
- `'crawl_status'`, `'sync_status'`, `'ai_status'`

### 2. `src/packages/shared/src/constants.ts`
Added three new columns to `INVENTORY_COLUMNS` array:
- `'crawl_status'`
- `'sync_status'`
- `'ai_status'`

### 3. `src/packages/gws-sync/src/sync.ts` (NEW FILE)
Created the orchestration module with the following exports:

#### `buildFolderTree(rows: InventoryRow[]): FolderNode[]`
- Groups `InventoryRow` by directory path derived from URL pathname
- Returns a `FolderNode[]` forest reflecting the local folder hierarchy
- Example: `/a/b/page.html` and `/a/c/page.html` produce:
  ```
  [{ name: 'a', children: [{ name: 'b' }, { name: 'c' }] }]
  ```

#### `parseImageMarkers(text: string): ImageMarker[]`
- Extracts all `[IMAGE: alt | src]` patterns using global regex
- Returns `ImageMarker[]` with `alt`, `src`, and `fullMatch` fields
- Returns empty array if no markers found

#### `replaceImagesInDoc(docId: string, markers: ImageMarker[]): Promise<void>`
- No-op stub as per architecture invariant INV-05
- Returns `Promise.resolve()` immediately

#### `sync(config: SyncConfig): Promise<void>`
Main orchestrator that:
1. Reads `_inventory.csv` via `readInventory()`
2. Filters to rows with `crawl_status === 'done'`
3. Skips rows with `sync_status === 'done'` when `resume !== false`
4. Builds folder tree with `buildFolderTree()`
5. Mirrors folders in Drive via `ensureDriveFolder()`
6. For each qualifying row:
   - Reads corresponding `.txt` file
   - Parses image markers
   - Uploads as Google Doc
   - Calls `replaceImagesInDoc()` (no-op)
   - Updates row with `sync_status` and `Lien_Google_Doc`
   - Writes inventory to disk after each row
7. Handles inventory-as-Sheet upload:
   - Reads `.sync-meta.json`
   - Calls `updateSheet()` if `sheetsId` exists, else `uploadAsSheet()`
   - Persists returned `sheetsId` to `.sync-meta.json`

### 4. `src/packages/gws-sync/package.json`
Added `@types/node` as devDependency to support Node.js type definitions.

## Build Verification
```
cd src/packages/gws-sync && pnpm build
```
✅ Exit code 0 — TypeScript compilation successful

## Acceptance Criteria Verification

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `buildFolderTree()` groups rows by directory path | ✅ |
| 2 | `parseImageMarkers()` extracts `[IMAGE: alt \| src]` patterns | ✅ |
| 3 | `sync()` filters by `crawl_status=done`, respects `resume` flag | ✅ |
| 4 | `sync()` calls `writeInventory` after each row with status | ✅ |
| 5 | `sync()` handles sheet upload and persists `sheetsId` | ✅ |
| 6 | `replaceImagesInDoc` is a no-op stub | ✅ |
| 7 | `pnpm build` exits 0 | ✅ |

## Diff Summary

### `src/packages/shared/src/types.ts`
```diff
   Lien_dossier_Drive: string;
+  crawl_status?: string;
+  sync_status?: string;
+  ai_status?: string;
 }

 export type InventoryColumn =
   | 'Lien_dossier_Drive'
+  | 'crawl_status'
+  | 'sync_status'
+  | 'ai_status';
```

### `src/packages/shared/src/constants.ts`
```diff
   'Lien_dossier_Drive',
+  'crawl_status',
+  'sync_status',
+  'ai_status',
```

### `src/packages/gws-sync/src/sync.ts` (NEW - 265 lines)
Full implementation with 4 exported functions:
- `buildFolderTree()` — 65 lines
- `parseImageMarkers()` — 18 lines  
- `replaceImagesInDoc()` — 7 lines (stub)
- `sync()` — 140 lines (main orchestrator)
