/**
 * gws CLI wrappers for Drive operations.
 * All functions use execa to invoke the gws CLI.
 *
 * The actual `gws drive files {list,create,update}` flag contract is:
 *   --params <JSON>               URL/query params (used for q, fields, fileId, …)
 *   --json   <JSON>               request body
 *   --upload <PATH>               local file to upload (multipart)
 *   --upload-content-type <MIME>  source MIME of the uploaded bytes
 *
 * `files.list` returns `{ kind, files, nextPageToken, … }` — NOT a bare array.
 */

import { basename, dirname } from 'node:path';
import { execa } from 'execa';
import type { DriveFileBody } from './types.js';

interface DriveFileResponse extends DriveFileBody {
  id: string;
}

interface DriveListResponse {
  files?: DriveFileResponse[];
}

/**
 * Escape characters that are special in Drive query strings (single quotes
 * and backslashes). Drive search syntax uses `\\` and `\'` to escape.
 * https://developers.google.com/drive/api/guides/ref-search-terms
 */
export function escapeDriveQuery(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Strip a known extension (case-insensitive) so the Drive Doc/Sheet title
 * does not include the local file's extension.
 */
function stripExt(name: string, ext: string): string {
  return name.toLowerCase().endsWith(ext.toLowerCase())
    ? name.slice(0, -ext.length)
    : name;
}

/**
 * Idempotent find-or-create for a Drive folder under `parentId`.
 * Returns the folder's Drive ID.
 */
export async function ensureDriveFolder(name: string, parentId: string): Promise<string> {
  const q =
    `mimeType='application/vnd.google-apps.folder'` +
    ` and name='${escapeDriveQuery(name)}'` +
    ` and '${escapeDriveQuery(parentId)}' in parents` +
    ` and trashed=false`;

  const list = await execa('gws', [
    'drive', 'files', 'list',
    '--params', JSON.stringify({ q, fields: 'files(id,name,parents)', pageSize: 10 }),
  ]);

  if (list.exitCode !== 0) {
    throw new Error(`gws drive files list failed: ${list.stderr}`);
  }

  const parsed = JSON.parse(list.stdout) as DriveListResponse;
  const files = parsed.files ?? [];
  if (files.length > 0) {
    return files[0].id;
  }

  const createBody: DriveFileBody = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };

  const created = await execa('gws', [
    'drive', 'files', 'create',
    '--json', JSON.stringify(createBody),
  ]);

  if (created.exitCode !== 0) {
    throw new Error(`gws drive files create failed: ${created.stderr}`);
  }

  return (JSON.parse(created.stdout) as DriveFileResponse).id;
}

/**
 * Uploads a local .txt file as a Google Doc.
 * Returns the created file's Drive ID.
 */
export async function uploadAsDoc(localPath: string, parentId: string): Promise<string> {
  const file = basename(localPath);
  const body: DriveFileBody = {
    name: stripExt(file, '.txt'),
    mimeType: 'application/vnd.google-apps.document',
    parents: [parentId],
  };

  const result = await execa(
    'gws',
    [
      'drive', 'files', 'create',
      '--upload', file,
      '--upload-content-type', 'text/plain',
      '--json', JSON.stringify(body),
    ],
    { cwd: dirname(localPath) },
  );

  if (result.exitCode !== 0) {
    throw new Error(`gws drive files create (doc) failed: ${result.stderr}`);
  }

  return (JSON.parse(result.stdout) as DriveFileResponse).id;
}

/**
 * Uploads a local file to Drive with its original MIME type (no Workspace conversion).
 * Returns the created file's Drive ID.
 */
export async function uploadAsBinary(
  localPath: string,
  parentId: string,
  mimeType: string,
  driveName: string,
): Promise<string> {
  const file = basename(localPath);
  const body: DriveFileBody = {
    name: driveName,
    mimeType,
    parents: [parentId],
  };
  const result = await execa(
    'gws',
    [
      'drive', 'files', 'create',
      '--upload', file,
      '--upload-content-type', mimeType,
      '--json', JSON.stringify(body),
    ],
    { cwd: dirname(localPath) },
  );
  if (result.exitCode !== 0) {
    throw new Error(`gws drive files create (binary) failed: ${result.stderr}`);
  }
  return (JSON.parse(result.stdout) as DriveFileResponse).id;
}

/**
 * Uploads a local CSV file as a Google Sheet.
 * Returns the created file's Drive ID.
 */
export async function uploadAsSheet(localPath: string, parentId: string): Promise<string> {
  const file = basename(localPath);
  const body: DriveFileBody = {
    name: stripExt(file, '.csv'),
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: [parentId],
  };

  const result = await execa(
    'gws',
    [
      'drive', 'files', 'create',
      '--upload', file,
      '--upload-content-type', 'text/csv',
      '--json', JSON.stringify(body),
    ],
    { cwd: dirname(localPath) },
  );

  if (result.exitCode !== 0) {
    throw new Error(`gws drive files create (sheet) failed: ${result.stderr}`);
  }

  return (JSON.parse(result.stdout) as DriveFileResponse).id;
}

/**
 * Overwrites an existing Google Sheet with new CSV content.
 * Throws an Error with `code === 'SHEET_NOT_FOUND'` when the target sheet
 * has been deleted/trashed in Drive — callers may fall back to `uploadAsSheet`.
 */
export class SheetNotFoundError extends Error {
  code = 'SHEET_NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SheetNotFoundError';
  }
}

export async function updateSheet(localPath: string, sheetsId: string): Promise<void> {
  const file = basename(localPath);

  const result = await execa(
    'gws',
    [
      'drive', 'files', 'update',
      '--params', JSON.stringify({ fileId: sheetsId }),
      '--upload', file,
      '--upload-content-type', 'text/csv',
    ],
    { cwd: dirname(localPath) },
  );

  if (result.exitCode !== 0) {
    if (
      /(?:^|\W)404(?:\W|$)/.test(result.stderr) ||
      /not\s*found/i.test(result.stderr)
    ) {
      throw new SheetNotFoundError(
        `gws drive files update: sheet ${sheetsId} not found`,
      );
    }
    throw new Error(`gws drive files update failed: ${result.stderr}`);
  }
}
