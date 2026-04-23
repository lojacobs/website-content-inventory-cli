#!/usr/bin/env node

/**
 * @full-content-inventory/crawler
 * CLI binary: fci-crawl
 *
 * Usage:
 *   fci-crawl --url <url> --client <name> --project <name> [--output <dir>]
 *   fci-crawl --urls-file <path> --client <name> --project <name> [--output <dir>]
 */

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

import { crawl } from "./crawl.js";
import type { CrawlOptions } from "./crawl.js";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const { values, positionals } = parseArgs({
  options: {
    url: { type: "string", short: "u" },
    "urls-file": { type: "string" },
    client: { type: "string", short: "c" },
    project: { type: "string", short: "p" },
    output: { type: "string", short: "o", default: "./output" },
    "no-resume": { type: "boolean", default: false },
    config: { type: "string" },
    "max-depth": { type: "string" },
    mode: { type: "string" },
    delay: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: false,
  strict: true,
});

const flags = values as Record<string, unknown>;

if (flags.help) {
  // eslint-disable-next-line no-console
  console.log(`Usage: fci-crawl [options]

Options:
  --url <url>              Single URL to crawl (mutually exclusive with --urls-file)
  --urls-file <path>       File with one URL per line (mutually exclusive with --url)
  --client <name>          Client identifier (required)
  --project <name>        Project name (required)
  --output <dir>           Output directory for .txt files and CSV (default: ./output)
  --no-resume              Disable resume mode (re-crawl already processed URLs)
  --config <path>          Injection patterns config file path
  --max-depth <n>          Maximum crawl depth (default: 0)
  --mode <mode>            Crawl mode: domain | folder | page | list (default: page)
  --delay <ms>             Milliseconds between page fetches (default: 500)
  -h, --help               Show this help message

Either --url or --urls-file must be provided (not both, not neither).
Both --client and --project are required.
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const hasUrl = typeof flags.url === "string" && flags.url.length > 0;
const hasUrlsFile = typeof flags["urls-file"] === "string" && (flags["urls-file"] as string).length > 0;

if (!hasUrl && !hasUrlsFile) {
  // eslint-disable-next-line no-console
  console.error("Error: Either --url or --urls-file must be provided.");
  process.exit(1);
}

if (hasUrl && hasUrlsFile) {
  // eslint-disable-next-line no-console
  console.error("Error: --url and --urls-file are mutually exclusive.");
  process.exit(1);
}

const client = flags.client as string | undefined;
const project = flags.project as string | undefined;

if (!client) {
  // eslint-disable-next-line no-console
  console.error("Error: --client is required.");
  process.exit(1);
}

if (!project) {
  // eslint-disable-next-line no-console
  console.error("Error: --project is required.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build URL list
// ---------------------------------------------------------------------------

let urls: string[] = [];

if (hasUrl) {
  urls = [flags.url as string];
} else if (hasUrlsFile) {
  const filePath = flags["urls-file"] as string;
  const fileContent = readFileSync(filePath, "utf-8");
  urls = fileContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

// ---------------------------------------------------------------------------
// Build CrawlOptions
// ---------------------------------------------------------------------------

const outputDir = flags.output as string;

// ---------------------------------------------------------------------------
// Validate mode & delay
// ---------------------------------------------------------------------------

const VALID_MODES = ["domain", "folder", "page", "list"] as const;
const modeRaw = (flags.mode as string | undefined) ?? "page";
if (!VALID_MODES.includes(modeRaw as typeof VALID_MODES[number])) {
  // eslint-disable-next-line no-console
  console.error(`Error: --mode must be one of ${VALID_MODES.join(", ")}. Got: ${modeRaw}`);
  process.exit(1);
}

let delayNum = 500;
if (flags.delay !== undefined) {
  delayNum = Number(flags.delay);
  if (!Number.isInteger(delayNum) || delayNum < 0) {
    // eslint-disable-next-line no-console
    console.error("Error: --delay must be a positive integer (milliseconds).");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Build CrawlOptions
// ---------------------------------------------------------------------------

const crawlOptions: CrawlOptions = {
  outputDir,
  client,
  project,
  patterns: flags.config ? [flags.config as string] : undefined,
  resume: !flags["no-resume"],
  mode: modeRaw as CrawlOptions["mode"],
  delay: delayNum,
};

void positionals;

// ---------------------------------------------------------------------------
// Run crawler
// ---------------------------------------------------------------------------

(async () => {
  try {
    await crawl(urls, crawlOptions);
    // eslint-disable-next-line no-console
    console.log(`Crawled ${urls.length} URL(s) successfully.`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Crawl failed:", err);
    process.exit(1);
  }
})();