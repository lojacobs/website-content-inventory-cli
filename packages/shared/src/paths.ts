import * as nodePath from 'path';

/**
 * Converts a URL to a local .txt file path under outputDir.
 *
 * Rules:
 * - Domain becomes a top-level directory
 * - Path segments become subdirectories
 * - Root or trailing-slash paths collapse to index.txt
 *   e.g. https://example.com/         → <outputDir>/example.com/index.txt
 *        https://example.com/about/   → <outputDir>/example.com/about/index.txt
 * - Pages without trailing slash get .txt appended
 *   e.g. https://example.com/blog/post → <outputDir>/example.com/blog/post.txt
 * - Query strings are stripped
 */
export function urlToTxtPath(url: string, outputDir: string): string {
  const parsed = new URL(url);
  const domain = parsed.hostname;

  // Strip query string and hash; work with the raw pathname
  let pathname = parsed.pathname;

  // Determine if the URL refers to a "directory" (root or trailing slash)
  const isDirectory = pathname === '/' || pathname.endsWith('/');

  // Remove leading/trailing slashes for splitting
  const trimmed = pathname.replace(/^\/|\/$/g, '');

  let relParts: string[];
  if (trimmed === '') {
    // Root of the domain
    relParts = ['index.txt'];
  } else if (isDirectory) {
    // Trailing slash → collapse to index.txt inside that directory
    relParts = [...trimmed.split('/'), 'index.txt'];
  } else {
    // No trailing slash → last segment gets .txt
    const segments = trimmed.split('/');
    const last = segments.pop()!;
    relParts = [...segments, `${last}.txt`];
  }

  return nodePath.join(outputDir, domain, ...relParts);
}

/**
 * Returns the directory where wget --convert-links would download the raw HTML
 * for this URL. Mirrors wget's mirroring directory structure.
 *
 * wget mirrors:
 *   https://example.com/        → <outputDir>/example.com/
 *   https://example.com/about/  → <outputDir>/example.com/about/
 *   https://example.com/blog/post → <outputDir>/example.com/blog/
 */
export function urlToDownloadDir(url: string, outputDir: string): string {
  const parsed = new URL(url);
  const domain = parsed.hostname;

  let pathname = parsed.pathname;

  // If the path ends with a slash (or is root), that IS the directory
  if (pathname === '/' || pathname.endsWith('/')) {
    const trimmed = pathname.replace(/^\/|\/$/g, '');
    if (trimmed === '') {
      return nodePath.join(outputDir, domain);
    }
    return nodePath.join(outputDir, domain, trimmed);
  }

  // Otherwise the last segment is the file; its parent is the directory
  const trimmed = pathname.replace(/^\//, '');
  const segments = trimmed.split('/');
  segments.pop(); // remove filename
  if (segments.length === 0) {
    return nodePath.join(outputDir, domain);
  }
  return nodePath.join(outputDir, domain, ...segments);
}
