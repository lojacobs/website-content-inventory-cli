import fs from "node:fs";
import path from "node:path";
import { parse } from "node:path";
import type { InventoryRow, SyncConfig } from "@fci/shared";
import { mirrorFolderTree } from "./folder-mirror.js";
import { uploadAsDoc, updateDoc } from "./doc-upload.js";
import { replaceImagesInDoc } from "./image-replacement.js";
import { uploadAsSheet, updateSheet } from "./sheet-upload.js";

// ---------------------------------------------------------------------------
// CSV helpers (no external deps — plain text split)
// ---------------------------------------------------------------------------

function parseCSV(csvText: string): InventoryRow[] {
  const lines = csvText.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row as unknown as InventoryRow;
  });
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function rowsToCSV(rows: InventoryRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]) as (keyof InventoryRow)[];
  const escape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = headers.join(",");
  const body = rows.map((r) => headers.map((h) => escape(r[h])).join(","));
  return [header, ...body].join("\n") + "\n";
}

function writeCSV(csvPath: string, rows: InventoryRow[]): void {
  fs.writeFileSync(csvPath, rowsToCSV(rows), "utf8");
}

// ---------------------------------------------------------------------------
// sync() — main orchestrator
// ---------------------------------------------------------------------------

/**
 * Orchestrates the Google Drive sync stage of the FCI pipeline.
 *
 * For each inventory row where sync_status !== 'done':
 *  1. Mirrors the local folder tree to Drive under driveRootFolderId.
 *  2. Uploads (or updates) each .txt file as a Google Doc.
 *  3. Replaces [IMAGE: ...] markers in the uploaded doc.
 *  4. Writes the doc_id back to the CSV and sets sync_status='done'.
 *  5. On error, sets sync_status='error' and continues (resumable).
 *
 * After all rows, uploads the inventory CSV itself as a Google Sheet
 * (or updates an existing one if sheet_id is already set on any row).
 */
