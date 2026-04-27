/**
 * gws-sync — main orchestrator: build folder trees, parse image markers, sync to Drive.
 */

import { readInventory, writeInventory, type InventoryRow, urlToFilename, isBinaryAsset } from '@full-content-inventory/shared';
import type { FolderNode, ImageMarker, SyncConfig, SyncMeta } from './types.js';
import { ensureDriveFolder, uploadAsDoc, uploadAsBinary, uploadAsSheet, updateSheet, SheetNotFoundError } from './drive.js';
import { fetchToTemp } from './fetchOrigin.js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';

// ---------------------------------------------------------------------------
// Path-traversal guard
// ---------------------------------------------------------------------------

/**
 * Assert that a resolved file path stays within the given base directory.
 * Throws if the resolved path escapes the directory.
 *
 * Security note: this check uses `resolve()` (not `realpath()`), so symlinks
 * inside `dir` are NOT followed. A symlink in the inventory directory could
 * redirect a read to an arbitrary location. This is acceptable for the current
 * threat model (single-tenant, app-owned output directory).
 */
export function assertPathWithinDir(filePath: string, dir: string): void {
  const resolvedFile = resolve(filePath);
  const resolvedDir = resolve(dir);
  const prefix = resolvedDir.endsWith('/') ? resolvedDir : resolvedDir + '/';
  if (!resolvedFile.startsWith(prefix) && resolvedFile !== resolvedDir) {
    throw new Error(
      `Path traversal blocked: ${resolvedFile} is outside ${resolvedDir}`
    );
  }
}
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// buildFolderTree
// ---------------------------------------------------------------------------

/**
 * Groups InventoryRow[] by directory path derived from URL pathname.
 * Returns a forest of FolderNode[] where each root represents a top-level
 * directory segment and children nest subdirectories.
 *
 * Example:
 *   /a/b/page.html  →  { name: 'a', children: [{ name: 'b', children: [] }] }
 *   /a/c/page.html  →  { name: 'a', children: [{ name: 'b', children: [] }, { name: 'c', children: [] }] }
 */
export function buildFolderTree(rows: InventoryRow[]): FolderNode[] {
  // Map from path segment array → existing FolderNode (by reference)
  const segmentMap = new Map<string, FolderNode>();
  // Track insertion order for roots
  const roots: FolderNode[] = [];

  for (const row of rows) {
    let urlPathname: string;
    try {
      urlPathname = new URL(row.URL).pathname;
    } catch {
      console.warn(`buildFolderTree: skipping invalid URL: ${row.URL}`);
      continue;
    }

    // Extract directory segments (everything except the filename)
    const pathParts = urlPathname.split('/').filter((s) => s.length > 0);
    // Remove the last segment (filename) to get directory path
    const dirSegments = pathParts.slice(0, -1);

    if (dirSegments.length === 0) continue;

    // Build/find the tree for each segment
    let parentSegments = '';
    for (const segment of dirSegments) {
      const fullPath = parentSegments ? `${parentSegments}/${segment}` : segment;

      if (!segmentMap.has(fullPath)) {
        const node: FolderNode = { name: segment, children: [] };
        segmentMap.set(fullPath, node);

        if (parentSegments === '') {
          // Root-level segment
          roots.push(node);
        } else {
          // Find parent node and append
          const parent = segmentMap.get(parentSegments);
          if (parent) {
            // Check if this child already exists under parent (by name)
            const existing = parent.children.find((c) => c.name === segment);
            if (!existing) {
              parent.children.push(node);
            }
          }
        }
      }

      parentSegments = fullPath;
    }
  }

  return roots;
}

// ---------------------------------------------------------------------------
// parseImageMarkers
// ---------------------------------------------------------------------------

/**
 * Extracts all [IMAGE: alt | src] patterns from text.
 * Returns ImageMarker[] with alt, src, and fullMatch fields.
 */
export function parseImageMarkers(text: string): ImageMarker[] {
  const markers: ImageMarker[] = [];
  const regex = /\[IMAGE:\s*([^\]|]+?)\s*\|\s*([^\]]+?)\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    markers.push({
      alt: match[1].trim(),
      src: match[2].trim(),
      fullMatch: match[0],
    });
  }

  return markers;
}

// ---------------------------------------------------------------------------
// replaceImagesInDoc
// ---------------------------------------------------------------------------

/**
 * No-op stub — per architecture invariant INV-05.
 * Accepts docId and markers but performs no action.
 */
