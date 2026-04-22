/**
 * @full-content-inventory/crawler
 *
 * Domain URL discovery — sitemap via robots.txt + BFS fallback.
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
// BFS fallback
// ---------------------------------------------------------------------------

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

    const $ = cheerio.load(html);
    const links = $("a[href]")
      .map((_, el) => $(el).attr("href"))
      .get()
      .filter((href): href is string => typeof href === "string" && href.length > 0);

    for (const href of links) {
      let absolute: string;
      try {
        absolute = new URL(href, url).href;
      } catch {
        continue;
      }

      const linkHost = new URL(absolute).hostname;
      if (linkHost !== seedHostname) continue;
      if (visited.has(absolute)) continue;
      if (!absolute.startsWith("http://") && !absolute.startsWith("https://")) continue;

      queue.push(absolute);
    }
  }

  return found;
}
