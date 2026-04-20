/**
 * metadata.ts
 * Extract page metadata: title, description, language, canonical,
 * noindex, HTTP status, date modified, image count, word count, URL depth.
 * Output maps directly to the _inventory.csv columns.
 */

import * as cheerio from 'cheerio';
import type { PageMetadata } from '@fci/shared';

export interface MetadataExtractionOptions {
  url?: string;
  httpStatus?: number;
  linkedFiles?: string[];
}


/**
 * Extract metadata from raw HTML content.
 */
export function extractMetadata(
  html: string,
  options: MetadataExtractionOptions
): Omit<PageMetadata, 'wordCount'> {
  const { url: pageUrl = '', httpStatus = 200 } = options;
  const $ = cheerio.load(html);

  // Title: prefer <title> tag, fallback to first h1
  const title =
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    '';

  // Description: og:description > description meta > twitter:description
  const description =
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[name="twitter:description"]').attr('content')?.trim() ||
    '';

  // Language: html[lang] > meta http-equiv > og:locale
  const language =
    $('html').attr('lang')?.trim() ||
    $('meta[http-equiv="Content-Language"]').attr('content')?.trim() ||
    $('meta[property="og:locale"]').attr('content')?.trim() ||
    '';

  // Canonical URL
  const canonical =
    $('link[rel="canonical"]').attr('href')?.trim() ||
    $('meta[property="og:url"]').attr('content')?.trim() ||
    pageUrl;

  // Noindex directive
  const robotsMeta = $('meta[name="robots"]').attr('content')?.toLowerCase() || '';
  const noindex = robotsMeta.includes('noindex');

  // Date modified: article:modified_time > og:updated_time > Last-Modified header equivalent
  const dateModified =
    $('meta[property="article:modified_time"]').attr('content')?.trim() ||
    $('meta[property="og:updated_time"]').attr('content')?.trim() ||
    $('meta[name="last-modified"]').attr('content')?.trim() ||
    $('time[datetime]').first().attr('datetime')?.trim() ||
    new Date().toISOString();

  // Image count in original HTML
  const imageCount = $('img').length;
  const linkedFiles = options.linkedFiles ?? [];
  // URL depth
  const urlDepth = getUrlDepth(pageUrl);

  return {
    url: pageUrl,
    title,
    description,
    language,
    canonical,
    noindex,
    httpStatus,
    dateModified,
    imageCount,
    urlDepth,
    linkedFiles,
  };
}

/**
 * Build a full PageMetadata by combining HTML extraction with
 * post-processing data (word count, linked files).
 */
export function buildPageMetadata(
  html: string,
  plainText: string,
  linkedFiles: string[],
  options: MetadataExtractionOptions
): PageMetadata {
  const base = extractMetadata(html, { ...options, url: options.url ?? '' });
  const wordCount = countWords(plainText);

  return {
    ...base,
    wordCount,
    linkedFiles,
  };
}

/**
 * Convert PageMetadata to the CSV row format matching _inventory.csv
 */
export function metadataToInventoryRow(
  metadata: PageMetadata,
  plainText: string
): Record<string, string> {
  // Resume: first 200 chars of plain text
  const resume200Chars = plainText.slice(0, 200).replace(/\s+/g, ' ').trim();

  return {
    URL: metadata.url,
    Titre: metadata.title,
    Description: metadata.description,
    Resume_200_chars: resume200Chars,
    Type_de_page: '',           // Filled by AI summarizer (Plan 3)
    Profondeur_URL: String(metadata.urlDepth),
    Nb_mots: String(metadata.wordCount),
    Statut_HTTP: String(metadata.httpStatus),
    Langue: metadata.language,
    Date_modifiee: metadata.dateModified,
    Canonical: metadata.canonical,
    Noindex: metadata.noindex ? 'oui' : 'non',
    Nb_images: String(metadata.imageCount),
    Fichiers_liés: metadata.linkedFiles.join(' | '),
    Lien_Google_Doc: '',        // Filled by GWS sync (Plan 2)
    Lien_dossier_Drive: '',     // Filled by GWS sync (Plan 2)
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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
