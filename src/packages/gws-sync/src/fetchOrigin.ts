/**
 * Fetch non-HTML assets from their origin URL into a temporary file.
 */

import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { URL } from 'node:url';

export interface FetchedAsset {
  /** Absolute path to the downloaded temp file. */
  tempPath: string;
  /** Removes the temp file and its parent directory. */
  cleanup: () => Promise<void>;
}

/**
 * Fetch a non-HTML asset from its origin URL into a temp directory.
 * Returns a path the caller can hand to gws + a cleanup() that removes both
 * the temp file and its parent dir. Throws on non-2xx or network failure.
 */
export async function fetchToTemp(url: string): Promise<FetchedAsset> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`fetch ${url}: HTTP ${res.status}`);
  }
  const dir = await mkdtemp(join(tmpdir(), 'fci-sync-'));
  try {
    const rawName = basename(new URL(url).pathname) || 'asset';
    let name: string;
    try { name = decodeURIComponent(rawName); } catch { name = rawName; }
    const tempPath = join(dir, name);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(tempPath, buf);
    return {
      tempPath,
      cleanup: async () => {
        try { await unlink(tempPath); } catch { /* ignore */ }
        try { await rmdir(dir); } catch { /* ignore */ }
      },
    };
  } catch (err) {
    try { await rmdir(dir); } catch { /* ignore */ }
    throw err;
  }
}
