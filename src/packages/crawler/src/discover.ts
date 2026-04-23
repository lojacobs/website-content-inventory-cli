/**
 * @full-content-inventory/crawler
 *
 * Domain URL discovery — sitemap via robots.txt + BFS fallback + folder BFS.
 */

import { URL } from "node:url";
import * as cheerio from "cheerio";
import { downloadPage } from "./download.js";

export interface DiscoverOptions {
  /** Custom User-Agent string. */
  userAgent?: string;
  /** Request timeout in seconds. */
  timeout?: number;
}

/**
 * Discover all URLs belonging to the seed URL's domain.
 *
 * Strategy:
 *  1. Fetch {origin}/robots.txt and parse Sitemap: directives.
 *  2. Fetch each sitemap XML; collect <url><loc> entries.
 *     Recurse one level into <sitemapindex> entries.
 *  3. If no URLs are found via sitemap, fall back to BFS
 *     link-following starting from seedUrl (same-hostname only).
 *
 * @param seedUrl  The starting URL (e.g. https://example.com/).
 * @param options  Fetch options (userAgent, timeout).
 * @returns        Deduplicated array of absolute HTTP(S) URLs.
 */
export async function discoverDomainUrls(
  seedUrl: string,
  options: DiscoverOptions = {}
): Promise<string[]> {
  const seed = new URL(seedUrl);
  const seedHostname = seed.hostname;
  const seedOrigin = `${seed.protocol}//${seed.host}`;

  // 1. Sitemap discovery
  const sitemapUrls = await fetchSitemapUrls(seedOrigin, options);
  if (sitemapUrls.length > 0) {
    const pageUrls = await collectSitemapPageUrls(sitemapUrls, options);
    if (pageUrls.length > 0) {
      return [...new Set(pageUrls)];
    }
  }

  // 2. BFS fallback
  return bfsCrawl(seedUrl, seedHostname, options);
}

// ---------------------------------------------------------------------------
// robots.txt → sitemap URLs
// ---------------------------------------------------------------------------

async function fetchSitemapUrls(
  origin: string,
  options: DiscoverOptions
): Promise<string[]> {
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const { html } = await downloadPage(robotsUrl, options);
    const sitemaps: string[] = [];
    for (const line of html.split("\n")) {
      const match = line.match(/^[Ss]itemap:\s*(.+)/);
      if (match) {
        sitemaps.push(match[1].trim());
      }
    }
    return sitemaps;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Sitemap XML parsing
// ---------------------------------------------------------------------------

async function collectSitemapPageUrls(
  sitemapUrls: string[],
  options: DiscoverOptions
): Promise<string[]> {
  const pageUrls: string[] = [];
  const indexUrls: string[] = [];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const { html } = await downloadPage(sitemapUrl, options);
      const $ = cheerio.load(html, { xmlMode: true });

      // Detect sitemapindex (one-level recursion allowed)
      const sitemapIndexLocs = $("sitemapindex > sitemap > loc")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((href) => href.startsWith("http://") || href.startsWith("https://"));

      if (sitemapIndexLocs.length > 0) {
        indexUrls.push(...sitemapIndexLocs);
        continue;
      }

      // Regular urlset
      const locs = $("urlset > url > loc")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((href) => href.startsWith("http://") || href.startsWith("https://"));

      pageUrls.push(...locs);
    } catch {
      // Skip unreadable / unreachable sitemaps
    }
  }

  // Recurse one level into sitemapindex entries
  if (indexUrls.length > 0) {
    const nestedUrls = await collectSitemapPageUrls(indexUrls, options);
    pageUrls.push(...nestedUrls);
  }

  return pageUrls;
}

// ---------------------------------------------------------------------------
// Shared link extraction
// ---------------------------------------------------------------------------

/**
 * Extract all <a href> links from HTML, resolved to absolute HTTP(S) URLs.
 *
 * @param html  Raw HTML string.
 * @param base  Base URL for resolving relative links.
 * @returns     Deduplicated array of absolute HTTP(S) URLs.
 */
export function extractLinks(html: string, base: string): string[] {
  const $ = cheerio.load(html);
  const links = $("a[href]")
    .map((_, el) => $(el).attr("href"))
    .get()
    .filter((href): href is string => typeof href === "string" && href.length > 0);

  const absolute: string[] = [];
  for (const href of links) {
    try {
      const url = new URL(href, base);
      if (url.protocol === "http:" || url.protocol === "https:") {
        absolute.push(url.href);
      }
    } catch {
      // skip invalid URL
    }
  }
  return [...new Set(absolute)];
}