export async function replaceImagesInDoc(
  _docId: string,
  _markers: ImageMarker[]
): Promise<void> {
  return Promise.resolve();
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

/**
 * Main orchestrator for syncing inventory rows to Google Drive.
 */
export async function sync(config: SyncConfig): Promise<void> {
  const { inventoryPath, driveFolderId, resume = true } = config;

  // Step 1: Read inventory
  const allRows = await readInventory(inventoryPath);

  // Step 2: Filter to rows where crawl_status === 'done' (per specs.md FR-2).
  // Empty/missing crawl_status means "not yet crawled" and must be skipped —
  // their .txt files do not exist on disk.
  const crawledRows = allRows.filter((row) => row.crawl_status === 'done');

  // Step 3: If resume is true (default), skip rows where sync_status === 'done'
  const rowsToProcess = resume
    ? crawledRows.filter((row) => row.sync_status !== 'done')
    : crawledRows;

  // Step 4: Build folder tree
  const folderTree = buildFolderTree(rowsToProcess);

  // Step 5: Mirror folders in Drive and collect path → Drive folder ID mapping
  // We walk the tree and build a map of local path segments to Drive IDs
  const pathToDriveId = new Map<string, string>();

  async function walkTree(
    nodes: FolderNode[],
    parentPath: string,
    parentDriveId: string
  ): Promise<void> {
    for (const node of nodes) {
      const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
      const nodeDriveId = await ensureDriveFolder(node.name, parentDriveId);
      pathToDriveId.set(nodePath, nodeDriveId);

      if (node.children.length > 0) {
        await walkTree(node.children, nodePath, nodeDriveId);
      }
    }
  }

  await walkTree(folderTree, '', driveFolderId);

  // Helper: get Drive folder ID for a given row's URL
  function getDriveFolderId(row: InventoryRow): string {
    try {
      const urlPathname = new URL(row.URL).pathname;
      const pathParts = urlPathname.split('/').filter((s: string) => s.length > 0);
      const dirSegments = pathParts.slice(0, -1); // remove filename

      if (dirSegments.length === 0) {
        return driveFolderId;
      }

      // Try to find the most specific matching folder
      for (let i = dirSegments.length; i >= 0; i--) {
        const tryPath = dirSegments.slice(0, i).join('/');
        if (pathToDriveId.has(tryPath)) {
          return pathToDriveId.get(tryPath)!;
        }
      }

      console.warn(`getDriveFolderId: no mapped Drive folder for ${row.URL}; using root`);
      return driveFolderId;
    } catch {
      console.warn(`getDriveFolderId: invalid URL ${row.URL}; using root`);
      return driveFolderId;
    }
  }

  // Step 6: Process each qualifying row
  const invDir = dirname(inventoryPath);

  for (const row of rowsToProcess) {
    try {
      // Get Drive folder ID for this row
      const rowDriveFolderId = getDriveFolderId(row);

      const asset = isBinaryAsset(row.URL);
      let docOrFileId: string;

      if (asset.isBinary) {
        const fetched = await fetchToTemp(row.URL);
        try {
          const rawName = basename(new URL(row.URL).pathname);
          let driveName: string;
          try { driveName = decodeURIComponent(rawName); } catch { driveName = rawName; }
          docOrFileId = await uploadAsBinary(
            fetched.tempPath,
            rowDriveFolderId,
            asset.mimeType!,
            driveName,
          );
        } finally {
          await fetched.cleanup();
        }
      } else {
        // Determine local .txt file path
        const localTxtPath = resolve(invDir, urlToFilename(row.URL));

        // Path-traversal guard
        assertPathWithinDir(localTxtPath, invDir);

        // Read .txt content
        const content = await readFile(localTxtPath, 'utf-8');

        // Parse image markers
        const markers = parseImageMarkers(content);

        // Upload as Google Doc
        docOrFileId = await uploadAsDoc(localTxtPath, rowDriveFolderId);

        // Replace images (no-op stub)
        await replaceImagesInDoc(docOrFileId, markers);
      }

      // Update row status
      row.sync_status = 'done';
      row.Lien_Google_Doc = docOrFileId;
    } catch (err) {
      // On error: set sync_status = 'error' and continue
      row.sync_status = 'error';
      console.error(`Error processing row ${row.URL}:`, err);
    }

    // Write inventory back to disk after each row
    await writeInventory(inventoryPath, allRows);
  }

  // Step 7: Handle inventory-as-Sheet upload
  const syncMetaPath = resolve(invDir, '.sync-meta.json');

  let syncMeta: SyncMeta;
  try {
    const metaContent = await readFile(syncMetaPath, 'utf-8');
    syncMeta = JSON.parse(metaContent) as SyncMeta;
  } catch (err) {
    // Only swallow "file does not exist" — surface anything else (permissions,
    // corrupted JSON, …) so the caller can react.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      syncMeta = {};
    } else if (err instanceof SyntaxError) {
      throw new Error(
        `Failed to parse ${syncMetaPath}: ${err.message}. Delete or fix the file to continue.`,
      );
    } else {
      throw err;
    }
  }

  let finalSheetsId: string;

  if (syncMeta.sheetsId) {
    try {
      await updateSheet(inventoryPath, syncMeta.sheetsId);
      finalSheetsId = syncMeta.sheetsId;
    } catch (err) {
      // If the recorded sheet was deleted in Drive, fall back to a fresh upload
      // so subsequent runs converge instead of failing forever.
      if (err instanceof SheetNotFoundError) {
        console.warn(
          `Recorded sheetsId ${syncMeta.sheetsId} no longer exists in Drive; uploading a new sheet.`,
        );
        finalSheetsId = await uploadAsSheet(inventoryPath, driveFolderId);
      } else {
        throw err;
      }
    }
  } else {
    finalSheetsId = await uploadAsSheet(inventoryPath, driveFolderId);
  }

  // Persist sheetsId to .sync-meta.json
  syncMeta.sheetsId = finalSheetsId;
  await writeFile(syncMetaPath, JSON.stringify(syncMeta, null, 2), 'utf-8');
}
