#!/usr/bin/env node
import { Command } from 'commander';
import { summarize } from './summarize.js';

const program = new Command();

program
  .name('fci-summarize')
  .description('Classify and summarize crawled pages in _inventory.csv via the Pi SDK.')
  .requiredOption('-i, --inventory <path>', 'Path to _inventory.csv')
  .requiredOption('--provider <name>',     'AI provider (must match ~/.pi/agent/auth.json)')
  .requiredOption('--model <id>',          'AI model ID (must match ~/.pi/agent/auth.json)')
  .option('--no-resume',                   'Re-summarize rows even if ai_status=done');

program.action(async (options) => {
  try {
    await summarize({
      inventoryPath: options.inventory,
      aiProvider:    options.provider,
      aiModelId:      options.model,
      resume:        options.resume,
    });
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
});

program.parse(process.argv);
