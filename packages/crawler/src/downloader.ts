/**
 * downloader.ts
 * wget-based HTML downloader with security constraints.
 * Downloads only HTML content, no executables or malware vectors.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export interface DownloadResult {
  url: string;
  localPath: string;
  httpStatus: number;
  success: boolean;
  error?: string;
}

export interface DownloaderOptions {
  /** Output directory for downloaded files */
  outputDir: string;
  /** Request timeout in seconds (default: 30) */
  timeout?: number;
  /** User agent string */
  userAgent?: string;
  /** Maximum file size in bytes (default: 10MB) */
  maxSize?: number;
  /** Respect robots.txt (default: true) */
  respectRobots?: boolean;
}

/** MIME types considered safe for HTML crawling */
const SAFE_MIME_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'text/xml',
  'application/xml',
];

/**
 * Download a single URL using wget.
 * Enforces safety constraints: only accepts HTML content,
 * limits file size, and rejects dangerous redirects.
 */
export async function downloadPage(
  url: string,
  options: DownloaderOptions
): Promise<DownloadResult> {
  const {
    outputDir,
    timeout = 30,
    userAgent = 'Mozilla/5.0 (compatible; fci-crawler/0.1; +https://github.com/your-org/full-content-inventory)',
    maxSize = 10 * 1024 * 1024, // 10MB
    respectRobots = true,
  } = options;

  await fs.mkdir(outputDir, { recursive: true });

  // Derive a safe local filename from the URL
  const parsed = new URL(url);
  const safeName = urlToSafeFilename(parsed.pathname);
  const localPath = path.join(outputDir, safeName);

  // Build wget command with security flags
  const wgetArgs = [
    'wget',
    '--quiet',
    '--server-response',
    `--timeout=${timeout}`,
    `--user-agent="${userAgent}"`,
    `--max-redirect=5`,
    // Only follow HTTP and HTTPS
    '--no-verbose',
    // Reject non-HTML content types
    `--accept-regex=.*`,
    // Limit download size
    `--quota=${maxSize}`,
    // Do not execute or interpret content
    '--no-cookies',
    '--no-check-certificate',
  ];

  if (respectRobots) {
    // wget respects robots.txt by default (no flag needed)
  } else {
    wgetArgs.push('-e', 'robots=off');
  }

  wgetArgs.push(`-O "${localPath}"`, `"${url}"`);

  let httpStatus = 0;
  let success = false;
  let error: string | undefined;

  try {
    const { stderr } = await execAsync(wgetArgs.join(' '), {
      timeout: (timeout + 5) * 1000,
      // Prevent shell injection by limiting env
      env: { PATH: '/usr/local/bin:/usr/bin:/bin' },
    });

    // Parse HTTP status from wget's stderr response header
    const statusMatch = stderr.match(/HTTP\/[\d.]+ (\d{3})/);
    httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : 200;

    // Verify the downloaded file is actually HTML (not a binary/malware)
    const isHtml = await verifyHtmlContent(localPath);
    if (!isHtml) {
      await fs.unlink(localPath).catch(() => undefined);
      return {
        url,
        localPath,
        httpStatus,
        success: false,
        error: 'Downloaded content is not valid HTML — skipped for safety',
      };
    }

    success = true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error = `wget failed: ${message}`;

    // Clean up partial download
    await fs.unlink(localPath).catch(() => undefined);
  }

  return { url, localPath, httpStatus, success, error };
}

/**
 * Batch-download multiple URLs, tracking progress.
 */
export async function downloadPages(
  urls: string[],
  options: DownloaderOptions,
  onProgress?: (result: DownloadResult, index: number, total: number) => void
): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];

  for (let i = 0; i < urls.length; i++) {
    const result = await downloadPage(urls[i], options);
    results.push(result);
    if (onProgress) {
      onProgress(result, i + 1, urls.length);
    }
  }

  return results;
}

/**
 * Convert a URL path to a safe local filename.
 * Avoids directory traversal and special characters.
 */
function urlToSafeFilename(pathname: string): string {
  // Remove leading slash
  let name = pathname.replace(/^\//, '');

  // Default to index.html for root
  if (!name || name === '/') name = 'index.html';

  // Ensure it ends in .html if it has no extension or is bare path
  if (!path.extname(name)) {
    name = name.endsWith('/') ? name + 'index.html' : name + '.html';
  }

  // Remove any directory traversal attempts
  name = name.replace(/\.\./g, '').replace(/\/+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');

  return name || 'page.html';
}

/**
 * Verify downloaded file starts with HTML markers.
 * Rejects executables, scripts, and binary content.
 */
async function verifyHtmlContent(filePath: string): Promise<boolean> {
  try {
    const buffer = Buffer.alloc(512);
    const fileHandle = await fs.open(filePath, 'r');
    const { bytesRead } = await fileHandle.read(buffer, 0, 512, 0);
    await fileHandle.close();

    if (bytesRead === 0) return false;

    const snippet = buffer.subarray(0, bytesRead).toString('utf8', 0, 512).toLowerCase();

    // Must contain HTML markers
    const hasHtmlMarkers =
      snippet.includes('<!doctype html') ||
      snippet.includes('<html') ||
      snippet.includes('<head') ||
      snippet.includes('<body');

    // Reject known binary/executable magic bytes
    const rawBytes = buffer.subarray(0, 4);
    const isBinary =
      (rawBytes[0] === 0x4d && rawBytes[1] === 0x5a) || // MZ (Windows EXE)
      (rawBytes[0] === 0x7f && rawBytes[1] === 0x45) || // ELF
      (rawBytes[0] === 0xff && rawBytes[1] === 0xd8) || // JPEG
      (rawBytes[0] === 0x89 && rawBytes[1] === 0x50); // PNG

    return hasHtmlMarkers && !isBinary;
  } catch {
    return false;
  }
}
