# `@full-content-inventory/gws-sync`

Google Workspace sync module. Uploads crawled `.txt` files as Google Docs, creates the mirrored folder structure in Google Drive, and syncs the `_inventory.csv` as a Google Sheet.

---

## What it does

`gws-sync` is the **second step** in the Full Content Inventory pipeline (after crawling, before or in parallel with AI summarization). It reads the local `_inventory.csv` and:

1. **Builds a folder tree** from the URL path structure.
2. **Mirrors that tree in Google Drive** under a user-specified root folder.
3. **Uploads each `.txt` file as a Google Doc** in the corresponding Drive folder.
4. **Uploads binary assets** (PDFs, images, etc.) directly to Drive.
5. **Syncs `_inventory.csv` as a Google Sheet** — creates on first run, updates on subsequent runs.
6. **Writes `sync_status=done`** and the Google Doc link (`Lien_Google_Doc`) back to each row.
7. **Persists metadata** in `.sync-meta.json` to track the Sheet ID across runs.

Per-row errors are caught, `sync_status=error` is written, and the pipeline **continues**.

---

## Prerequisites

- **Node.js 20+** and `pnpm`.
- **Google Workspace CLI (`gws`)** installed and authenticated.
- **Google Drive folder ID** where the synced content should live.
- **Crawler output** — `_inventory.csv` with `crawl_status=done` and matching `.txt` files.

---

## Installation

From the monorepo root:
```bash
cd src && pnpm install
pnpm -r run build
```

The CLI is available at:
```bash
node src/packages/gws-sync/dist/cli.js --help
```

---

## Usage

### Basic sync (resume mode — skips rows already `sync_status=done`)
```bash
node src/packages/gws-sync/dist/cli.js \
  --inventory /path/to/output/client_project/example.com/_inventory.csv \
  --folder-id 1aBcD1234...
```

### Force re-sync of all rows
```bash
node src/packages/gws-sync/dist/cli.js \
  --inventory /path/to/output/client_project/example.com/_inventory.csv \
  --folder-id 1aBcD1234... \
  --no-resume
```

### CLI reference

| Flag | Required | Description |
|------|----------|-------------|
| `--inventory <path>` | **Yes** | Path to `_inventory.csv` |
| `--folder-id <driveId>` | **Yes** | Google Drive folder ID (root for this project) |
| `--no-resume` | No | Re-sync rows even if `sync_status=done` |

---

## Directory layout assumptions

The sync module expects the **crawler's output structure**:

```
output/
└── client_project/
    └── example.com/
        ├── _inventory.csv          ← pass this to --inventory
        ├── homepage.txt
        ├── about.txt
        ├── services/
        │   └── consulting.txt
        └── ...
```

`.txt` paths are resolved relative to the CSV's parent directory. The URL path structure is mirrored as Google Drive folders.

---

## Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| INV-01 | Only rows with `crawl_status=done` are processed | Pre-filter before the sync loop |
| INV-02 | Resume is the default behavior | `sync_status=done` causes skip on next run |
| INV-03 | Path traversal is blocked | `assertPathWithinDir()` validates resolved `.txt` paths stay within the inventory directory |
| INV-04 | Folder tree mirrors URL path structure | `buildFolderTree()` groups rows by pathname segments |
| INV-05 | Image replacement in Docs is a no-op stub | `replaceImagesInDoc()` resolves immediately (future enhancement) |
| INV-06 | `.sync-meta.json` tracks the Sheet ID | Written after every successful Sheet upload/update |

---

## The Happy Path

1. **Crawl completes** → `_inventory.csv` has rows with `crawl_status=done` and `.txt` files exist.
2. **Google Workspace CLI is authenticated** → `gws` commands work.
3. **Run the sync** with `--inventory` and `--folder-id`.
4. **For each qualifying row:**
   - Drive folder is created/ensured for the URL's path.
   - `.txt` is uploaded as a Google Doc in the correct folder.
   - `sync_status` = `done`, `Lien_Google_Doc` = Doc ID.
   - CSV is flushed immediately.
5. **`_inventory.csv` is uploaded/updated as a Google Sheet** in the root Drive folder.
6. **`.sync-meta.json` is written** with the Sheet ID for future resume.

---

## Troubleshooting & workarounds

### `gws command not found`
**Cause:** The Google Workspace CLI is not installed or not on `PATH`.  
**Fix:** Install `gws` via the [official instructions](https://github.com/googleworkspace/cli) and run `gws auth login`.

### `Failed to parse .sync-meta.json`
**Cause:** The `.sync-meta.json` file is corrupted.  
**Fix:** Delete `.sync-meta.json` in the inventory directory. The next run will create a fresh Sheet.

### `SheetNotFoundError: Recorded sheetsId no longer exists`
**Cause:** The previously synced Google Sheet was deleted or moved.  
**Fix:** Delete `.sync-meta.json` and re-run. A new Sheet will be created and linked.

### `Path traversal blocked`
**Cause:** A URL's `urlToFilename()` resolved to a path outside the inventory directory.  
**Fix:** Check the URL for unusual path segments. The crawler's `urlToFilename()` filters `.` and `..`, but edge cases may slip through.

### Some rows have `sync_status=error`
**Cause:** A per-row failure (network timeout, Drive API rate limit, missing `.txt`).  
**Fix:** Check the console error for the specific row. Resolve the issue (e.g., re-run crawl for missing `.txt`), then use `--no-resume` to retry.

### Google Docs are created but not in the right folders
**Cause:** The folder tree mapping didn't match the URL structure.  
**Fix:** Verify the URL path segments in the inventory. `buildFolderTree()` uses the pathname minus the filename; unusual URL structures may need manual review.

### Binary assets not uploading
**Cause:** The asset URL is unreachable or the MIME type is unrecognized.  
**Fix:** Check `isBinaryAsset()` in `@full-content-inventory/shared`. Supported types are based on file extension. Ensure the URL has a recognized extension.

### Rate limiting from Google Drive API
**Cause:** Too many files uploaded in a short time.  
**Workaround:** The sync processes rows sequentially with no built-in delay. For very large inventories, consider splitting into batches or adding a delay between runs.

### `Lien_Google_Doc` column is empty after sync
**Cause:** The row was skipped due to resume mode, or the upload failed silently.  
**Fix:** Check `sync_status`. If `done` but no link, the upload may have succeeded but the response was malformed. Run with `--no-resume` to re-process.
