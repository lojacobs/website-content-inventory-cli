/**
 * wget-based download wrapper with security validation.
 * Validates dangerous file extensions and Content-Type headers,
 * parses HTTP metadata from wget stderr.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Security blocklists
// ---------------------------------------------------------------------------

/** Extensions that represent executable / potentially dangerous files. */
const DANGEROUS_EXTENSIONS = new Set([
  "exe",
  "dll",
  "sh",
  "dmg",
  "bat",
  "cmd",
  "com",
  "msi",
  "ps1",
  "vbs",
  "jar",
  "app",
  "bin",
  "so",
  "dylib",
]);

/**
 * Content-Types that indicate a binary / executable download.
 * Any Content-Type matching one of these (ignoring charset suffix) is rejected.
 */
const DANGEROUS_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sh",
  "application/x-bat",
  "application/x-shockwave-flash",
  "application/x-silverlight",
  "application/x-xpinstall", // Firefox/Mozilla xpi
  "application/x-iso9660-image",
  "application/x-apple-diskimage",
]);

// ---------------------------------------------------------------------------
// wget stderr parser
// ---------------------------------------------------------------------------

interface WgetMeta {
  statusCode: number;
  lastModified?: string;
  contentType: string;
  contentLength?: number;
}

/**
 * Parse HTTP status, Last-Modified, Content-Type, and Content-Length
 * from wget --server-response stderr.
 *
 * wget --server-response prints HTTP/1.x status lines and headers for each
 * request/redirect. The first HTTP/1.x block is the final response (after
 * wget follows redirects automatically).
 *
 * Example output:
 *   HTTP/1.1 200 OK
 *   Content-Type: text/html; charset=utf-8
 *   Content-Length: 12345
 *   Last-Modified: Mon, 01 Jan 2024 00:00:00 GMT
 */
function parseWgetServerResponse(stderr: string): WgetMeta {
  // Split into lines; wget may prepend timestamps or indentation
  const lines = stderr.split("\n").map((l) => l.trim());

  let statusCode = 0;
  let contentType = "";
  let contentLength: number | undefined;
  let lastModified: string | undefined;

  for (const line of lines) {
    // HTTP/1.1 200 OK  or  HTTP/1.0 301 Moved Permanently
    const statusMatch = line.match(/^HTTP\/[\d.]+\s+(\d{3})\s*/);
    if (statusMatch) {
      statusCode = parseInt(statusMatch[1], 10);
      continue;
    }

    if (line.startsWith("Content-Type:")) {
      contentType = line.replace("Content-Type:", "").trim().split(";")[0].toLowerCase();
      continue;
    }

    if (line.startsWith("Content-Length:")) {
      contentLength = parseInt(line.replace("Content-Length:", "").trim(), 10);
      continue;
    }

    if (line.startsWith("Last-Modified:")) {
      lastModified = parseHttpDate(line.replace("Last-Modified:", "").trim());
      continue;
    }
  }

  return { statusCode, lastModified, contentType, contentLength };
}

/**
 * Parse an HTTP-date string (RFC 7231) into YYYYMMDD.
 * Handles formats like:
 *   "Mon, 01 Jan 2024 00:00:00 GMT"
 *   "Monday, 01-Jan-24 00:00:00 GMT"
 *   "Jan 01 2024 00:00:00 GMT"
 */
function parseHttpDate(dateStr: string): string {
  try {
    // RFC 7231: IMF-fixdate  = day-name "," SP date1 SP time-of-day SP GMT
    // e.g. "Mon, 01 Jan 2024 00:00:00 GMT"
    const rfc7231Match = dateStr.match(
      /^\w{3},\s+(\d{1,2})\s+(\w{3})\s+(\d{4})\s+\d{2}:\d{2}:\d{2}\s*GMT$/i
    );
    if (rfc7231Match) {
      const [, day, monthStr, year] = rfc7231Match;
      const month = MONTH_MAP[monthStr.toLowerCase()] ?? "01";
      return `${year}${month}${day.padStart(2, "0")}`;
    }

    // RFC 850 / asctime-like: "Monday, 01-Jan-24 00:00:00 GMT"
    const rfc850Match = dateStr.match(
      /^\w+,\s+(\d{1,2})-(\w{3})-(\d{2,4})\s+\d{2}:\d{2}:\d{2}/i
    );
    if (rfc850Match) {
      const [, day, monthStr, yearStr] = rfc850Match;
      let year = yearStr;
      if (year.length === 2) year = (parseInt(year, 10) > 50 ? "19" : "20") + yearStr;
      const month = MONTH_MAP[monthStr.toLowerCase()] ?? "01";
      return `${year}${month}${day.padStart(2, "0")}`;
    }

    // Fallback: let Node.js parse it
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getUTCFullYear();
      const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
      const d = String(parsed.getUTCDate()).padStart(2, "0");
      return `${y}${m}${d}`;
    }
  } catch {
    // fall through
  }
  return "19700101";
}

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

