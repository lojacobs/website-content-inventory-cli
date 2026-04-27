/**
 * Path utilities for URL and file system operations
 */

import { URL } from 'node:url';
import { dirname } from 'node:path';
import { access, mkdir } from 'node:fs/promises';
import unidecode from 'unidecode';

/**
 * Convert a URL to a relative file path
 * e.g., https://example.com/page/subpage → /page/subpage
 */
export function urlToRelativePath(url: string, baseUrl: string): string {
  try {
    const urlObj = new URL(url);
    const baseObj = new URL(baseUrl);

    if (urlObj.origin !== baseObj.origin) {
      throw new Error('URL origin does not match base URL');
    }

    let pathname = urlObj.pathname;

    // Remove trailing slash unless it's the root
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // Default to index.html for root path
    if (pathname === '') {
      pathname = '/index.html';
    }

    return pathname;
  } catch {
    // Fallback: return a sanitized version of the URL
    return '/' + sanitizePath(url);
  }
}

/**
 * Sanitize a string for use as a file path component
 * Removes/replaces invalid characters
 */
export function sanitizePath(input: string): string {
  return input
    .replace(/^[a-z]+:\/\//, '') // Remove protocol
    .replace(/[?#].*$/, '') // Remove query string and fragment
    .replace(/^\/+/, '') // Remove leading slashes
    .replace(/\/+$/, '') // Remove trailing slashes
    .replace(/[^a-zA-Z0-9\-_./]/g, '-') // Replace invalid chars with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Ensures a directory exists, creating it if necessary.
 * Uses async fs operations for Node.js environment.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await access(dirPath);
  } catch {
    // Directory doesn't exist, create it recursively
    await mkdir(dirPath, { recursive: true });
  }
}

/**
 * Get the directory portion of a file path and ensure it exists
 */
export async function ensureDirForFile(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  if (dir && dir !== '.') {
    await ensureDir(dir);
  }
}

/**
 * Convert a URL to a safe relative path for local .txt file storage.
 *
 * This function is the single source of truth used by both the crawler
 * (to write .txt files) and gws-sync (to find them again). It must produce
 * identical output on both sides.
 *
 * Behavior:
 *   /, /index.html, /index          → "homepage.txt"
 *   /café/page.html                  → "cafe/page.txt"  (unidecode transliteration)
 *   /page with spaces.html            → "page-with-spaces.html"  (special chars → -)
 *   /.html files stripped before sanitization so dots in the middle are preserved
 */
export function urlToFilename(url: string): string {
  try {
    const { pathname } = new URL(url);
    const decoded = unidecode(pathname);

    // Normalize common index variants
    if (pathname === '/' || pathname === '/index.html' || pathname === '/index') {
      return 'homepage.txt';
    }

    // Strip leading slash and normalize path
    const normalizedPath = decoded
      .replace(/^\//, '')  // strip leading slash
      .replace(/\/index$/, '');  // strip trailing /index

    // Split into segments; decode percent-encoded dots (including double-encoded)
    // to catch traversal attempts, then filter them out.
    const segments = normalizedPath.split('/').filter(Boolean);
    const safeSegments = segments
      .map((seg) => {
        let decoded = seg;
        for (let i = 0; i < 3; i++) {
          const next = decodeURIComponent(decoded);
          if (next === decoded) break;
          decoded = next;
        }
        return decoded;
      })
      .filter((seg) => seg !== '.' && seg !== '..');

    // For the last segment (filename), strip known web extensions
    // before sanitization so dots in the middle are preserved correctly
    const lastIdx = safeSegments.length - 1;
    if (lastIdx >= 0) {
      safeSegments[lastIdx] = safeSegments[lastIdx]
        .replace(/\.(html?|php|aspx)$/i, '');
    }

    // Sanitize each segment: replace invalid chars with hyphens
    const sanitized = safeSegments.map((seg) =>
      seg
        .replace(/[^a-zA-Z0-9_\-.]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    );

    // Rejoin with real directory separators
    return sanitized.join('/') + '.txt';
  } catch {
    // Fallback for invalid URLs
    const safe = unidecode(url)
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      || 'unknown';
    return safe + '.txt';
  }
}