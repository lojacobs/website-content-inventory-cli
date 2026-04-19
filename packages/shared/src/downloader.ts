/**
 * downloader.ts
 * wget-based HTML downloader with dangerous-extension guard,
 * HTTP status parsing, and Last-Modified header extraction.
 */

import { spawn } from 'child_process';

/** File extensions considered dangerous to download */
export const DANGEROUS_EXTENSIONS: string[] = [
  'exe', 'dmg', 'sh', 'bat', 'cmd', 'msi', 'pkg', 'deb', 'rpm',
  'ps1', 'vbs', 'js', 'jar', 'app',
];

/**
 * Returns true if the URL path ends with a dangerous extension.
 */
export function isDangerousUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
    return DANGEROUS_EXTENSIONS.includes(ext);
  } catch {
    // If URL parsing fails, treat as safe (let wget handle it)
    return false;
  }
}

/**
 * Build the wget CLI argument array for recursive site mirroring.
 * Uses --server-response so HTTP headers are written to stderr.
 */
export function buildWgetArgs(url: string, outputDir: string): string[] {
  return [
    '--server-response',
    '--recursive',
    '--no-clobber',
    '--convert-links',
    '--page-requisites',
    '--no-parent',
    '--wait=1',
    '--random-wait',
    `--directory-prefix=${outputDir}`,
    url,
  ];
}

/** Result returned by downloadPage */
export interface WgetResult {
  html?: string;
  statusCode?: number;
  lastModified?: Date;
  error?: string;
}

/**
 * Download a page using wget.
 * Guards against dangerous URLs, spawns wget with --server-response,
 * and parses the HTTP status code and Last-Modified header from stderr.
 */
export function downloadPage(url: string, outputDir: string): Promise<WgetResult> {
  return new Promise((resolve) => {
    if (isDangerousUrl(url)) {
      resolve({ error: `Refused to download dangerous URL: ${url}` });
      return;
    }

    const args = buildWgetArgs(url, outputDir);
    const child = spawn('wget', args);

    let stderrBuf = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    child.on('close', () => {
      const result: WgetResult = {};

      // Parse HTTP status code — wget prints e.g. "  HTTP/1.1 200 OK"
      const statusMatch = stderrBuf.match(/HTTP\/[\d.]+ (\d{3})/);
      if (statusMatch) {
        result.statusCode = parseInt(statusMatch[1], 10);
      }

      // Parse Last-Modified header
      const lastModifiedMatch = stderrBuf.match(
        /Last-Modified:\s*(.+?)(?:\r?\n|$)/i,
      );
      if (lastModifiedMatch) {
        const parsed = new Date(lastModifiedMatch[1].trim());
        if (!isNaN(parsed.getTime())) {
          result.lastModified = parsed;
        }
      }

      resolve(result);
    });

    child.on('error', (err: Error) => {
      resolve({ error: `wget spawn failed: ${err.message}` });
    });
  });
}
