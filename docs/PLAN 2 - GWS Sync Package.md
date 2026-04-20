# PLAN 2: GWS Sync Package

---

## Task 1: Verify gws CLI Interface

Before writing sync code, confirm the gws CLI commands available on the system.

- [ ] **Step 1: Check gws version and available commands**

```bash
gws version
gws drive --help
```

Expected: version number and drive sub-command help.

- [ ] **Step 2: Confirm file upload command**

```bash
gws drive files --help
```

Note the exact sub-command names (e.g. `upload`, `create`, `import`). The implementation in Tasks 2–4 uses these commands — adjust command strings to match what `gws --help` shows.

- [ ] **Step 3: Commit notes**

```bash
git commit --allow-empty -m "chore(gws-sync): verified gws CLI interface before implementation"
```

---

## Task 2: Drive Folder Structure Mirror

**Files:**
- Create: `packages/gws-sync/src/drive.ts`
- Create: `packages/gws-sync/tests/drive.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/gws-sync/tests/drive.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildFolderTree, type FolderNode } from '../src/drive.js';
import path from 'node:path';

describe('buildFolderTree', () => {
  it('returns root node for single-level path', () => {
    const tree = buildFolderTree(['domain.com/homepage.txt']);
    expect(tree.name).toBe('domain.com');
    expect(tree.children).toHaveLength(0);
  });

  it('nests child folders', () => {
    const paths = [
      'domain.com/homepage.txt',
      'domain.com/parent/child.txt',
      'domain.com/parent/other.txt',
    ];
    const tree = buildFolderTree(paths);
    const parent = tree.children.find(c => c.name === 'parent');
    expect(parent).toBeDefined();
    expect(parent?.children).toHaveLength(0); // files are not children
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
cd packages/gws-sync && pnpm test
```

- [ ] **Step 3: Implement `drive.ts`**

```typescript
// packages/gws-sync/src/drive.ts
import path from 'node:path';
import { execa } from 'execa';

export interface FolderNode {
  name: string;
  children: FolderNode[];
}

export function buildFolderTree(localPaths: string[]): FolderNode {
  // localPaths are relative to outputDir, e.g. "domain.com/parent/page.txt"
  // Extract unique directory paths (excluding the domain root itself)
  const dirSet = new Set<string>();
  for (const p of localPaths) {
    const dir = path.dirname(p);
    const parts = dir.split(path.sep);
    // Add each ancestor directory
    for (let i = 1; i <= parts.length; i++) {
      dirSet.add(parts.slice(0, i).join(path.sep));
    }
  }

  const dirs = [...dirSet].sort();
  const root: FolderNode = { name: dirs[0] ?? '', children: [] };

  function findOrCreate(parent: FolderNode, name: string): FolderNode {
    let node = parent.children.find(c => c.name === name);
    if (!node) { node = { name, children: [] }; parent.children.push(node); }
    return node;
  }

  for (const dir of dirs.slice(1)) {
    const parts = dir.split(path.sep).slice(1); // skip root
    let current = root;
    for (const part of parts) {
      current = findOrCreate(current, part);
    }
  }

  return root;
}

export async function ensureDriveFolder(
  name: string,
  parentId: string
): Promise<string> {
  // Create folder in Google Drive, return its ID
  // gws drive files create --name <name> --parent <parentId> --mimeType application/vnd.google-apps.folder
  const result = await execa('gws', [
    'drive', 'files', 'create',
    '--name', name,
    '--parent', parentId,
    '--mimeType', 'application/vnd.google-apps.folder',
    '--format', 'json',
  ]);
  const json = JSON.parse(result.stdout);
  return json.id as string;
}

export async function mirrorFolderTree(
  tree: FolderNode,
  parentDriveId: string
): Promise<Map<string, string>> {
  // Returns map of local relative path → Google Drive folder ID
  const folderIds = new Map<string, string>();
  folderIds.set(tree.name, parentDriveId);

  async function recurse(node: FolderNode, currentPath: string, driveParentId: string): Promise<void> {
    for (const child of node.children) {
      const childPath = path.join(currentPath, child.name);
      const childId = await ensureDriveFolder(child.name, driveParentId);
      folderIds.set(childPath, childId);
      await recurse(child, childPath, childId);
    }
  }

  await recurse(tree, tree.name, parentDriveId);
  return folderIds;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd packages/gws-sync && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/gws-sync/src/drive.ts packages/gws-sync/tests/drive.test.ts
git commit -m "feat(gws-sync): Google Drive folder tree mirror"
```

---

## Task 3: TXT → Google Docs Upload

**Files:**
- Create: `packages/gws-sync/src/docs.ts`
- Create: `packages/gws-sync/tests/docs.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/gws-sync/tests/docs.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildGwsUploadArgs } from '../src/docs.js';

describe('buildGwsUploadArgs', () => {
  it('targets correct mimeType for Google Docs conversion', () => {
    const args = buildGwsUploadArgs('/tmp/page.txt', 'FOLDER_ID', 'page');
    expect(args).toContain('application/vnd.google-apps.document');
    expect(args).toContain('FOLDER_ID');
    expect(args).toContain('page');
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
cd packages/gws-sync && pnpm test
```