export async function sync(config: SyncConfig): Promise<void> {
  const { inventoryPath, driveRootFolderId, clientName, projectName } = config;

  // Read + parse inventory
  const csvText = fs.readFileSync(inventoryPath, "utf8");
  const rows = parseCSV(csvText);

  const unsynced = rows.filter((r) => r.sync_status !== "done");

  // Initialize rootSubfolderId to the raw root, will be updated if folders are mirrored
  let rootSubfolderId = driveRootFolderId;

  if (unsynced.length === 0) {
    console.log("All rows already synced. Nothing to do.");
  } else {
    console.log(
      `Syncing ${unsynced.length} of ${rows.length} rows...`
    );

    // Build the full folder map once (includes already-synced rows for
    // correct parent resolution)
    const allLocalPaths = rows
      .filter((r) => r.local_path)
      .map((r) => path.dirname(r.local_path));

    // Compute relative Drive paths from URLs and local paths
    const localToRelativePaths = new Map<string, string>();
    for (const row of rows) {
      if (!row.local_path || !row.url) continue;

      const localDir = path.dirname(row.local_path);
      const outputDir = path.dirname(inventoryPath);

      // Strip the output directory prefix to get the relative path
      let relativePath = localDir.startsWith(outputDir)
        ? localDir.slice(outputDir.length).replace(/^\//, "")
        : localDir;

      // Extract domain from URL and remove www. prefix
      let domain = "";
      try {
        const url = new URL(row.url);
        domain = url.hostname.replace(/^www\./, "");
      } catch {
        // Fallback: use first segment of relative path
        domain = relativePath.split(path.sep)[0] ?? "";
      }

      // Build Drive folder structure: {client}_{project}/{domain}/{path/to/page}
      if (domain && relativePath) {
        // Extract path after domain in the relative path
        const parts = relativePath.split(path.sep);
        const domainIndex = parts.findIndex(
          (p) => p === domain || p === `www.${domain}`
        );
        const pathAfterDomain =
          domainIndex >= 0 ? parts.slice(domainIndex + 1) : parts.slice(1);

        relativePath = [clientName, projectName, domain, ...pathAfterDomain].join(
          path.sep
        );
      } else {
        // Fallback: prefix with client_project
        relativePath = [clientName, projectName, relativePath]
          .filter(Boolean)
          .join(path.sep);
      }

      localToRelativePaths.set(localDir, relativePath);
    }

    // Convert local paths to relative paths for mirroring
    const relativePaths = allLocalPaths.map(
      (p) => localToRelativePaths.get(p) ?? p
    );

    const folderMap = await mirrorFolderTree(relativePaths, driveRootFolderId);

    // Extract the root {client}_{project} subfolder ID from the folderMap
    // The first entry in folderMap is the root subfolder created during mirroring
    const relativeFolderPaths = Array.from(folderMap.keys());
    if (relativeFolderPaths.length > 0) {
      const rootRelativePath = relativeFolderPaths[0];
      const rootId = folderMap.get(rootRelativePath);
      if (rootId) {
        rootSubfolderId = rootId;
      }
    }

    // Helper: resolve drive folder id for a given local file
    const getDriveFolderId = (localFilePath: string): string => {
      const dir = path.dirname(localFilePath);
      const relativeDir = localToRelativePaths.get(dir) ?? dir;
      return folderMap.get(relativeDir) ?? driveRootFolderId;
    };

    // Process each unsynced row
    for (const row of unsynced) {
      try {
        if (!row.local_path) {
          throw new Error("Row has no local_path");
        }

        const localPath = row.local_path;
        const ext = parse(localPath).ext.toLowerCase();

        if (ext !== ".txt") {
          // Skip non-text files silently; mark done so we don't retry
          row.sync_status = "done";
          writeCSV(inventoryPath, rows);
          continue;
        }

        const docName =
          row.title ?? path.basename(localPath, ".txt") ?? row.url;
        const parentFolderId = getDriveFolderId(localPath);

        let docUrl: string;
        let docId: string;

        if (row.doc_id) {
          // Resume: update existing doc
          await updateDoc(row.doc_id, localPath);
          docId = row.doc_id;
          docUrl = `https://docs.google.com/document/d/${docId}/edit`;
        } else {
          // New upload
          docUrl = await uploadAsDoc(localPath, docName, parentFolderId);
          docId = docUrl.split("/d/")[1]?.split("/")[0] ?? "";
        }

        // Replace image markers
        const content = fs.readFileSync(localPath, "utf8");
        await replaceImagesInDoc(docId, content);

        // Update row
        row.doc_id = docId;
        row.sync_status = "done";

        console.log(`  Synced: ${row.url} → ${docUrl}`);
      } catch (err) {
        console.error(`  Error syncing ${row.url ?? row.local_path}:`, err);
        row.sync_status = "error";
      }

      // Write after every row for resumability
      writeCSV(inventoryPath, rows);
    }
  }

  // Upload (or update) the inventory CSV as a Google Sheet
  console.log("Uploading inventory sheet...");
  const inventorySheetName = "_inventory";

  // Check if any row already has a sheet_id (written by a prior run)
  const existingSheetId = rows.find((r) => r.sheet_id)?.sheet_id;

  if (existingSheetId) {
    await updateSheet(existingSheetId, inventoryPath);
    console.log(
      `  Updated sheet: https://docs.google.com/spreadsheets/d/${existingSheetId}/edit`
    );
  } else {
    const sheetUrl = await uploadAsSheet(
      inventoryPath,
      inventorySheetName,
      rootSubfolderId
    );
    const sheetId = sheetUrl.split("/d/")[1]?.split("/")[0] ?? "";
    // Persist sheet_id on all rows so future runs update in place
    rows.forEach((r) => {
      r.sheet_id = sheetId;
    });
    writeCSV(inventoryPath, rows);
    console.log(`  Created sheet: ${sheetUrl}`);
  }

  console.log("Sync complete.");
}
