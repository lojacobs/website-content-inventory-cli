/**
 * @full-content-inventory/crawler
 *
 * Crawler orchestrator — coordinates download → metadata → sanitization →
 * text conversion → injection detection → file write → CSV upsert.
 */

import { join, relative } from "node:path";
import { existsSync } from "node:fs";

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
  ensureDirForFile,
  urlToFilename,
  type InventoryRow,
} from "@full-content-inventory/shared";

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
  const { html, statusCode, lastModified, finalUrl, contentType } = await downloadPage(url, downloadOptions);

  // 2. Extract metadata (for non-HTML, body is still parseable by cheerio for links/img counts)
  const headers = lastModified ? { "last-modified": lastModified } : undefined;
  const meta: PageMeta = extractMeta(html, url, headers);

  // 3–6 only apply to HTML content
  const isHtml = contentType.toLowerCase().startsWith("text/html");
  const filename = urlToFilename(url);

  if (isHtml) {
    // 3. Sanitize HTML (remove nav, scripts, footers, etc.)
    const sanitizedHtml = sanitizeHtml(html);

    // 4. Convert sanitized HTML → plain text
    const rawText = htmlToText(sanitizedHtml);

    // 5. Detect / sanitize prompt-injection artefacts
    const cleanText = sanitizeText(rawText, patterns);

    // 6. Write .txt file
    const txtPath = join(domainDir, filename);
    await ensureDirForFile(txtPath);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(txtPath, cleanText, "utf-8");
  } else {
    console.log(`[crawl] ◇ skipped txt  ${url}  (${contentType})`);
  }

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
    Noindex: meta.Noindex ?? "no",
    Nb_images: meta.Nb_images ?? 0,
    Fichiers_liés: meta.Fichiers_liés ?? 0,
    Lien_Google_Doc: "",
    Lien_dossier_Drive: "",
    crawl_status: "done",
    URL_finale: finalUrl !== url ? finalUrl : undefined,
  };

  // 8. Upsert CSV row
  await upsertRow(inventoryPath, inventoryRow, "URL");

  const logPath = isHtml
    ? relative(outputDir, join(domainDir, filename))
    : `${contentType} → skipped txt`;
  console.log(`[crawl] ✓ processed  ${url}  →  ${logPath}`);
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

  // Derive the output base domain (hostname) from the seed URL's origin.
  // This is used to compute the inventory path and must match what processPage()
  // computes internally from each URL — otherwise resume and CSV upserts break.
  let domain = "";
  let urlsToCrawl = urls;
  if (urls.length === 0) {
    console.error("[crawl] at least one seed URL is required");
    process.exit(1);
  }
  try {
    domain = new URL(urls[0]).hostname;
  } catch {
    console.error("[crawl] invalid seed URL — cannot extract hostname");
    process.exit(1);
  }

  if (mode === "domain") {
    const discovered = await discoverDomainUrls(urls[0], { userAgent, timeout });
    urlsToCrawl = discovered;
    console.log(`[crawl] domain mode: discovered ${discovered.length} URL(s)`);
  }

  if (mode === "folder") {
    const discovered = await discoverFolderUrls(urls[0], { userAgent, timeout });
    urlsToCrawl = discovered;
    console.log(`[crawl] folder mode: discovered ${discovered.length} URL(s)`);
  }

  // Load the URL set once for O(1) resume checks.
  // Uses the same path as processPage() so resume correctly skips already-crawled URLs.
  const resolvedInventoryPath = join(outputDir, `${client}_${project}`, domain, "_inventory.csv");
  const doneUrls = resume ? await loadDoneUrls(resolvedInventoryPath) : new Set<string>();

  // Pre-load injection patterns so they are shared across all pages
  const activePatterns = patterns ?? loadInjectionPatterns();

  // Ensure the output CSV has headers before the first upsert.
  // Parent directories are created here so that writeInventory() (which does
  // not create dirs) never crashes on a missing parent directory.
  if (!existsSync(resolvedInventoryPath)) {
    await ensureDirForFile(resolvedInventoryPath);
    await writeInventory(resolvedInventoryPath, []);
  }

  let processed = 0;
  let skipped = 0;
  let first = true;

  for (const url of urlsToCrawl) {
    const normalized = stripHash(url);
    if (resume && doneUrls.has(normalized)) {
      console.log(`[crawl] ↷ skip (done)  ${normalized}`);
      skipped++;
      continue;
    }

    if (!first && delay > 0) {
      await sleep(delay);
    }
    first = false;

    try {
      await processPage(normalized, domain, {
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

/** Strip the fragment (#...) from a URL. Returns the URL unchanged on failure. */
function stripHash(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}

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
