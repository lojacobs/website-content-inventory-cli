#!/usr/bin/env node
/**
 * fci - Full Content Inventory CLI root
 *
 * Usage:
 *   fci crawl <url> [options]    - Run the crawler pipeline
 *   fci --help                   - Show help
 *   fci --version                - Show version
 */

import { parseArgs } from 'util';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help: { type: 'boolean', default: false },
    version: { type: 'boolean', default: false },
  },
  allowPositionals: true,
  strict: false,
});

if (values.version) {
  console.log('fci v0.1.0');
  process.exit(0);
}

const subcommand = positionals[0];

if (!subcommand || values.help) {
  console.log(`
fci - Full Content Inventory

COMMANDS
  fci crawl <url> [options]   Crawl a website and produce a content inventory

Run \`fci <command> --help\` for detailed options.
`);
  process.exit(0);
}

switch (subcommand) {
  case 'crawl': {
    // Remove 'crawl' from args and delegate to crawler CLI
    process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];
    await import('@fci/crawler/cli');
    break;
  }
  default:
    console.error(`Unknown command: ${subcommand}`);
    console.error('Run `fci --help` for usage.');
    process.exit(1);
}
