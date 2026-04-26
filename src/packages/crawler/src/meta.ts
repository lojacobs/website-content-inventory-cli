/**
 * @full-content-inventory/crawler
 *
 * HTML page metadata extraction utilities
 */

import * as cheerio from "cheerio";

/**
 * Options for metadata extraction
 */
export interface MetaOptions {
  /** URL of the page being parsed (used for URL depth calculation) */
  url: string;
  /** Optional HTTP response headers (for Last-Modified extraction) */
  headers?: Record<string, string>;
}

/**
 * Extracted page metadata
 */
export interface PageMeta {
  /** Page title from <title> tag */
  Titre: string;
  /** Meta description content */
  Description: string;
  /** Page language from <html lang="..."> */
  Langue: string;
  /** Canonical URL from <link rel="canonical"> */
  Canonical: string;
  /** Whether page has noindex directive ('yes' or 'no') */
  Noindex: string;
  /** Number of images on the page */
  Nb_images: number;
  /** Number of linked files (PDF, DOC, XLS, PPT, ZIP) */
  Fichiers_liés: number;
  /** Word count in body text */
  Nb_mots: number;
  /** URL path segment depth from domain */
  Profondeur_URL: number;
  /** Last modified date formatted as YYYYMMDD or 'missing-value' */
  Date_modifiee: string;
}

/**
 * Extract metadata from HTML page content
 *
 * @param html - Raw HTML content of the page
 * @param url - URL of the page being parsed
 * @param headers - Optional HTTP response headers (for Last-Modified)
 * @returns Page metadata object matching InventoryRow fields
 */
export function extractMeta(
  html: string,
  url: string,
  headers?: Record<string, string>
): PageMeta {
  const $ = cheerio.load(html);

  // Extract title
  const Titre = $("title").text().trim();

  // Extract meta description
  const Description = $('meta[name="description"]').attr("content") || "";

  // Extract language from <html lang="...">
  const Langue = $("html").attr("lang") || "";

  // Extract canonical URL
  const Canonical = $('link[rel="canonical"]').attr("href") || "";

  // Check for noindex in robots meta — emit explicit string for CSV serialization
  const robotsContent = $('meta[name="robots"]').attr("content") || "";
  const Noindex = robotsContent.toLowerCase().includes("noindex") ? "yes" : "no";

  // Count images
  const Nb_images = $("img").length;

  // Count links to downloadable files (PDF, DOC, XLS, PPT, ZIP)
  const fileExtensions = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip"];
  let Fichiers_liés = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const lowerHref = href.toLowerCase();
    if (fileExtensions.some((ext) => lowerHref.endsWith(ext))) {
      Fichiers_liés++;
    }
  });

  // Count words in body text
  const bodyText = $("body").text() || "";
  const Nb_mots = bodyText
    .split(/\s+/)
    .filter((word) => word.length > 0).length;

  // Calculate URL depth (count path segments after domain)
  let Profondeur_URL = 0;
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    if (path && path !== "/") {
      // Remove leading slash and split by /
      const segments = path.replace(/^\//, "").split("/").filter(Boolean);
      Profondeur_URL = segments.length;
    }
  } catch {
    Profondeur_URL = 0;
  }

  // Extract Last-Modified from headers
  let Date_modifiee = "missing-value";
  if (headers) {
    const lastModified = headers["last-modified"] || headers["Last-Modified"];
    if (lastModified) {
      try {
        const date = new Date(lastModified);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          Date_modifiee = `${year}${month}${day}`;
        }
      } catch {
        // Keep 'missing-value' if date parsing fails
      }
    }
  }

  return {
    Titre,
    Description,
    Langue,
    Canonical,
    Noindex,
    Nb_images,
    Fichiers_liés,
    Nb_mots,
    Profondeur_URL,
    Date_modifiee,
  };
}