// ---------------------------------------------------------------------------
// URL validation helpers
// ---------------------------------------------------------------------------

/** Extract the pathname from a URL, return empty string if no pathname. */
function urlPathname(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return "";
  }
}

/** Returns true if the URL's path ends with a dangerous extension. */
function hasDangerousExtension(url: string): boolean {
  const pathname = urlPathname(url);
  const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
  return ext !== "" && DANGEROUS_EXTENSIONS.has(ext);
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export interface DownloadResult {
  html: string;
  finalUrl: string;
  statusCode: number;
  lastModified?: string;
  contentType: string;
  contentLength?: number;
}

export interface DownloadOptions {
  /** Custom User-Agent string. */
  userAgent?: string;
  /** Timeout per attempt in seconds (default: 30). */
  timeout?: number;
  /** Number of retry attempts on failure (default: 3). */
  retries?: number;
}

/** Error thrown when a download is blocked by security checks. */
export class DownloadBlockedError extends Error {
  public readonly reason: "extension" | "content-type";
  constructor(
    reason: "extension" | "content-type",
    message: string
  ) {
    super(message);
    this.name = "DownloadBlockedError";
    this.reason = reason;
  }
}

function isDangerousContentType(contentType: string): boolean {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return DANGEROUS_CONTENT_TYPES.has(mime);
}

/**
 * Download a page via wget, returning HTML content and HTTP metadata.
 *
 * Security checks:
 * - Rejects URLs whose path ends in a dangerous extension (exe, dll, sh, etc.)
 * - Rejects downloads whose Content-Type is a known binary/executable type
 *
 * @param url - The full URL to download.
 * @param options.userAgent  - Custom User-Agent (default: "Mozilla/5.0 ...").
 * @param options.timeout    - Per-attempt timeout in seconds (default: 30).
 * @param options.retries    - Retry attempts on non-2xx or transient failure (default: 3).
 * @returns HTML content string plus parsed HTTP metadata.
 * @throws DownloadBlockedError if URL or Content-Type is in the blocklist.
 * @throws Error if wget fails after all retries.
 */
export async function downloadPage(
  url: string,
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const {
    userAgent = "Mozilla/5.0 (compatible; Pi-Crawler/1.0; +https://pi.dev)",
    timeout = 30,
    retries = 3,
  } = options;

  // 1. Validate URL extension BEFORE any network call
  if (hasDangerousExtension(url)) {
    throw new DownloadBlockedError(
      "extension",
      `Download blocked: dangerous file extension in URL "${url}"`
    );
  }

  // 2. Ensure tmp dir exists for output file
  const tmp = tmpdir();
  const tmpPath = join(tmp, `wget-download-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { stdout, stderr } = await execFileAsync(
        "wget",
        [
          "--quiet",
          "--server-response",
          "--no-clobber",
          "--output-document", tmpPath,
          "--user-agent", userAgent,
          "--timeout", String(timeout),
          "--tries", "1",
          "--server-response",
          "-O", "-", // write to stdout for easy capture
          url,
        ],
        {
          timeout: (timeout + 5) * 1000, // slightly larger than wget timeout
          maxBuffer: 50 * 1024 * 1024, // 50 MB
        }
      );

      const html = stdout;

      // 3. Parse metadata from stderr (HTTP/1.x status lines + headers)
      const meta = parseWgetServerResponse(stderr);

      const { statusCode, lastModified, contentType, contentLength } = meta;

      // 4. Validate Content-Type
      if (statusCode >= 200 && statusCode < 400) {
        if (isDangerousContentType(contentType)) {
          // Clean up temp file before throwing
          await unlinkSafe(tmpPath);
          throw new DownloadBlockedError(
            "content-type",
            `Download blocked: dangerous Content-Type "${contentType}" for "${url}"`
          );
        }
      }

      // 5. Clean up temp file
      await unlinkSafe(tmpPath);

      return {
        html,
        finalUrl: url,
        statusCode,
        lastModified,
        contentType,
        contentLength,
      };
    } catch (err) {
      lastError = err as Error;
      // Don't retry DownloadBlockedError
      if (err instanceof DownloadBlockedError) throw err;

      // Retry on transient errors (timeout, connection reset, etc.)
      if (attempt < retries) {
        // exponential-ish back-off: 1s, 2s, 4s
        await sleep(Math.pow(2, attempt - 1) * 1000);
      }
    }
  }

  await unlinkSafe(tmpPath);
  throw lastError ?? new Error(`wget failed for "${url}" after ${retries} attempts`);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function unlinkSafe(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Ignore cleanup errors
  }
}
