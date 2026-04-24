# Specs — gw-sync

## Module Purpose

`@fci/gws-sync` mirrors a local content-inventory output directory into Google Drive: folder trees become Drive folders, `.txt` files become Google Docs, and `_inventory.csv` becomes a Google Sheet — with full per-row crash-resume support via the `sync_status` column.

## Functional Requirements

1. The system shall accept `--inventory <path>` and `--folder-id <driveId>` as required CLI flags via `fci-sync`.
2. The system shall read `_inventory.csv` using `@fci/shared.readInventory()` and process only rows where `crawl_status=done`.
3. The system shall reconstruct the local directory hierarchy as Drive folders using idempotent find-or-create logic (`ensureDriveFolder()`).
4. The system shall upload each qualifying `.txt` file as a Google Doc by invoking `gws drive files create --upload <path> --upload-content-type text/plain` with the appropriate MIME type conversion.
5. The system shall parse `[IMAGE: alt | src]` markers in `.txt` files into `ImageMarker` objects; image insertion into the resulting Doc is deferred (no-op stub).
6. The system shall write `_inventory.csv` to disk after processing each row, setting `sync_status=done` on success or `sync_status=error` on failure, before proceeding to the next row.
7. The system shall skip rows where `sync_status=done` on subsequent runs unless `--no-resume` is passed.
8. The system shall upload `_inventory.csv` as a Google Sheet at the end of every successful sync run; if `.sync-meta.json` contains a `sheetsId`, it shall call `updateSheet()`; otherwise it shall call `uploadAsSheet()` and persist the new ID to `.sync-meta.json`.
9. The system shall expose `sync()`, `FolderNode`, `DriveFileBody`, and `ImageMarker` as named exports from `index.ts` for consumption by `@fci/cli` and other packages.

## Non-Functional Requirements

| Category | Requirement | Threshold |
|---|---|---|
| Reliability | Per-row CSV flush ensures crash-resumable progress | Zero rows lost on SIGKILL mid-run |
| Compatibility | `gws` CLI must be globally installed and authenticated | Hard dependency; fails fast with clear error if absent |
| Security | No credentials stored in the repo | Auth fully delegated to `gws` credential store |
| Idempotency | Re-running sync on a completed set produces no duplicate Drive files or folders | Drive query before every create |
| Testability | Core logic (tree builder, marker parser, CSV read/write) unit-tested without live Drive calls | Vitest; `gws` calls are stubbed via `execa` mock |

## Out of Scope

- Image insertion into Google Docs — deferred until `gws docs documents batchUpdate` is confirmed working
- Deleting Drive files or folders that no longer exist locally (one-way mirror only)
- Syncing back from Drive to the local filesystem
- Any user interface beyond the `fci-sync` CLI
- Authentication or credential management (owned by the `gws` CLI)
- Watching the local directory for changes (single-shot sync only)

## Data Structures / Entities

### FolderNode
| Field | Type | Description |
|---|---|---|
| `name` | `string` | Folder name (single path segment) |
| `children` | `FolderNode[]` | Immediate child folders |

### DriveFileBody
| Field | Type | Description |
|---|---|---|
| `name` | `string` | Display name in Drive |
| `mimeType` | `string` | Drive or upload MIME type |
| `parents` | `string[]` | Parent folder Drive IDs |

### ImageMarker
| Field | Type | Description |
|---|---|---|
| `alt` | `string` | Alt text from marker |
| `src` | `string` | Image source path or URL |
| `fullMatch` | `string` | Raw marker string for replacement |

### SyncConfig
| Field | Type | Description |
|---|---|---|
| `inventoryPath` | `string` | Absolute path to `_inventory.csv` |
| `driveFolderId` | `string` | Root Google Drive folder ID |
| `resume` | `boolean?` | If `false`, re-syncs all rows (default: `true`) |

### SyncMeta
| Field | Type | Description |
|---|---|---|
| `sheetsId` | `string?` | Drive ID of the uploaded Sheets file; absent on first run |

## Integration Points

| Direction | System | API / Contract |
|---|---|---|
| Consumes | `@fci/shared` | `readInventory(path)`, `writeInventory(path, rows)`, `InventoryRow` type |
| Consumes | `gws` CLI (external) | `gws drive files create`, `gws drive files list` — invoked via `execa` |
| Exposes to | `@fci/cli` (and other packages) | `sync(config: SyncConfig): Promise<void>`, `FolderNode`, `DriveFileBody`, `ImageMarker` types |

## Design Reference

No UI components. This module is CLI-only; no `DESIGN.md` applies.

## Open Questions

| # | Question | Status |
|---|---|---|
| 1 | Does `gws docs documents batchUpdate` support inline image insertion via Drive file ID? | Blocked — deferred to post-MVP investigation |
| 2 | Should `updateSheet()` replace all rows or upsert by URL key? | Assumed full-replace for now; revisit if Sheets quota becomes a concern |
