/**
 * @full-content-inventory/crawler
 *
 * Crawler orchestrator — coordinates download → metadata → sanitization →
 * text conversion → injection detection → file write → CSV upsert.
 */

import { join, relative } from "node:path";
import { existsSync } from "node:fs";
import unidecode from "unidecode";

import { downloadPage, type DownloadOptions } from "./download.js";
import { extractMeta, type PageMeta } from "./meta.js";
import { sanitizeHtml } from "./sanitize.js";
import { htmlToText } from "./convert.js";
import { sanitizeText, loadInjectionPatterns } from "./injection.js";
import { discoverDomainUrls, discoverFolderUrls } from "./discover.js";
import {
  upsertRow,
  readInventory,
  writeInventory,
  type InventoryRow,
} from "@full-content-inventory/shared";
import { ensureDirForFile } from "@full-content-inventory/shared";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CrawlOptions {
  /** Directory where .txt files and the inventory CSV are written */
  outputDir: string;
  /** Client identifier for path structure */
  client: string;
  /** Project name for path structure */
  project: string;
  /** Optional injection patterns (loaded from config if not provided) */
  patterns?: string[];
  /** Skip URLs already in the inventory (default: true) */
  resume?: boolean;
  /** Custom User-Agent string */
  userAgent?: string;
  /** Request timeout in seconds */
  timeout?: number;
  /** Milliseconds to wait between page fetches (default: 500) */
  delay?: number;
  /** Crawl mode */
  mode: "domain" | "folder" | "page" | "list";
}

// ---------------------------------------------------------------------------
// URL → safe filename
// ---------------------------------------------------------------------------

/**
 * Convert a URL to a safe relative path (not a flat filename).
 * Strips protocol, query, fragment, and converts path segments to safe ASCII.
 *
 * @param url  The full URL to convert.
 * @returns    A safe relative path with real directory separators.
 *             Root paths (/, /index.html, /index) map to "homepage.txt".
 */
