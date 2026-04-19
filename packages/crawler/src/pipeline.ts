/**
 * pipeline.ts
 * Orchestrates the full crawler pipeline for a single URL:
 * download -> sanitize -> filter injections -> convert to text -> extract metadata -> save
 */

import fs from 'fs/promises';
import path from 'path';
import { downloadPage, type DownloaderOptions } from './downloader.js';
import { sanitizeHtml, countImages, extractLinks } from './sanitizer.js';
import { filterPromptInjections } from './prompt-injection-filter.js';
import { htmlToText } from './html-to-text.js';
import { buildPageMetadata } from './metadata.js';
import { InventoryManager } from './inventory.js';
import { urlToLocalPath, extractDomain } from '@fci/shared';
import type { PageResult, CrawlOptions } from '@fci/shared';

export interface PipelineOptions {
  crawlOptions: CrawlOptions;
  promptInjectionConfigPath?: string;
  downloaderOptions?: Partial<DownloaderOptions>;
  inventory: InventoryManager;
}

/**
 * Process a single URL through the full pipeline.
 */
export async function processUrl(
  url: string,
  options: PipelineOptions
): Promise<PageResult> {
  const { crawlOptions, promptInjectionConfigPath, downloaderOptions = {}, inventory } = options;
  const domain = extractDomain(crawlOptions.url);
  const outputDir = crawlOptions.outputDir;

  // Step 1: Download
  const downloadResult = await downloadPage(url, {
    outputDir: path.join(outputDir, '.raw'),
    ...downloaderOptions,
  });

  if (!downloadResult.success) {
    return {
      url,
      localPath: '',
      textPath: '',
      metadata: {
        url,
        title: '',
        description: '',
        language: '',
        canonical: url,
        noindex: false,
        httpStatus: downloadResult.httpStatus,
        dateModified: new Date().toISOString(),
        imageCount: 0,
        wordCount: 0,
        urlDepth: 0,
        linkedFiles: [],
      },
      success: false,
      error: downloadResult.error,
    };
  }

  // Read downloaded HTML
  const rawHtml = await fs.readFile(downloadResult.localPath, 'utf8');

  // Step 2: Sanitize HTML
  const sanitizedHtml = sanitizeHtml(rawHtml, { keepImages: true, keepLinks: true });

  // Step 3: Extract links (before further stripping)
  const links = extractLinks(sanitizedHtml, url);
  const imageCount = countImages(sanitizedHtml);

  // Step 4: Convert to plain text
  const rawText = htmlToText(sanitizedHtml, {
    keepLinks: false,
    keepImageAlt: true,
  });

  // Step 5: Filter prompt injections
  const filterResult = await filterPromptInjections(rawText, {
    configPath: promptInjectionConfigPath,
  });

  if (filterResult.hasInjections) {
    console.warn(
      `[pipeline] Prompt injection detected in ${url}: ${filterResult.detectedPatterns.join(', ')}`
    );
  }

  const cleanText = filterResult.text;

  // Step 6: Extract metadata from original HTML
  const metadata = buildPageMetadata(rawHtml, cleanText, links, {
    url,
    httpStatus: downloadResult.httpStatus,
  });
  // Override image count with post-sanitization count
  metadata.imageCount = imageCount;

  // Step 7: Determine output text file path (respecting naming conventions)
  const relativePath = urlToLocalPath(url, domain);
  const textPath = path.join(outputDir, relativePath);

  // Ensure directory exists
  await fs.mkdir(path.dirname(textPath), { recursive: true });

  // Step 8: Write clean text
  await fs.writeFile(textPath, cleanText, 'utf8');

  // Step 9: Record in inventory
  await inventory.append(metadata, cleanText);

  // Clean up raw download to save disk space
  await fs.unlink(downloadResult.localPath).catch(() => undefined);

  return {
    url,
    localPath: downloadResult.localPath,
    textPath,
    metadata,
    success: true,
  };
}

/**
 * Determine if a URL should be crawled based on include/exclude patterns
 * and domain matching.
 */
export function shouldCrawl(
  url: string,
  baseUrl: string,
  options: Pick<CrawlOptions, 'include' | 'exclude' | 'maxDepth'>
): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);

    // Stay on same domain
    if (parsed.hostname !== base.hostname) return false;

    // Only HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // Skip non-HTML resource extensions
    const ext = path.extname(parsed.pathname).toLowerCase();
    if (['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
         '.zip', '.tar', '.gz', '.exe', '.dmg', '.pkg',
         '.mp4', '.mp3', '.wav', '.ogg', '.webm'].includes(ext)) {
      return false;
    }

    const depth = parsed.pathname
      .split('/')
      .filter(s => s.length > 0).length;

    if (options.maxDepth !== undefined && depth > options.maxDepth) return false;

    // Include patterns
    if (options.include && options.include.length > 0) {
      const included = options.include.some(p => new RegExp(p).test(url));
      if (!included) return false;
    }

    // Exclude patterns
    if (options.exclude && options.exclude.length > 0) {
      const excluded = options.exclude.some(p => new RegExp(p).test(url));
      if (excluded) return false;
    }

    return true;
  } catch {
    return false;
  }
}
