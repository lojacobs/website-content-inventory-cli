#!/usr/bin/env node
/**
 * fci-crawl CLI
 *
 * Thin Commander.js wrapper around the crawl() orchestrator.
 */

import { Command } from 'commander';
import path from 'path';
import type { CrawlConfig } from '@fci/shared';
import { crawl } from './orchestrator.js';

const program = new Command();

program
  .name('fci-crawl')
  .description('Full Content Inventory Crawler — crawl a site and produce a text inventory')
  .version('0.1.0')
  .requiredOption('--url <url>', 'Starting URL to crawl')
  .option('--client <name>', 'Client name (used in default output path)')
  .option('--project <name>', 'Project name (used in default output path)')
  .option('--output <dir>', 'Output directory (default: ./<domain>/)')
  .option('--no-resume', 'Disable resumable mode (default: resumable=true)')
  .option('--max-depth <n>', 'Maximum crawl depth (default: unlimited)', (v) => parseInt(v, 10))
  .option('--include <regex>', 'Include only URLs matching regex (repeatable)', collect, [])
  .option('--exclude <regex>', 'Exclude URLs matching regex (repeatable)', collect, [])
  .action(async (opts) => {
    const rawUrl = opts.url as string;

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      console.error(`Error: Invalid URL: ${rawUrl}`);
      process.exit(1);
    }

    // Default output: ./<domain>/
    const domain = parsedUrl.hostname;
    const outputDir = opts.output
      ? path.resolve(opts.output as string)
      : path.resolve(process.cwd(), domain);

    // --no-resume sets opts.resume = false (Commander boolean negation)
    const resumable = opts.resume !== false;

    const config: CrawlConfig = {
      baseUrl: rawUrl,
      outputDir,
      resumable,
      maxDepth: opts.maxDepth as number | undefined,
      include: (opts.include as string[]).length > 0 ? (opts.include as string[]) : undefined,
      exclude: (opts.exclude as string[]).length > 0 ? (opts.exclude as string[]) : undefined,
    };

    console.log(`\nfci-crawl starting`);
    console.log(`  URL:      ${rawUrl}`);
    console.log(`  Output:   ${outputDir}`);
    console.log(`  Resumable: ${resumable ? 'yes' : 'no'}`);
    if (config.maxDepth !== undefined) console.log(`  Max depth: ${config.maxDepth}`);
    if (config.include) console.log(`  Include:  ${config.include.join(', ')}`);
    if (config.exclude) console.log(`  Exclude:  ${config.exclude.join(', ')}`);
    console.log('');

    await crawl(config);
  });

/** Collector for repeatable options (--include, --exclude). */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

program.parseAsync(process.argv).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
