# Task: full-content-inventory-integrated-4js — Result

## Diff Summary

**Created:** `src/packages/gws-sync/src/drive.ts` (3,644 bytes)

This file introduces the `gws` CLI integration layer for the `gw-sync` package. Key design decisions:

1. **`execa` over `child_process`** — all four functions import `execa` from the workspace dependency, matching the "no direct shell" requirement.

2. **Local `basename` helper** — avoids a `node:path` import that would require `@types/node` (not present in this project). A lightweight split-based implementation suffices for the `gws` command's name argument.

3. **`DriveFileResponse` interface** — a local type extending `DriveFileBody` with `id: string`. The gws CLI returns the Drive file ID in its JSON responses, but the shared `DriveFileBody` type only covers the create payload fields. Using a local response interface avoids polluting the shared types.

4. **Idempotent folder creation** — `ensureDriveFolder` first queries with `gws drive files list`, parses the JSON array, and returns the existing folder's ID if found. Only when the list is empty does it call `gws drive files create`.

5. **Error handling** — every `execa` call checks `exitCode !== 0` and throws `new Error(...)` that includes the command's `stderr` string.

## Functions

| Function | gws command | Returns |
|---|---|---|
| `ensureDriveFolder(name, parentId)` | `drive files list` then `drive files create` | `string` (folder ID) |
| `uploadAsDoc(localPath, parentId)` | `drive files create --upload ... --upload-content-type text/plain` | `string` (doc ID) |
| `uploadAsSheet(localPath, parentId)` | `drive files create --upload ... --upload-content-type text/csv` | `string` (sheet ID) |
| `updateSheet(localPath, sheetsId)` | `drive files update <sheetsId> --upload ...` | `void` |

## Build Verification

```
cd src/packages/gws-sync && pnpm build
→ tsc --build  (exit 0, no TypeScript errors)
```

All acceptance criteria met.