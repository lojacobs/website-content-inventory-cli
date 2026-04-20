/**
 * Path utilities for URL and file system operations
 */

import { URL } from 'node:url';
import { dirname } from 'node:path';
import { access, mkdir } from 'node:fs/promises';

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