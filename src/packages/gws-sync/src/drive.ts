/**
 * gws CLI wrappers for Drive operations.
 * All functions use execa to invoke the gws CLI.
 */

import { dirname } from 'node:path';
import { execa } from 'execa';
import type { DriveFileBody } from './types.js';

// Lightweight basename helper (avoids @types/node dependency).
function basename(filePath: string): string {
  return filePath.split('/').at(-1) ?? filePath;
}

// Response type returned by `gws drive files list/create` JSON output.
interface DriveFileResponse extends DriveFileBody {
  id: string;
}

/**
 * Idempotent find-or-create for a Drive folder.
 * Returns the folder's Drive ID.
 */
export async function ensureDriveFolder(name: string, parentId: string): Promise<string> {
  // First, try to find an existing folder with this name under parentId.
  const { exitCode, stdout, stderr } = await execa('gws', [
    'drive',
    'files',
    'list',
    '--parent-id',
    parentId,
    '--query',
    `mimeType='application/vnd.google-apps.folder' and name='${name}'`,
    '--json',
  ]);

  if (exitCode !== 0) {
    throw new Error(`gws drive files list failed: ${stderr}`);
  }

  const files: DriveFileResponse[] = JSON.parse(stdout);
  if (files.length > 0) {
    return files[0].id;
  }

  // No folder found — create one.
  const createBody: DriveFileBody = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };

  const createResult = await execa('gws', [
    'drive',
    'files',
    'create',
    '--json',
    JSON.stringify(createBody),
  ]);

  if (createResult.exitCode !== 0) {
    throw new Error(`gws drive files create failed: ${createResult.stderr}`);
  }

  const created: DriveFileResponse = JSON.parse(createResult.stdout);
  return created.id;
}

/**
 * Uploads a local .txt file as a Google Doc.
 * Returns the created file's Drive ID.
 */
export async function uploadAsDoc(localPath: string, parentId: string): Promise<string> {
  const filename = basename(localPath);
  const body: DriveFileBody = {
    name: filename,
    mimeType: 'application/vnd.google-apps.document',
    parents: [parentId],
  };

  const result = await execa(
    'gws',
    [
      'drive', 'files', 'create',
      '--upload', basename(localPath),
      '--upload-content-type', 'text/plain',
      '--json', JSON.stringify(body),
    ],
    { cwd: dirname(localPath) },
  );

  if (result.exitCode !== 0) {
    throw new Error(`gws drive files create (doc) failed: ${result.stderr}`);
  }

  const createdDoc: DriveFileResponse = JSON.parse(result.stdout);
  return createdDoc.id;
}

/**
 * Uploads a local CSV file as a Google Sheet.
 * Returns the created file's Drive ID.
 */
export async function uploadAsSheet(localPath: string, parentId: string): Promise<string> {
  const filename = basename(localPath);
  const body: DriveFileBody = {
    name: filename,
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: [parentId],
  };

  const result = await execa(
    'gws',
    [
      'drive', 'files', 'create',
      '--upload', basename(localPath),
      '--upload-content-type', 'text/csv',
      '--json', JSON.stringify(body),
    ],
    { cwd: dirname(localPath) },
  );

  if (result.exitCode !== 0) {
    throw new Error(`gws drive files create (sheet) failed: ${result.stderr}`);
  }

  const createdSheet: DriveFileResponse = JSON.parse(result.stdout);
  return createdSheet.id;
}

/**
 * Overwrites an existing Google Sheet with new CSV content.
 * Returns void on success.
 */
export async function updateSheet(localPath: string, sheetsId: string): Promise<void> {
  const result = await execa(
    'gws',
    [
      'drive', 'files', 'update', sheetsId,
      '--upload', basename(localPath),
      '--upload-content-type', 'text/csv',
    ],
    { cwd: dirname(localPath) },
  );

  if (result.exitCode !== 0) {
    throw new Error(`gws drive files update failed: ${result.stderr}`);
  }

  // No meaningful return value on success.
}