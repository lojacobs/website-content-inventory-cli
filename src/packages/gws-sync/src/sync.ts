/**
 * gws-sync — main orchestrator: build folder trees, parse image markers, sync to Drive.
 */

import { readInventory, writeInventory, type InventoryRow } from '@full-content-inventory/shared';
import type { FolderNode, ImageMarker, SyncConfig, SyncMeta } from './types.js';
import { ensureDriveFolder, uploadAsDoc, uploadAsSheet, updateSheet } from './drive.js';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// Helper: replicate crawler's url → .txt relative path mapping
// ---------------------------------------------------------------------------
function urlToTxtPath(url: string): string {
  const { pathname } = new URL(url);
  if (pathname === '/' || pathname === '/index.html' || pathname === '/index') {
    return 'homepage.txt';
  }
  const normalized = pathname
    .replace(/^\//, '')
    .replace(/\/index$/, '');
  const segments = normalized.split('/').filter(Boolean);
  const lastIdx = segments.length - 1;
  if (lastIdx >= 0) {
    segments[lastIdx] = segments[lastIdx].replace(/\.(html?|php|aspx)$/i, '');
  }
  return segments.join('/') + '.txt';
}

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
      // Skip rows with invalid URLs
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

  // Step 2: Filter to rows where crawl_status === 'done'
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

      return driveFolderId;
    } catch {
      return driveFolderId;
    }
  }

  // Step 6: Process each qualifying row
  const invDir = dirname(inventoryPath);

  for (const row of rowsToProcess) {
    try {
      // Determine local .txt file path
      const localTxtPath = resolve(invDir, urlToTxtPath(row.URL));

      // Read .txt content
      const content = await readFile(localTxtPath, 'utf-8');

      // Parse image markers
      const markers = parseImageMarkers(content);

      // Get Drive folder ID for this row
      const rowDriveFolderId = getDriveFolderId(row);

      // Upload as Google Doc
      const docId = await uploadAsDoc(localTxtPath, rowDriveFolderId);

      // Replace images (no-op stub)
      await replaceImagesInDoc(docId, markers);

      // Update row status
      row.sync_status = 'done';
      row.Lien_Google_Doc = docId;
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
  } catch {
    syncMeta = {};
  }

  let finalSheetsId: string;

  if (syncMeta.sheetsId) {
    // Update existing sheet
    await updateSheet(inventoryPath, syncMeta.sheetsId);
    finalSheetsId = syncMeta.sheetsId;
  } else {
    // Upload as new sheet
    finalSheetsId = await uploadAsSheet(inventoryPath, driveFolderId);
  }

  // Persist sheetsId to .sync-meta.json
  syncMeta.sheetsId = finalSheetsId;
  await writeFile(syncMetaPath, JSON.stringify(syncMeta, null, 2), 'utf-8');
}
