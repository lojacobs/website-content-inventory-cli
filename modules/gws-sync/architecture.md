# Architecture — gws-sync

## Domain Model

The module mirrors a local output directory into Google Drive. The core entities are: `FolderNode` (a tree node representing a local directory, with `name` and `children`), `DriveFileBody` (the payload sent to the Drive API for every create/find operation, containing `name`, `mimeType`, and `parents`), `SyncConfig` (the orchestrator's input: `inventoryPath`, `driveFolderId`, and optional `resume` flag), `SyncMeta` (persisted in `.sync-meta.json` to track the Sheets file ID across runs), and `ImageMarker` (a parsed `[IMAGE: alt | src]` marker extracted from .txt files, held for deferred insertion). The `_inventory.csv` file acts as both the work queue and the progress ledger via its `sync_status` column.

## Data Flow — Happy Path

1. `fci-sync` CLI parses `--inventory` and `--folder-id` flags and calls `sync(config)`.
2. `sync()` reads `_inventory.csv` via `@fci/shared.readInventory()`.
3. `buildFolderTree()` builds a `FolderNode` tree from all `crawl_status=done` rows.
4. `mirrorFolderTree()` walks the tree, calling `ensureDriveFolder()` (find-or-create) for each node.
5. For each `crawl_status=done` row where `sync_status !== 'done'`, `uploadAsDoc()` runs `gws drive files create --upload <path>` to convert the .txt to a Google Doc; image markers are parsed but `replaceImagesInDoc` is a no-op stub.
6. `_inventory.csv` is written to disk after each row to ensure crash-resumable progress.
7. The inventory is uploaded as Google Sheets: if `.sync-meta.json` contains `sheetsId`, `updateSheet()` is called; otherwise `uploadAsSheet()` is called and the new ID is saved.

## Invariants

- **INV-01** Folder creation is idempotent: `ensureDriveFolder()` always queries for an existing folder before creating one.
- **INV-02** `_inventory.csv` is written after every row — never batched — to guarantee crash-resumable progress.
- **INV-03** `.sync-meta.json` is local state only; it must never be committed (gitignored).
- **INV-04** `DriveFileBody` is defined once in `drive.ts` and imported everywhere else; no duplicate definitions.
- **INV-05** `replaceImagesInDoc` is a deliberate no-op stub and must remain so until `gws docs documents batchUpdate` is confirmed working.

## Constraints

- **COMPAT-01** Requires `gws` CLI globally installed and authenticated before any sync operation.
- **COMPAT-02** `gws drive files create` must use `--json '{"name":...}'` syntax; individual flags are not supported.
- **SEC-01** No credentials or secrets are committed to the repo; auth is delegated entirely to `gws`'s own credential store.
- **PERF-01** Rows already marked `sync_status=done` are skipped unless `--no-resume` is passed.

## Naming Conventions

| Scope | Convention | Example |
|---|---|---|
| Package folder | kebab-case | `packages/gws-sync/` |
| Source files | flat kebab-case `.ts` | `drive.ts`, `sync.ts`, `cli.ts` |
| Test files | mirror source in `tests/` | `tests/drive.test.ts` |
| Local meta file | dot-prefixed kebab-case | `.sync-meta.json` |
| Environment variables | SCREAMING_SNAKE_CASE | `GWS_FOLDER_ID` |
| Exported types | PascalCase | `FolderNode`, `DriveFileBody`, `SyncConfig` |
| Internal functions | camelCase | `ensureDriveFolder()`, `buildFolderTree()` |

## Extended Details

- Functional requirements and out-of-scope exclusions: `modules/gw-sync/specs.md`
- Shared utilities consumed: `@fci/shared` (`readInventory`, `writeInventory`)
- Cross-module type contracts: `index.ts` re-exports `FolderNode`, `DriveFileBody`, `ImageMarker`