- [ ] **Step 3: Implement `docs.ts`**

```typescript
// packages/gws-sync/src/docs.ts
import { execa } from 'execa';

export function buildGwsUploadArgs(
  localFile: string,
  driveFolderId: string,
  docName: string
): string[] {
  return [
    'drive', 'files', 'import',
    '--file', localFile,
    '--name', docName,
    '--parent', driveFolderId,
    '--mimeType', 'application/vnd.google-apps.document',
    '--format', 'json',
  ];
}

export async function uploadAsDoc(
  localFile: string,
  driveFolderId: string,
  docName: string
): Promise<string> {
  const result = await execa('gws', buildGwsUploadArgs(localFile, driveFolderId, docName));
  const json = JSON.parse(result.stdout);
  return `https://docs.google.com/document/d/${json.id}/edit` as string;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd packages/gws-sync && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/gws-sync/src/docs.ts packages/gws-sync/tests/docs.test.ts
git commit -m "feat(gws-sync): txt to Google Docs upload helper"
```

---

## Task 4: CSV → Google Sheets Upload

**Files:**
- Create: `packages/gws-sync/src/sheets.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/gws-sync/tests/sheets.test.ts
import { describe, it, expect } from 'vitest';
import { buildSheetsImportArgs } from '../src/sheets.js';

describe('buildSheetsImportArgs', () => {
  it('targets Google Sheets mimeType', () => {
    const args = buildSheetsImportArgs('/tmp/_inventory.csv', 'FOLDER_ID', '_inventory');
    expect(args).toContain('application/vnd.google-apps.spreadsheet');
  });
});
```

- [ ] **Step 2: Run — verify failure**

- [ ] **Step 3: Implement `sheets.ts`**

```typescript
// packages/gws-sync/src/sheets.ts
import { execa } from 'execa';

export function buildSheetsImportArgs(
  csvPath: string,
  driveFolderId: string,
  sheetName: string
): string[] {
  return [
    'drive', 'files', 'import',
    '--file', csvPath,
    '--name', sheetName,
    '--parent', driveFolderId,
    '--mimeType', 'application/vnd.google-apps.spreadsheet',
    '--format', 'json',
  ];
}

export async function uploadAsSheet(
  csvPath: string,
  driveFolderId: string,
  sheetName = '_inventory'
): Promise<string> {
  const result = await execa('gws', buildSheetsImportArgs(csvPath, driveFolderId, sheetName));
  const json = JSON.parse(result.stdout);
  return `https://docs.google.com/spreadsheets/d/${json.id}/edit` as string;
}

export async function updateSheet(fileId: string, csvPath: string): Promise<void> {
  // Re-upload CSV content to existing sheet
  await execa('gws', [
    'drive', 'files', 'update',
    '--fileId', fileId,
    '--file', csvPath,
    '--format', 'json',
  ]);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd packages/gws-sync && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/gws-sync/src/sheets.ts packages/gws-sync/tests/sheets.test.ts
git commit -m "feat(gws-sync): CSV to Google Sheets upload helper"
```

---

## Task 5: Image Replacement in Google Docs

**Files:**
- Create: `packages/gws-sync/src/images.ts`

The txt files contain `[IMAGE: alt | src]` markers. After uploading as GDocs, we replace these with real images using the Google Docs API via gws.

- [ ] **Step 1: Write failing test**

```typescript
// packages/gws-sync/tests/images.test.ts
import { describe, it, expect } from 'vitest';
import { parseImageMarkers } from '../src/images.js';

describe('parseImageMarkers', () => {
  it('extracts image alt and src from markers', () => {
    const text = 'Some text\n[IMAGE: A photo | /images/photo.jpg]\nMore text';
    const markers = parseImageMarkers(text);
    expect(markers).toHaveLength(1);
    expect(markers[0].alt).toBe('A photo');
    expect(markers[0].src).toBe('/images/photo.jpg');
  });

  it('returns empty array if no markers', () => {
    const text = 'Just plain text with no images.';
    expect(parseImageMarkers(text)).toHaveLength(0);
  });

  it('handles absolute URLs in src', () => {
    const text = '[IMAGE: Logo | https://example.com/logo.png]';
    const markers = parseImageMarkers(text);
    expect(markers[0].src).toBe('https://example.com/logo.png');
  });
});
```

- [ ] **Step 2: Run — verify failure**

- [ ] **Step 3: Implement `images.ts`**

```typescript
// packages/gws-sync/src/images.ts
import { execa } from 'execa';

const IMAGE_MARKER_RE = /\[IMAGE:\s*([^|]+?)\s*\|\s*([^\]]+?)\s*\]/g;

export interface ImageMarker {
  alt: string;
  src: string;
  fullMatch: string;
}

export function parseImageMarkers(text: string): ImageMarker[] {
  const markers: ImageMarker[] = [];
  let match: RegExpExecArray | null;
  IMAGE_MARKER_RE.lastIndex = 0;
  while ((match = IMAGE_MARKER_RE.exec(text)) !== null) {
    markers.push({ fullMatch: match[0], alt: match[1], src: match[2] });
  }
  return markers;
}

