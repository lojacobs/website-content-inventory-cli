/**
 * @fci/crawler - Web crawler pipeline for full-content-inventory
 *
 * Exports the full crawler pipeline:
 * - downloader: wget-based HTML fetcher with safety checks
 * - sanitizer: HTML cleanup removing scripts, nav, ads
 * - prompt-injection-filter: Remove LLM injection patterns
 * - html-to-text: Convert sanitized HTML to plain text
 * - metadata: Extract title, description, and inventory fields
 * - inventory: Manage _inventory.csv
 * - pipeline: Orchestrate the full per-URL pipeline
 */

export * from './downloader.js';
export * from './sanitizer.js';
export * from './prompt-injection-filter.js';
export * from './html-to-text.js';
export * from './metadata.js';
export * from './inventory.js';
export * from './pipeline.js';
export * from './orchestrator.js';
