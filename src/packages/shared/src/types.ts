/**
 * Shared TypeScript types for Full Content Inventory system
 */

/**
 * Configuration for a crawl operation
 */
export interface CrawlConfig {
  /** Base URL to start crawling from */
  baseUrl: string;
  /** Maximum crawl depth (0 = same page only) */
  maxDepth: number;
  /** File path for the inventory CSV output */
  outputPath: string;
  /** Optional: URLs to skip during crawling */
  excludePatterns?: string[];
  /** Optional: Respect robots.txt */
  respectRobotsTxt?: boolean;
  /** Request delay in ms between requests */
  requestDelay?: number;
}

/**
 * Result of crawling a single URL
 */
export interface CrawlResult {
  /** The fully resolved URL */
  url: string;
  /** HTTP status code */
  statusCode: number;
  /** HTTP response headers */
  headers: Record<string, string>;
  /** Raw HTML content */
  html: string;
  /** Final URL after any redirects */
  finalUrl: string;
  /** Depth in the crawl tree */
  depth: number;
  /** Error message if crawl failed */
  error?: string;
}

/**
 * A single row in the content inventory CSV
 */
export interface InventoryRow {
  /** Full URL of the page */
  URL: string;
  /** Final URL after redirects */
  URL_finale?: string;
  /** Page title */
  Titre: string;
  /** Meta description */
  Description: string;
  /** Short summary (max 200 chars) */
  Resume_200_chars: string;
  /** Page type (article, product, category, home, etc.) */
  Type_de_page: string;
  /** URL depth from root */
  Profondeur_URL: number;
  /** Word count */
  Nb_mots: number;
  /** HTTP status code */
  Statut_HTTP: number;
  /** Detected language code (e.g., 'fr', 'en') */
  Langue: string;
  /** Last modified date (ISO format) */
  Date_modifiee: string;
  /** Canonical URL if present */
  Canonical: string;
  /** Whether page has noindex directive */
  Noindex: boolean;
  /** Number of images on the page */
  Nb_images: number;
  /** Number of linked files (PDF, DOC, etc.) */
  Fichiers_liés: number;
  /** Google Doc link (filled by gws-sync) */
  Lien_Google_Doc: string;
  /** Google Drive folder link (filled by gws-sync) */
  Lien_dossier_Drive: string;
  /** Crawl status: 'done' | 'error' | undefined */
  crawl_status?: string;
  /** Sync status: 'done' | 'error' | undefined */
  sync_status?: string;
  /** AI processing status: 'done' | 'error' | undefined */
  ai_status?: string;
}

/**
 * Type representing any column name in the inventory
 */
export type InventoryColumn =
  | 'URL'
  | 'URL_finale'
  | 'Titre'
  | 'Description'
  | 'Resume_200_chars'
  | 'Type_de_page'
  | 'Profondeur_URL'
  | 'Nb_mots'
  | 'Statut_HTTP'
  | 'Langue'
  | 'Date_modifiee'
  | 'Canonical'
  | 'Noindex'
  | 'Nb_images'
  | 'Fichiers_liés'
  | 'Lien_Google_Doc'
  | 'Lien_dossier_Drive'
  | 'crawl_status'
  | 'sync_status'
  | 'ai_status';