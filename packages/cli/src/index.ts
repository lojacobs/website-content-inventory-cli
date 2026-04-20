#!/usr/bin/env node
/**
 * fci - Full Content Inventory root CLI
 *
 * Wires crawl / sync / summarize as sub-commands via Commander.js.
 */

import { Command } from 'commander';
import { crawl } from '@fci/crawler';
import { sync } from '@fci/gws-sync';
import { summarize } from '@fci/ai-summarizer';

const program = new Command();

program
  .name('fci')
  .description('Full Content Inventory — crawl, sync, and summarize website content')
  .version('0.1.0');

// ---------------------------------------------------------------------------
// fci crawl
// ---------------------------------------------------------------------------
program
  .command('crawl')
  .description('Crawl a website and produce a content inventory')
  .requiredOption('--url <url>', 'Base URL to crawl')
  .requiredOption('--output <dir>', 'Output directory for crawl results')
  .option('--client <name>', 'Client name (metadata only)')
  .option('--project <name>', 'Project name (metadata only)')
  .option('--no-resume', 'Disable resume (re-crawl already-done URLs)')
  .option('--max-depth <n>', 'Maximum crawl depth', (v) => parseInt(v, 10))
  .option('--include <patterns...>', 'Only crawl URLs matching these regex patterns')
  .option('--exclude <patterns...>', 'Skip URLs matching these regex patterns')
  .action(async (opts) => {
    await crawl({
      baseUrl: opts.url,
      outputDir: opts.output,
      maxDepth: opts.maxDepth,
      include: opts.include,
      exclude: opts.exclude,
      resumable: opts.resume !== false,
    });
  });

// ---------------------------------------------------------------------------
// fci sync
// ---------------------------------------------------------------------------
program
  .command('sync')
  .description('Sync crawl output to Google Drive')
  .requiredOption('--inventory <path>', 'Path to _inventory.csv')
  .requiredOption('--drive-folder <id>', 'Google Drive root folder ID')
  .requiredOption('--client <name>', 'Client name')
  .requiredOption('--project <name>', 'Project name')
  .action(async (opts) => {
    await sync({
      inventoryPath: opts.inventory,
      driveRootFolderId: opts.driveFolder,
      clientName: opts.client,
      projectName: opts.project,
    });
  });

// ---------------------------------------------------------------------------
// fci summarize
// ---------------------------------------------------------------------------
program
  .command('summarize')
  .description('AI-summarize crawled pages in the inventory')
  .requiredOption('--inventory <path>', 'Path to _inventory.csv')
  .option('--concurrency <n>', 'Number of pages to process in parallel', (v) => parseInt(v, 10), 3)
  .action(async (opts) => {
    await summarize({
      inventoryPath: opts.inventory,
      maxConcurrency: opts.concurrency,
    });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
