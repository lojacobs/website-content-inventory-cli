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
import { discoverDomainUrls } from "./discover.js";
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
  /** Path to the inventory CSV file */
  inventoryPath: string;
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
 * Convert a URL to a safe filename string using unidecode + sanitisation.
 * Strips protocol, query, fragment, and collapses path separators.
 *
 * @param url  The full URL to convert.
 * @returns    A safe ASCII filename (no slashes, spaces, or special chars).
 */
export function urlToFilename(url: string): string {
  try {
    const { pathname } = new URL(url);
    const decoded = unidecode(pathname);
    return decoded
      .replace(/^\//, "") // strip leading slash
      .replace(/\//g, "__") // slashes → double-underscore (readable separator)
      .replace(/[^a-zA-Z0-9_\-]/g, "-") // collapse everything else to hyphens
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") // no leading/trailing hyphens
      || "index";
  } catch {
    return unidecode(url)
      .replace(/[^a-zA-Z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      || "unknown";
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
 * @param url     The URL to process.
 * @param options CrawlOptions (outputDir, inventoryPath, patterns, userAgent, timeout).
 * @returns       Promise<void> — throws on download errors; logs all other steps.
 */
export async function processPage(
  url: string,
  options: CrawlOptions,
): Promise<void> {
  const { outputDir, inventoryPath, patterns, userAgent, timeout } = options;

  // 1. Download
  const downloadOptions: DownloadOptions = {
    userAgent,
    timeout,
  };
  const { html, statusCode, lastModified } = await downloadPage(url, downloadOptions);

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
  const filename = urlToFilename(url) + ".txt";
  const txtPath = join(outputDir, filename);
  await ensureDirForFile(txtPath);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(txtPath, cleanText, "utf-8");

  // 7. Build inventory row
  const description = meta.Description ?? "";
  const inventoryRow: InventoryRow = {
    URL: url,
    Titre: meta.Titre ?? "",
    Description: description,
    Resume_200_chars: description.length > 200 ? description.slice(0, 200) : description,
    Type_de_page: "unknown",
    Profondeur_URL: meta.Profondeur_URL ?? 0,
    Nb_mots: meta.Nb_mots ?? 0,
    Statut_HTTP: statusCode,
    Langue: meta.Langue ?? "und",
    Date_modifiee: meta.Date_modifiee ?? "",
    Canonical: meta.Canonical ?? "",
    Noindex: meta.Noindex ?? false,
    Nb_images: meta.Nb_images ?? 0,
    Fichiers_liés: meta.Fichiers_liés ?? 0,
    Lien_Google_Doc: false,
    Lien_dossier_Drive: false,
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
    inventoryPath,
    patterns,
    resume = true,
    userAgent,
    timeout,
    delay = 500,
    mode,
  } = options;

  if (mode === "folder") {
    console.error(`[crawl] mode not yet implemented: ${mode}`);
    process.exit(1);
  }

  let urlsToCrawl = urls;
  if (mode === "domain") {
    if (urls.length === 0) {
      console.error("[crawl] domain mode requires at least one seed URL");
      process.exit(1);
    }
    const discovered = await discoverDomainUrls(urls[0], { userAgent, timeout });
    urlsToCrawl = discovered;
    console.log(`[crawl] domain mode: discovered ${discovered.length} URL(s)`);
  }

  // Load the URL set once for O(1) resume checks
  const doneUrls = resume ? await loadDoneUrls(inventoryPath) : new Set<string>();

  // Pre-load injection patterns so they are shared across all pages
  const activePatterns = patterns ?? loadInjectionPatterns();

  // Ensure the output CSV has headers before the first upsert
  if (!existsSync(inventoryPath)) {
    await writeInventory(inventoryPath, []);
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
      await processPage(url, {
        outputDir,
        inventoryPath,
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
