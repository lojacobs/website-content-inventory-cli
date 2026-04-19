#!/usr/bin/env node
/**
 * cli.ts
 * fci-summarize — CLI entry point for the AI summarization pipeline.
 *
 * Usage:
 *   fci-summarize --inventory <path> [--concurrency <n>]
 */

import { Command } from 'commander';
import { summarize } from './summarize.js';

const program = new Command();

program
  .name('fci-summarize')
  .description('Run AI classification and summarization over a content inventory CSV')
  .requiredOption('--inventory <path>', 'Path to the inventory CSV file')
  .option('--concurrency <n>', 'Max parallel rows to process at once', '3')
  .action(async (opts: { inventory: string; concurrency: string }) => {
    const maxConcurrency = parseInt(opts.concurrency, 10);
    if (isNaN(maxConcurrency) || maxConcurrency < 1) {
      console.error('Error: --concurrency must be a positive integer');
      process.exit(1);
    }

    await summarize({
      inventoryPath: opts.inventory,
      maxConcurrency,
    });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