export function resolveImageUrl(src: string, baseUrl: string): string {
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  return new URL(src, baseUrl).toString();
}

export async function replaceImagesInDoc(
  docId: string,
  markers: ImageMarker[],
  baseUrl: string
): Promise<void> {
  for (const marker of markers) {
    const absoluteUrl = resolveImageUrl(marker.src, baseUrl);
    try {
      // gws docs replaceText replaces marker text with an image
      await execa('gws', [
        'docs', 'replaceText',
        '--documentId', docId,
        '--searchText', marker.fullMatch,
        '--imageUrl', absoluteUrl,
      ]);
    } catch {
      // Image replacement is best-effort; log and continue
      console.warn(`[warn] Could not replace image marker: ${marker.fullMatch}`);
    }
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd packages/gws-sync && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/gws-sync/src/images.ts packages/gws-sync/tests/images.test.ts
git commit -m "feat(gws-sync): image marker parser and Google Docs image replacement"
```

---

## Task 6: Sync Orchestrator + CLI

**Files:**
- Create: `packages/gws-sync/src/sync.ts`
- Create: `packages/gws-sync/src/index.ts`
- Create: `packages/gws-sync/src/cli.ts`

- [ ] **Step 1: Implement `sync.ts`**

```typescript
// packages/gws-sync/src/sync.ts
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  readInventory, writeInventory, type SyncConfig, type InventoryRow
} from '@fci/shared';
import { buildFolderTree, mirrorFolderTree } from './drive.js';
import { uploadAsSheet, updateSheet } from './sheets.js';
import { uploadAsDoc } from './docs.js';
import { parseImageMarkers, replaceImagesInDoc } from './images.js';

export async function sync(config: SyncConfig): Promise<void> {
  const { inventoryPath, driveFolderId, resume = true } = config;
  const rows = await readInventory(inventoryPath);

  if (rows.length === 0) {
    console.log('[sync] No rows in inventory. Run `fci crawl` first.');
    return;
  }

  const outputDir = path.dirname(inventoryPath);

  // 1. Mirror folder structure in Google Drive
  const donePaths = rows
    .filter(r => r.crawl_status === 'done')
    .map(r => path.relative(outputDir, r.local_path));

  const tree = buildFolderTree(donePaths);
  console.log('[sync] Mirroring folder structure in Google Drive…');
  const folderIds = await mirrorFolderTree(tree, driveFolderId);

  // 2. Upload each txt as Google Doc
  for (const row of rows) {
    if (row.crawl_status !== 'done') continue;
    if (resume && row.sync_status === 'done') continue;

    try {
      const rel = path.relative(outputDir, row.local_path);
      const docName = path.basename(row.local_path, '.txt');
      const folderRel = path.dirname(rel);
      const driveFolder = folderIds.get(folderRel) ?? driveFolderId;

      const docUrl = await uploadAsDoc(row.local_path, driveFolder, docName);
      row.Lien_Google_Doc = docUrl;
      row.Lien_dossier_Drive = `https://drive.google.com/drive/folders/${driveFolder}`;

      // Replace image markers in the uploaded doc
      const text = await fs.readFile(row.local_path, 'utf8');
      const markers = parseImageMarkers(text);
      if (markers.length > 0) {
        const docId = docUrl.match(/\/d\/([^/]+)\//)?.[1] ?? '';
        if (docId) await replaceImagesInDoc(docId, markers, row.URL);
      }

      row.sync_status = 'done';
      row.error_message = '';
    } catch (err) {
      row.sync_status = 'error';
      row.error_message = (err as Error).message;
    }

    await writeInventory(inventoryPath, rows);
  }

  // 3. Upload/update _inventory.csv as Google Sheets
  console.log('[sync] Uploading inventory as Google Sheets…');
  await uploadAsSheet(inventoryPath, driveFolderId, '_inventory');

  console.log('[sync] Done.');
}
```

- [ ] **Step 2: Create `packages/gws-sync/src/index.ts`**

```typescript
export { sync } from './sync.js';
```

- [ ] **Step 3: Create `packages/gws-sync/src/cli.ts`**

```typescript
#!/usr/bin/env node
// packages/gws-sync/src/cli.ts
import { Command } from 'commander';
import { sync } from './sync.js';

const program = new Command();

program
  .name('fci-sync')
  .description('Sync local content inventory to Google Drive')
  .requiredOption('-i, --inventory <path>', 'Path to _inventory.csv')
  .requiredOption('-f, --folder-id <id>', 'Google Drive root folder ID')
  .option('--no-resume', 'Re-upload even if already synced');

program.parse();
const opts = program.opts();

await sync({
  inventoryPath: opts.inventory,
  driveFolderId: opts.folderId,
  resume: opts.resume,
}).catch(err => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 4: Build**

```bash
cd packages/gws-sync && pnpm build
node dist/cli.js --help
```

Expected: `fci-sync` usage displayed.

- [ ] **Step 5: Commit**

```bash
git add packages/gws-sync/src/
git commit -m "feat(gws-sync): sync orchestrator and fci-sync CLI"
```

---