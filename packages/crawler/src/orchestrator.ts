/**
 * orchestrator.ts
 * Ties together the full crawler pipeline into a single crawl() function
 * with resume support via crawl_status column in the inventory CSV.
 *
 * Pipeline per URL:
 *   downloadPage → sanitizeHtml → htmlToText → sanitizeText → extractMetadata
 *   → write .txt → upsertRow (crawl_status='done')
 *
 * URL discovery: parses <a href> links from sanitized HTML, filters to same
 * domain, respects include/exclude regex and maxDepth.
 */

import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { downloadPage } from './downloader.js';
import { sanitizeHtml } from './sanitizer.js';
import { htmlToText } from './html-to-text.js';
import {
  sanitizeText,
  extractMetadata,
  readInventory,
  upsertRow,
  urlToTxtPath,
} from '@fci/shared';
import type { CrawlConfig, InventoryRow } from '@fci/shared';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Compute URL depth as the number of non-empty path segments. */
function urlDepth(url: string): number {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** Extract same-domain <a href> links from sanitized HTML. */
function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const $ = cheerio.load(html);
  const links: string[] = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const resolved = new URL(href, baseUrl);
      // Same domain only
      if (resolved.hostname !== base.hostname) return;
      // HTTP/HTTPS only
      if (!['http:', 'https:'].includes(resolved.protocol)) return;
      // Drop hash and query for dedup purposes; keep just origin + pathname
      resolved.hash = '';
      links.push(resolved.toString());
    } catch {
      // Malformed href — skip
    }
  });

  return links;
}

/** Decide whether a URL should be crawled given the config filters. */
function shouldCrawl(url: string, config: CrawlConfig): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(config.baseUrl);

    if (parsed.hostname !== base.hostname) return false;
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // Skip non-HTML resource extensions
    const ext = path.extname(parsed.pathname).toLowerCase();
    if (
      ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
       '.zip', '.tar', '.gz', '.exe', '.dmg', '.pkg',
       '.mp4', '.mp3', '.wav', '.ogg', '.webm'].includes(ext)
    ) {
      return false;
    }

    if (config.maxDepth !== undefined && urlDepth(url) > config.maxDepth) {
      return false;
    }

    if (config.include && config.include.length > 0) {
      const included = config.include.some(p => new RegExp(p).test(url));
      if (!included) return false;
    }

    if (config.exclude && config.exclude.length > 0) {
      const excluded = config.exclude.some(p => new RegExp(p).test(url));
      if (excluded) return false;
    }

    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Crawl a site from config.baseUrl, processing each discovered URL through
 * the full pipeline and recording results in an inventory CSV.
 *
 * Resume support: when config.resumable is true, URLs whose crawl_status is
 * already 'done' are skipped without re-downloading.
 *
 * @param config - CrawlConfig with baseUrl, outputDir, and optional filters
 */
export async function crawl(config: CrawlConfig): Promise<void> {
  const csvPath = path.join(config.outputDir, '_inventory.csv');

  // Load existing inventory to support resume
  const existingRows = await readInventory(csvPath);
  const doneUrls = new Set(
    config.resumable
      ? existingRows.filter(r => r.crawl_status === 'done').map(r => r.url)
      : []
  );

  // BFS queue — normalized URLs (no hash)
  const normalize = (url: string): string => {
    try {
      const u = new URL(url);
      u.hash = '';
      return u.toString();
    } catch {
      return url;
    }
  };

  const startUrl = normalize(config.baseUrl);
  const visited = new Set<string>(doneUrls);
  const queue: string[] = [startUrl];

  if (!doneUrls.has(startUrl)) {
    visited.add(startUrl);
  }

  while (queue.length > 0) {
    const url = queue.shift()!;

    // Resume: skip already-done URLs
    if (config.resumable && doneUrls.has(url)) {
      console.log(`[orchestrator] Skipping (already done): ${url}`);
      continue;
    }

    console.log(`[orchestrator] Crawling: ${url}`);

    try {
      // Step 1: Download
      const downloadResult = await downloadPage(url, {
        outputDir: path.join(config.outputDir, '.raw'),
      });

      if (!downloadResult.success) {
        throw new Error(downloadResult.error ?? `HTTP ${downloadResult.httpStatus}`);
      }

      // Read raw HTML from disk
      const rawHtml = await fs.readFile(downloadResult.localPath, 'utf8');

      // Step 2: Sanitize HTML
      const cleanHtml = sanitizeHtml(rawHtml);

      // Step 3: Discover links from sanitized HTML before converting to text
      const links = extractLinks(cleanHtml, url);

      // Step 4: Convert to plain text
      const rawText = htmlToText(cleanHtml);

      // Step 5: Filter prompt injections
      const cleanText = sanitizeText(rawText);

      // Step 6: Extract metadata
      const metadata = extractMetadata(rawHtml, url);

      // Step 7: Determine output path and write .txt file
      const txtPath = urlToTxtPath(url, config.outputDir);
      await fs.mkdir(path.dirname(txtPath), { recursive: true });
      await fs.writeFile(txtPath, cleanText, 'utf8');

      // Step 8: Upsert inventory row with crawl_status='done'
      const row: InventoryRow = {
        url,
        local_path: txtPath,
        crawl_status: 'done',
        sync_status: 'pending',
        ai_status: 'pending',
        title: metadata.title,
        word_count: metadata.wordCount,
      };
      await upsertRow(csvPath, row);

      // Clean up raw download
      await fs.unlink(downloadResult.localPath).catch(() => undefined);

      // Enqueue newly discovered links
      for (const link of links) {
        const normalized = normalize(link);
        if (!visited.has(normalized) && shouldCrawl(normalized, config)) {
          visited.add(normalized);
          queue.push(normalized);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[orchestrator] Error crawling ${url}: ${errorMsg}`);

      // Record error in inventory and continue
      const errorRow: InventoryRow = {
        url,
        local_path: '',
        crawl_status: 'error',
        sync_status: 'pending',
        ai_status: 'pending',
      };
      await upsertRow(csvPath, errorRow).catch(e =>
        console.error(`[orchestrator] Failed to record error for ${url}: ${e}`)
      );
    }
  }

  console.log(`[orchestrator] Crawl complete. Visited ${visited.size} URL(s).`);
}