export function urlToFilename(url: string): string {
  try {
    const { pathname } = new URL(url);
    const decoded = unidecode(pathname);

    // Normalize common index variants
    if (pathname === "/" || pathname === "/index.html" || pathname === "/index") {
      return "homepage.txt";
    }

    // Strip leading slash and normalize path
    const normalizedPath = decoded
      .replace(/^\//, "")  // strip leading slash
      .replace(/\/index$/, "");  // strip trailing /index

    // Split into segments
    const segments = normalizedPath.split("/").filter(Boolean);

    // For the last segment (filename), strip known web extensions
    // before sanitization so dots in the middle are preserved correctly
    const lastIdx = segments.length - 1;
    if (lastIdx >= 0) {
      segments[lastIdx] = segments[lastIdx]
        .replace(/\.(html?|php|aspx)$/i, "");
    }

    // Sanitize each segment: replace invalid chars with hyphens
    const safeSegments = segments.map((seg) =>
      seg
        .replace(/[^a-zA-Z0-9_\-.]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
    );

    // Rejoin with real directory separators
    return safeSegments.join("/") + ".txt";
  } catch {
    // Fallback for invalid URLs
    const safe = unidecode(url)
      .replace(/[^a-zA-Z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      || "unknown";
    return safe + ".txt";
  }
}

// ---------------------------------------------------------------------------
// processPage
// ---------------------------------------------------------------------------

/**
 * Process a single URL: download → extract metadata → sanitize HTML →
 * convert to text → detect/sanitize injections → write .txt file →
 * upsert inventory CSV row.
 *
 * @param url      The URL to process.
 * @param domain   The domain extracted from the seed URL.
 * @param options  CrawlOptions (outputDir, client, project, patterns, userAgent, timeout).
 * @returns        Promise<void> — throws on download errors; logs all other steps.
 */
export async function processPage(
  url: string,
  _domain: string,
  options: CrawlOptions,
): Promise<void> {
  const { outputDir, client, project, patterns, userAgent, timeout } = options;

  // Derive the domain (hostname) from the URL being processed.
  // This ensures correct segregation for page and list modes where the
  // caller passed an empty domain string.
  const pageDomain = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return _domain || "unknown";
    }
  })();

  // Construct the full output directory for this domain
  const domainDir = join(outputDir, `${client}_${project}`, pageDomain);
  const inventoryPath = join(domainDir, "_inventory.csv");

  // 1. Download
  const downloadOptions: DownloadOptions = {
    userAgent,
    timeout,
  };
  const { html, statusCode, lastModified, finalUrl } = await downloadPage(url, downloadOptions);

  // 2. Extract metadata
  const headers = lastModified ? { "last-modified": lastModified } : undefined;
  const meta: PageMeta = extractMeta(html, url, headers);

  // 3. Sanitize HTML (remove nav, scripts, footers, etc.)
  const sanitizedHtml = sanitizeHtml(html);

  // 4. Convert sanitized HTML → plain text
  const rawText = htmlToText(sanitizedHtml);

  // 5. Detect / sanitize prompt-injection artefacts
  const cleanText = sanitizeText(rawText, patterns);

  // 6. Write .txt file
  const filename = urlToFilename(url);
  const txtPath = join(domainDir, filename);
  await ensureDirForFile(txtPath);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(txtPath, cleanText, "utf-8");

  // 7. Build inventory row
  const description = meta.Description ?? "";
  const inventoryRow: InventoryRow = {
    URL: url,
    Titre: meta.Titre ?? "",
    Description: description,
    Resume_200_chars: "",
    Type_de_page: "",
    Profondeur_URL: meta.Profondeur_URL ?? 0,
    Nb_mots: meta.Nb_mots ?? 0,
    Statut_HTTP: statusCode,
    Langue: meta.Langue ?? "und",
    Date_modifiee: meta.Date_modifiee ?? "",
    Canonical: meta.Canonical ?? "",
    Noindex: meta.Noindex ?? false,
    Nb_images: meta.Nb_images ?? 0,
    Fichiers_liés: meta.Fichiers_liés ?? 0,
    Lien_Google_Doc: "",
    Lien_dossier_Drive: "",
    URL_finale: finalUrl !== url ? finalUrl : undefined,
  };

  // 8. Upsert CSV row
  await upsertRow(inventoryPath, inventoryRow, "URL");

  console.log(`[crawl] ✓ processed  ${url}  →  ${relative(outputDir, txtPath)}`);
}

// ---------------------------------------------------------------------------
// crawl
// ---------------------------------------------------------------------------

/**
 * Crawl an array of URLs, processing each through `processPage`.
 *
 * Resume support: if `options.resume` is true (the default) and the inventory
 * CSV already contains a row for a given URL, that URL is skipped. The CSV
 * is created with headers on first use.
 *
 * @param urls    Array of URLs to crawl.
 * @param options CrawlOptions (outputDir, inventoryPath, patterns, resume, …).
 */
export async function crawl(
  urls: string[],
  options: CrawlOptions,
): Promise<void> {
  const {
    outputDir,
    client,
    project,
    patterns,
    resume = true,
    userAgent,
    timeout,
    delay = 500,
    mode,
  } = options;

  // For domain mode, derive the output base path from the seed URL's domain
  let domain = "";
  let urlsToCrawl = urls;
  if (mode === "domain") {
    if (urls.length === 0) {
      console.error("[crawl] domain mode requires at least one seed URL");
      process.exit(1);
    }
    try {
      const seedUrl = new URL(urls[0]);
      domain = seedUrl.hostname;
    } catch {
      console.error("[crawl] invalid seed URL for domain mode");
      process.exit(1);
    }
    const discovered = await discoverDomainUrls(urls[0], { userAgent, timeout });
    urlsToCrawl = discovered;
    console.log(`[crawl] domain mode: discovered ${discovered.length} URL(s)`);
  }

  if (mode === "folder") {
    if (urls.length === 0) {
      console.error("[crawl] folder mode requires at least one seed URL");
      process.exit(1);
    }
    const seedUrl = urls[0];
    try {
      const parsed = new URL(seedUrl);
      domain = parsed.hostname;
    } catch {
      console.error("[crawl] invalid seed URL for folder mode");
      process.exit(1);
    }
    const discovered = await discoverFolderUrls(seedUrl, { userAgent, timeout });
    urlsToCrawl = discovered;
    console.log(`[crawl] folder mode: discovered ${discovered.length} URL(s)`);
  }

  // Load the URL set once for O(1) resume checks
  const resolvedInventoryPath = join(outputDir, `${client}_${project}`, domain, "_inventory.csv");
  const doneUrls = resume ? await loadDoneUrls(resolvedInventoryPath) : new Set<string>();

  // Pre-load injection patterns so they are shared across all pages
  const activePatterns = patterns ?? loadInjectionPatterns();

  // Ensure the output CSV has headers before the first upsert
  if (!existsSync(resolvedInventoryPath)) {
    await writeInventory(resolvedInventoryPath, []);
  }

  let processed = 0;
  let skipped = 0;
  let first = true;

  for (const url of urlsToCrawl) {
    if (resume && doneUrls.has(url)) {
      console.log(`[crawl] ↷ skip (done)  ${url}`);
      skipped++;
      continue;
    }

    if (!first && delay > 0) {
      await sleep(delay);
    }
    first = false;

    try {
      await processPage(url, domain, {
        outputDir,
        client,
        project,
        patterns: activePatterns,
        userAgent,
        timeout,
        delay,
        mode,
      });
      processed++;
    } catch (err) {
      // DownloadBlockedError and wget failures are logged but don't halt the queue
      console.error(`[crawl] ✗ failed     ${url}  —  ${(err as Error).message}`);
    }
  }

  console.log(`[crawl] done — processed: ${processed}, skipped: ${skipped}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load the set of already-crawled URLs from the inventory CSV. */
/** Pause execution for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadDoneUrls(inventoryPath: string): Promise<Set<string>> {
  try {
    const rows = await readInventory(inventoryPath);
    return new Set(rows.map((r) => r.URL));
  } catch {
    // File doesn't exist yet — nothing is done
    return new Set();
  }
}
