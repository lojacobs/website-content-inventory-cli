#!/usr/bin/env node

/**
 * @full-content-inventory/cli
 * Unified CLI binary: inventory
 *
 * Pipeline: crawl → ai-summarize → gws-sync
 *
 * Usage:
 *   inventory --url <url> --client <name> --project <name> [--output <dir>]
 *   inventory --urls-file <path> --client <name> --project <name> [--output <dir>]
 *   inventory --skip-crawl --inventory <path> --provider <name> --model <id> --folder-id <driveId>
 *   inventory --skip-crawl --skip-summarize --skip-sync
 */

import { Command } from 'commander';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { crawl } from '@full-content-inventory/crawler';
import { summarize } from '@full-content-inventory/ai-summarizer';
import { sync } from '@full-content-inventory/gws-sync';

const program = new Command();

program
  .name('inventory')
  .description('Unified CLI for full-content-inventory: crawl → summarize → sync')
  .option('--url <url>', 'Single URL to crawl')
  .option('--urls-file <path>', 'File with one URL per line')
  .option('--client <name>', 'Client identifier (required for crawl)')
  .option('--project <name>', 'Project name (required for crawl)')
  .option('--output <dir>', 'Output directory', './output')
  .option('--inventory <path>', 'Path to _inventory.csv (auto-derived if crawl runs)')
  .option('--folder-id <driveId>', 'Google Drive folder ID (required for sync)')
  .option('--provider <name>', 'AI provider (required for summarize)')
  .option('--model <id>', 'AI model ID (required for summarize)')
  .option('--mode <mode>', 'Crawl mode: domain|folder|page|list', 'page')
  .option('--delay <ms>', 'Delay between fetches in ms', '500')
  .option('--no-resume', 'Disable resume for all stages')
  .option('--skip-crawl', 'Skip the crawl stage')
  .option('--skip-summarize', 'Skip the AI summarization stage')
  .option('--skip-sync', 'Skip the Google Drive sync stage');

program.action(async (options) => {
  // ---------------------------------------------------------------------------
  // No-op fast path
  // ---------------------------------------------------------------------------
  if (options.skipCrawl && options.skipSummarize && options.skipSync) {
    console.log('[inventory] All stages skipped — nothing to do.');
    process.exit(0);
  }

  // ---------------------------------------------------------------------------
  // Crawl stage
  // ---------------------------------------------------------------------------
  let inventoryPath: string | undefined = options.inventory;

  if (!options.skipCrawl) {
    if (!options.client) {
      console.error('Error: --client is required when crawl is not skipped.');
      process.exit(1);
    }
    if (!options.project) {
      console.error('Error: --project is required when crawl is not skipped.');
      process.exit(1);
    }

    const hasUrl = typeof options.url === 'string' && options.url.length > 0;
    const hasUrlsFile = typeof options.urlsFile === 'string' && options.urlsFile.length > 0;

    if (!hasUrl && !hasUrlsFile) {
      console.error('Error: Either --url or --urls-file is required when crawl is not skipped.');
      process.exit(1);
    }

    if (hasUrl && hasUrlsFile) {
      console.error('Error: --url and --urls-file are mutually exclusive.');
      process.exit(1);
    }

    let urls: string[] = [];
    if (hasUrl) {
      urls = [options.url];
    } else if (hasUrlsFile) {
      const content = readFileSync(options.urlsFile, 'utf-8');
      urls = content
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0 && !line.startsWith('#'));
    }

    const validModes = ['domain', 'folder', 'page', 'list'] as const;
    if (!validModes.includes(options.mode)) {
      console.error(`Error: --mode must be one of ${validModes.join(', ')}.`);
      process.exit(1);
    }

    const delayNum = Number(options.delay);
    if (!Number.isInteger(delayNum) || delayNum < 0) {
      console.error('Error: --delay must be a non-negative integer.');
      process.exit(1);
    }

    await crawl(urls, {
      outputDir: options.output,
      client: options.client,
      project: options.project,
      mode: options.mode as 'domain' | 'folder' | 'page' | 'list',
      delay: delayNum,
      resume: options.resume,
    });

    // Derive inventory path from first URL
    let hostname = 'unknown';
    try {
      hostname = new URL(urls[0]).hostname;
    } catch {
      // fallback already set
    }
    inventoryPath = join(options.output, `${options.client}_${options.project}`, hostname, '_inventory.csv');
  }

  // If crawl was skipped, inventory must be provided
  if (options.skipCrawl && !inventoryPath) {
    console.error('Error: --inventory is required when --skip-crawl is set.');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Summarize stage
  // ---------------------------------------------------------------------------
  if (!options.skipSummarize) {
    if (!options.provider) {
      console.error('Error: --provider is required when summarize is not skipped.');
      process.exit(1);
    }
    if (!options.model) {
      console.error('Error: --model is required when summarize is not skipped.');
      process.exit(1);
    }

    await summarize({
      inventoryPath: inventoryPath!,
      aiProvider: options.provider,
      aiModelId: options.model,
      resume: options.resume,
    });
  }

  // ---------------------------------------------------------------------------
  // Sync stage
  // ---------------------------------------------------------------------------
  if (!options.skipSync) {
    if (!options.folderId) {
      console.error('Error: --folder-id is required when sync is not skipped.');
      process.exit(1);
    }

    await sync({
      inventoryPath: inventoryPath!,
      driveFolderId: options.folderId,
      resume: options.resume,
    });
  }

  console.log('[inventory] Pipeline complete.');
  process.exit(0);
});

program.parseAsync(process.argv).catch((err) => {
  console.error('[inventory] Unhandled error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
