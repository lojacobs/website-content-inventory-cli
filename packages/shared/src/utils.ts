import path from 'path';
import os from 'os';

/**
 * Convert a URL to a local file path following project conventions.
 * - index.html at root -> homepage.txt
 * - parent/index.html -> parent.txt
 * - parent/page.html -> parent/page.txt
 */
export function urlToLocalPath(url: string, baseDomain: string): string {
  const parsed = new URL(url);
  let pathname = parsed.pathname;

  // Remove leading slash
  pathname = pathname.replace(/^\//, '');

  // Handle index files
  if (pathname === '' || pathname === 'index.html' || pathname === 'index.htm') {
    return 'homepage.txt';
  }

  // Remove trailing slash
  pathname = pathname.replace(/\/$/, '');

  // Handle index in subdirectory: parent/index.html -> parent.txt
  if (/\/index\.html?$/.test(pathname)) {
    pathname = pathname.replace(/\/index\.html?$/, '.txt');
    return pathname;
  }

  // Replace .html/.htm extension with .txt
  pathname = pathname.replace(/\.html?$/, '');

  return pathname + '.txt';
}

/**
 * Get the default output directory for a crawl
 */
export function getOutputDir(clientName: string, projectName: string, domain: string): string {
  return path.join(os.homedir(), 'tmp', `${clientName}_${projectName}`, domain);
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname;
}

/**
 * Count words in plain text
 */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0).length;
}

/**
 * Get URL depth (number of path segments)
 */
export function getUrlDepth(url: string): number {
  const parsed = new URL(url);
  const segments = parsed.pathname
    .split('/')
    .filter(s => s.length > 0 && s !== 'index.html' && s !== 'index.htm');
  return segments.length;
}
