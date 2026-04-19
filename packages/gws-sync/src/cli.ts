#!/usr/bin/env node
/**
 * fci-sync — CLI for the Google Drive sync stage of full-content-inventory.
 *
 * Usage:
 *   fci-sync --inventory <path> --drive-folder <id> --client <name> --project <name>
 *
 * Options:
 *   --inventory   Path to the _inventory.csv file (required)
 *   --drive-folder  Google Drive root folder ID to sync into (required)
 *   --client      Client name used in sheet/folder naming (required)
 *   --project     Project name used in sheet/folder naming (required)
 *   --help, -h    Show this help message
 */

import { sync } from "./sync.js";
import type { SyncConfig } from "@fci/shared";

function printUsage(): void {
  console.log(`
fci-sync — Sync inventory docs to Google Drive

Usage:
  fci-sync --inventory <path> --drive-folder <id> --client <name> --project <name>

Options:
  --inventory     Path to the _inventory.csv file (required)
  --drive-folder  Google Drive root folder ID (required)
  --client        Client name for sheet/folder naming (required)
  --project       Project name for sheet/folder naming (required)
  --help, -h      Show this help message
`.trim());
}

function parseArgs(argv: string[]): SyncConfig {
  const args = argv.slice(2); // strip 'node' and script path
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const inventoryPath = get("--inventory");
  const driveRootFolderId = get("--drive-folder");
  const clientName = get("--client");
  const projectName = get("--project");

  const missing: string[] = [];
  if (!inventoryPath) missing.push("--inventory");
  if (!driveRootFolderId) missing.push("--drive-folder");
  if (!clientName) missing.push("--client");
  if (!projectName) missing.push("--project");

  if (missing.length > 0) {
    console.error(`Error: missing required arguments: ${missing.join(", ")}\n`);
    printUsage();
    process.exit(1);
  }

  return {
    inventoryPath: inventoryPath!,
    driveRootFolderId: driveRootFolderId!,
    clientName: clientName!,
    projectName: projectName!,
  };
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv);
  try {
    await sync(config);
  } catch (err) {
    console.error("fci-sync failed:", err);
    process.exit(1);
  }
}

main();
