// FolderNode — tree node representing a local directory
export interface FolderNode {
  name: string;        // single path segment
  children: FolderNode[];
}

// DriveFileBody — payload for Drive API create/find operations
export interface DriveFileBody {
  name: string;
  mimeType: string;
  parents: string[];
}

// ImageMarker — parsed [IMAGE: alt | src] marker from .txt files
export interface ImageMarker {
  alt: string;
  src: string;
  fullMatch: string;   // raw marker string for replacement
}

// SyncConfig — orchestrator input
export interface SyncConfig {
  inventoryPath: string;   // absolute path to _inventory.csv
  driveFolderId: string;   // root Google Drive folder ID
  resume?: boolean;        // default true; if false, re-syncs all rows
}

// SyncMeta — persisted in .sync-meta.json across runs
export interface SyncMeta {
  sheetsId?: string;       // Drive ID of uploaded Sheets file; absent on first run
}