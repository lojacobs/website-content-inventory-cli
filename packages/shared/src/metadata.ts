/**
 * metadata.ts
 * Extract page metadata from HTML: title, description, lang, canonical,
 * noindex, imageCount, linkedFiles, wordCount, urlDepth.
 * Shared implementation for use across packages.
 */

import * as cheerio from 'cheerio';
import { htmlToText } from './html-to-text.js';
import type { PageMetadata } from './types.js';

const LINKED_FILE_EXTENSIONS = /\.(pdf|docx?|xlsx?|zip)(\?.*)?$/i;

/**
 * Extract metadata from raw HTML content and a page URL.
 */
export function extractMetadata(
  html: string,
  url: string,
  options?: { httpStatus?: number; linkedFiles?: string[] },
): PageMetadata {
  const httpStatus = options?.httpStatus ?? 200;
  const linkedFiles = options?.linkedFiles ?? [];
  const $ = cheerio.load(html);

  // Title: prefer <title> tag, fallback to first h1
  const title =
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    '';

  // Description: <meta name="description"> content
  const description =
    $('meta[name="description"]').attr('content')?.trim() ||
    '';

  // Language: <html lang="...">
  const language =
    $('html').attr('lang')?.trim() ||
    '';

  // Canonical URL: <link rel="canonical" href="...">
  const canonical =
    $('link[rel="canonical"]').attr('href')?.trim() ||
    '';

  // Noindex: <meta name="robots" content="noindex">
  const robotsMeta = $('meta[name="robots"]').attr('content')?.toLowerCase() || '';
  const noindex = robotsMeta.includes('noindex');

  // Image count
  const imageCount = $('img').length;

  // Linked files: use passed-in array if provided, otherwise extract from HTML
  const finalLinkedFiles: string[] = linkedFiles.length > 0
    ? linkedFiles
    : (() => {
        const found: string[] = [];
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href')?.trim() ?? '';
          if (LINKED_FILE_EXTENSIONS.test(href)) {
            found.push(href);
          }
        });
        return found;
      })();

  // Word count via htmlToText
  const plainText = htmlToText(html);
  const wordCount = plainText.trim().split(/\s+/).filter(w => w.length > 0).length;

  // URL depth: number of non-empty path segments
  const urlDepth = getUrlDepth(url);

  // dateModified and httpStatus: defaults for the shared version
  const dateModified =
    $('meta[property="article:modified_time"]').attr('content')?.trim() ||
    $('meta[name="last-modified"]').attr('content')?.trim() ||
    '';

  return {
    url,
    title,
    description,
    language,
    canonical,
    noindex,
    httpStatus,
    dateModified,
    imageCount,
    wordCount,
    urlDepth,
    linkedFiles: finalLinkedFiles,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUrlDepth(url: string): number {
  try {
    const parsed = new URL(url);
    return parsed.pathname
      .split('/')
      .filter(s => s.length > 0 && !/^index\.html?$/.test(s)).length;
  } catch {
    return 0;
  }
}
