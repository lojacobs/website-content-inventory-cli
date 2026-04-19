#!/usr/bin/env node
/**
 * fci-crawl CLI
 *
 * Usage:
 *   fci-crawl <url> [options]
 *
 * Options:
 *   --client <name>          Client name (used in output path)
 *   --project <name>         Project name (used in output path)
 *   --output <dir>           Override output directory (default: ~/tmp/<client>_<project>/<domain>)
 *   --max-depth <n>          Maximum crawl depth
 *   --include <pattern>      URL regex patterns to include (repeatable)
 *   --exclude <pattern>      URL regex patterns to exclude (repeatable)
 *   --injection-config <f>   Path to prompt-injection.conf
 *   --resume                 Resume from existing progress
 *   --no-robots              Ignore robots.txt
 *   --concurrency <n>        Parallel downloads (default: 1)
 *   --help                   Show this help
 *
 * Examples:
 *   fci-crawl https://example.com --client acme --project website
 *   fci-crawl https://example.com/blog/ --client acme --project blog --max-depth 3 --resume
 */

import { parseArgs } from 'util';
import os from 'os';
import path from 'path';
import { processUrl, shouldCrawl } from './pipeline.js';
import { InventoryManager } from './inventory.js';
import { extractLinks } from './sanitizer.js';
import fs from 'fs/promises';
import type { CrawlOptions } from '@fci/shared';
import { extractDomain, getOutputDir } from '@fci/shared';

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      client: { type: 'string' },
      project: { type: 'string' },
      output: { type: 'string' },
      'max-depth': { type: 'string' },
      include: { type: 'string', multiple: true },
      exclude: { type: 'string', multiple: true },
      'injection-config': { type: 'string' },
      resume: { type: 'boolean', default: false },
      'no-robots': { type: 'boolean', default: false },
      concurrency: { type: 'string', default: '1' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help || positionals.length === 0) {
    printHelp();
    process.exit(0);
  }

  const startUrl = positionals[0];

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(startUrl);
  } catch {
    console.error(`Error: Invalid URL: ${startUrl}`);
    process.exit(1);
  }

  const clientName = values.client || 'client';
  const projectName = values.project || 'project';
  const domain = extractDomain(startUrl);

  const outputDir = values.output
    ? path.resolve(values.output)
    : getOutputDir(clientName, projectName, domain);

  const crawlOptions: CrawlOptions = {
    url: startUrl,
    clientName,
    projectName,
    outputDir,
    resume: values.resume ?? false,
    promptInjectionConfig: values['injection-config'],
    maxDepth: values['max-depth'] ? parseInt(values['max-depth'] as string, 10) : undefined,
    include: values.include as string[] | undefined,
    exclude: values.exclude as string[] | undefined,
  };

  console.log(`\nfci-crawl starting`);
  console.log(`  URL:    ${startUrl}`);
  console.log(`  Output: ${outputDir}`);
  console.log(`  Resume: ${crawlOptions.resume ? 'yes' : 'no'}`);
  console.log('');

  const inventory = new InventoryManager(outputDir);
  await inventory.init();

  // Load already-crawled URLs for resume support
  const crawled = crawlOptions.resume ? await inventory.getCrawledUrls() : new Set<string>();

  // BFS crawl queue
  const queue: string[] = [startUrl];
  const visited = new Set<string>([...crawled]);
  const toVisit = new Set<string>([startUrl]);

  let successCount = 0;
  let failCount = 0;

  while (queue.length > 0) {
    const url = queue.shift()!;

    if (crawled.has(url)) {
      console.log(`  [skip]  ${url} (already crawled)`);
      continue;
    }

    console.log(`  [crawl] ${url}`);

    try {
      const result = await processUrl(url, {
        crawlOptions,
        promptInjectionConfigPath: crawlOptions.promptInjectionConfig,
        inventory,
        downloaderOptions: {
          outputDir: path.join(outputDir, '.raw'),
          respectRobots: !values['no-robots'],
        },
      });

      if (result.success) {
        successCount++;
        console.log(`  [ok]    ${url} -> ${result.textPath}`);

        // Read saved text to extract links for further crawling
        try {
          const textContent = await fs.readFile(result.textPath, 'utf8');
          // Re-read the raw HTML to get links (already cleaned up, use result links from metadata)
          const newLinks = result.metadata.linkedFiles || [];
          for (const link of newLinks) {
            if (!visited.has(link) && shouldCrawl(link, startUrl, crawlOptions)) {
              visited.add(link);
              queue.push(link);
            }
          }
        } catch {
          // Non-fatal: can't extract more links
        }
      } else {
        failCount++;
        console.warn(`  [fail]  ${url}: ${result.error}`);
      }
    } catch (err) {
      failCount++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [error] ${url}: ${msg}`);
    }
  }

  console.log('');
  console.log(`Crawl complete.`);
  console.log(`  Succeeded: ${successCount}`);
  console.log(`  Failed:    ${failCount}`);
  console.log(`  Inventory: ${inventory.path}`);
  console.log('');
}

function printHelp() {
  console.log(`
fci-crawl - Full Content Inventory Crawler

USAGE
  fci-crawl <url> [options]

OPTIONS
  --client <name>          Client name (used in output path)
  --project <name>         Project name (used in output path)
  --output <dir>           Override output directory
                           Default: ~/tmp/<client>_<project>/<domain>
  --max-depth <n>          Maximum crawl depth (default: unlimited)
  --include <pattern>      Include only URLs matching regex (repeatable)
  --exclude <pattern>      Exclude URLs matching regex (repeatable)
  --injection-config <f>   Path to prompt-injection.conf
  --resume                 Resume from existing progress
  --no-robots              Ignore robots.txt restrictions
  --concurrency <n>        Parallel downloads (default: 1)
  --help                   Show this help message

EXAMPLES
  fci-crawl https://example.com \\
    --client acme \\
    --project website

  fci-crawl https://example.com/blog/ \\
    --client acme \\
    --project blog \\
    --max-depth 3 \\
    --resume

  fci-crawl https://example.com \\
    --exclude '/tag/' \\
    --exclude '/author/' \\
    --injection-config ./prompt-injection.conf

OUTPUT STRUCTURE
  ~/tmp/<client>_<project>/<domain>/
    _inventory.csv      - Crawl inventory (compatible with Google Sheets)
    homepage.txt        - Root page text
    <path/to/page>.txt  - Nested page texts
`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
