/**
 * Shared types for full-content-inventory
 */

/** Inventory record matching the _inventory.csv format */
export interface InventoryRecord {
  url: string;
  title: string;
  description: string;
  resume200Chars: string;
  pageType: string;
  urlDepth: number;
  wordCount: number;
  httpStatus: number;
  language: string;
  dateModified: string;
  canonical: string;
  noindex: boolean;
  imageCount: number;
  linkedFiles: string;
  googleDocLink: string;
  driveFolderLink: string;
}

/** Options for the crawl command */
export interface CrawlOptions {
  url: string;
  clientName: string;
  projectName: string;
  outputDir: string;
  /** Resume from existing progress */
  resume?: boolean;
  /** Custom prompt-injection config file path */
  promptInjectionConfig?: string;
  /** Maximum crawl depth (default: unlimited) */
  maxDepth?: number;
  /** Only crawl these URL patterns */
  include?: string[];
  /** Exclude these URL patterns */
  exclude?: string[];
}

/** Result of downloading and processing a single page */
export interface PageResult {
  url: string;
  localPath: string;
  textPath: string;
  metadata: PageMetadata;
  success: boolean;
  error?: string;
}

/** Extracted metadata from a page */
export interface PageMetadata {
  url: string;
  title: string;
  description: string;
  language: string;
  canonical: string;
  noindex: boolean;
  httpStatus: number;
  dateModified: string;
  imageCount: number;
  wordCount: number;
  urlDepth: number;
  linkedFiles: string[];
}

/** Crawl progress state for resume support */
export interface CrawlProgress {
  startedAt: string;
  options: CrawlOptions;
  completed: string[];
  failed: string[];
  pending: string[];
}

/** Status values for crawl/sync/ai pipeline stages */
export type PipelineStatus = 'pending' | 'done' | 'error';

/** Single row in the inventory CSV — tracks all pipeline stages */
export interface InventoryRow {
  url: string;
  local_path: string;
  crawl_status: PipelineStatus;
  sync_status: PipelineStatus;
  ai_status: PipelineStatus;
  doc_id?: string;
  sheet_id?: string;
  title?: string;
  word_count?: number;
  page_type?: string;
  summary?: string;
  // Metadata fields populated by the crawler
  description?: string;
  http_status?: number;
  language?: string;
  date_modified?: string;
  canonical?: string;
  noindex?: boolean;
  image_count?: number;
  linked_files?: string;
}

/** Configuration for the crawl stage */
export interface CrawlConfig {
  baseUrl: string;
  outputDir: string;
  maxDepth?: number;
  include?: string[];
  exclude?: string[];
  resumable?: boolean;
}

/** Configuration for the Google Drive sync stage */
export interface SyncConfig {
  inventoryPath: string;
  driveRootFolderId: string;
  clientName: string;
  projectName: string;
}

/** Configuration for the AI summarization stage */
export interface SummarizeConfig {
  inventoryPath: string;
  provider?: string;
  model?: string;
  maxConcurrency?: number;
}