// ---------------------------------------------------------------------------
// Folder prefix derivation
// ---------------------------------------------------------------------------

/**
 * Derive the folder path prefix from a seed URL.
 *
 * Rules:
 *  - URL ending with "/" → use as-is
 *  - Last path segment contains a dot (e.g. `/espace-citoyen/page.html`)
 *    → strip it, use the parent directory → `/espace-citoyen/`
 *  - Otherwise (no trailing slash, no extension, e.g. `/section`)
 *    → treat as folder, append "/" → `/section/`
 *
 * The returned prefix always starts and ends with "/".
 *
 * @param seedUrl  A seed URL.
 * @returns        A path prefix starting and ending with "/".
 */
export function deriveFolderPrefix(seedUrl: string): string {
  const { pathname } = new URL(seedUrl);

  // Already a directory — use as-is
  if (pathname.endsWith("/")) {
    return pathname;
  }

  // Last segment has a dot → strip it, use parent directory
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  if (last.includes(".")) {
    segments.pop();
    const prefix = segments.join("/") + "/";
    return prefix.startsWith("/") ? prefix : "/" + prefix;
  }

  // No extension, no trailing slash → treat as folder, append "/"
  const prefix = pathname + "/";
  return prefix.startsWith("/") ? prefix : "/" + prefix;
}

// ---------------------------------------------------------------------------
// BFS fallback (domain-wide, no folder restriction)
// ---------------------------------------------------------------------------

/**
 * BFS crawl restricted to the same hostname (no folder restriction).
 * Used as the fallback when sitemap discovery yields no results.
 */
async function bfsCrawl(
  seedUrl: string,
  seedHostname: string,
  options: DiscoverOptions
): Promise<string[]> {
  const visited = new Set<string>();
  const queue: string[] = [seedUrl];
  const found: string[] = [];

  while (queue.length > 0) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    let html: string;
    try {
      const result = await downloadPage(url, options);
      html = result.html;
      found.push(url);
    } catch {
      continue;
    }

    const links = extractLinks(html, url);
    for (const link of links) {
      if (visited.has(link)) continue;

      const { hostname } = new URL(link);
      if (hostname !== seedHostname) continue;
      queue.push(link);
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// BFS folder crawl
// ---------------------------------------------------------------------------

/**
 * BFS crawl starting from seedUrl, restricted to the same hostname AND
 * the given folder prefix.
 *
 * @param seedUrl        Starting URL.
 * @param seedHostname   Hostname restriction.
 * @param folderPrefix   Pathname prefix that enqueued URLs must share.
 * @param options        Fetch options.
 * @returns              All discovered URLs within the folder.
 */
async function bfsFolderCrawl(
  seedUrl: string,
  seedHostname: string,
  folderPrefix: string,
  options: DiscoverOptions
): Promise<string[]> {
  const visited = new Set<string>();
  const queue: string[] = [seedUrl];
  const found: string[] = [];

  while (queue.length > 0) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    let html: string;
    try {
      const result = await downloadPage(url, options);
      html = result.html;
      found.push(url);
    } catch {
      continue;
    }

    const links = extractLinks(html, url);
    for (const link of links) {
      if (visited.has(link)) continue;

      const { hostname, pathname } = new URL(link);
      if (hostname !== seedHostname) continue;
      if (!pathname.startsWith(folderPrefix)) continue;

      queue.push(link);
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// Folder URL discovery
// ---------------------------------------------------------------------------

/**
 * Discover all URLs sharing the same hostname and folder prefix as seedUrl.
 *
 * Uses the same BFS fallback strategy as discoverDomainUrls — no sitemap
 * support, because sitemaps are scoped to an entire domain and do not
 * allow filtering by sub-path.
 *
 * @param seedUrl  The starting URL
 *                 (e.g. https://example.com/espace-citoyen/page.html).
 * @param options  Fetch options (userAgent, timeout).
 * @returns        Deduplicated array of absolute HTTP(S) URLs.
 */
export async function discoverFolderUrls(
  seedUrl: string,
  options: DiscoverOptions = {}
): Promise<string[]> {
  const seed = new URL(seedUrl);
  const folderPrefix = deriveFolderPrefix(seedUrl);
  return bfsFolderCrawl(seedUrl, seed.hostname, folderPrefix, options);
}
