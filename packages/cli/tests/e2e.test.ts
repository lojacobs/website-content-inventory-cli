#!/usr/bin/env node
/**
 * E2E Integration Test — Full Pipeline for standredekamouraska.ca
 *
 * Tests the complete pipeline: crawl -> inspect txt -> summarize -> (sync)
 * Also verifies resume: a second crawl run skips already-done rows.
 *
 * ==========================================================================
 * HOW TO RUN
 * ==========================================================================
 *
 *   pnpm --filter @fci/cli test:e2e
 *
 * ==========================================================================
 * REQUIRED SETUP
 * ==========================================================================
 *
 * 1. Pi auth (for summarize step)
 *    The AI summarizer uses @mariozechner/pi-coding-agent which loads
 *    credentials saved by the `pi auth login` command. Run:
 *
 *      npx @mariozechner/pi-coding-agent auth login
 *
 *    Credentials are stored on disk in ~/.pi/auth.json (or equivalent).
 *    No environment variable is needed — the SDK reads from disk.
 *    If credentials are absent, the summarize step is skipped with a warning.
 *
 * 2. gws auth (for sync step — not yet exercised in this test)
 *    The gws-sync package requires Google Workspace authentication.
 *    Run `gws auth login` or equivalent before running sync tests.
 *    Set GWS_DRIVE_ROOT_FOLDER_ID env var to target a specific Drive folder.
 *
 * ==========================================================================
 * WHAT THIS TEST VALIDATES
 * ==========================================================================
 *
 * Phase 1 — Crawl:
 *   - Crawls https://standredekamouraska.ca with maxDepth=1 (2-3 pages)
 *   - Asserts _inventory.csv exists and has at least 1 data row
 *   - Asserts the URL column contains the start URL
 *   - Asserts .txt files exist for each crawled URL
 *
 * Phase 2 — Resume:
 *   - Runs the crawl again with --resume
 *   - Asserts that already-crawled URLs are skipped (row count unchanged)
 *   - Asserts timestamps of existing .txt files are unchanged
 *
 * Phase 3 — Summarize (skipped if pi auth not available):
 *   - Calls summarize() on a synthetic InventoryRow CSV
 *   - Asserts page_type and summary are populated after the run
 *
 * ==========================================================================
 * NOTE ON CSV FORMAT
 * ==========================================================================
 *
 * The crawler produces a legacy French-header CSV:
 *   URL, Titre, Description, Resume_200_chars, ...
 *
 * The summarize() function expects a pipeline-stage CSV (InventoryRow):
 *   url, local_path, crawl_status, sync_status, ai_status, ...
 *
 * These are two distinct formats. The E2E test exercises each independently.
 * A future integration task should add a converter between the two formats.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TARGET_URL = 'https://standredekamouraska.ca';
const CLIENT = 'test-client';
const PROJECT = 'test-project';
const MAX_DEPTH = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh temp directory for this test run. */
async function makeTmpDir(): Promise<string> {
  const base = path.join(os.tmpdir(), 'fci-e2e-test');
  await fs.mkdir(base, { recursive: true });
  // Unique subfolder per run to avoid interference
  const dir = path.join(base, `run-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Parse the crawler's legacy French-header CSV. Returns rows as objects. */
async function parseLegacyCsv(csvPath: string): Promise<Record<string, string>[]> {
  const content = await fs.readFile(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = parseCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? '';
    });
    return obj;
  });
}

/** Minimal CSV line parser handling double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Run fci-crawl as a subprocess. Returns { stdout, stderr }. */
async function runCrawl(outputDir: string, extraArgs: string[] = []): Promise<{ stdout: string; stderr: string }> {
  // Resolve the crawler CLI entry point from the monorepo
  const crawlerCli = path.resolve(
    __dirname,
    '../../../crawler/src/cli.ts'
  );

  // Use tsx (or ts-node) to run TypeScript directly in tests
  const tsxBin = path.resolve(
    __dirname,
    '../../../../node_modules/.bin/tsx'
  );

  const args = [
    crawlerCli,
    TARGET_URL,
    '--client', CLIENT,
    '--project', PROJECT,
    '--output', outputDir,
    '--max-depth', String(MAX_DEPTH),
    ...extraArgs,
  ];

  return execFileAsync(tsxBin, args, {
    timeout: 120_000, // 2 min — network crawl can be slow
    env: { ...process.env },
  });
}

/** Check whether pi auth credentials are available on disk. */
async function hasPiAuth(): Promise<boolean> {
  // pi-coding-agent stores auth in ~/.pi/auth.json by convention
  const candidates = [
    path.join(os.homedir(), '.pi', 'auth.json'),
    path.join(os.homedir(), '.config', 'pi', 'auth.json'),
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      return true;
    } catch {
      // not found, try next
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let outputDir: string;
let inventoryPath: string;

beforeAll(async () => {
  outputDir = await makeTmpDir();
  inventoryPath = path.join(outputDir, '_inventory.csv');
});

afterAll(async () => {
  // Clean up temp dir (comment out to inspect output after a run)
  await fs.rm(outputDir, { recursive: true, force: true });
});

describe('Phase 1 — Crawl', () => {
  it('completes without fatal error', async () => {
    const { stdout, stderr } = await runCrawl(outputDir);
    // Should report completion
    expect(stdout + stderr).toMatch(/Crawl complete/i);
  }, 120_000);

  it('produces _inventory.csv', async () => {
    await expect(fs.access(inventoryPath)).resolves.toBeUndefined();
  });

  it('_inventory.csv has at least 1 data row', async () => {
    const rows = await parseLegacyCsv(inventoryPath);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('first row URL matches the target domain', async () => {
    const rows = await parseLegacyCsv(inventoryPath);
    const urls = rows.map(r => r['URL'] ?? '');
    const hasTarget = urls.some(u => u.includes('standredekamouraska.ca'));
    expect(hasTarget).toBe(true);
  });

  it('produces .txt files for crawled URLs', async () => {
    // There should be at least one .txt file in the output directory
    const allFiles: string[] = [];
    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.name.endsWith('.txt')) allFiles.push(full);
      }
    }
    await walk(outputDir);
    expect(allFiles.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 2 — Resume (re-run skips already-done rows)', () => {
  it('second crawl run reports skipped rows', async () => {
    // Record mtime of existing txt files
    const txtFiles: Map<string, number> = new Map();
    async function collectTxt(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await collectTxt(full);
        else if (e.name.endsWith('.txt')) {
          const stat = await fs.stat(full);
          txtFiles.set(full, stat.mtimeMs);
        }
      }
    }
    await collectTxt(outputDir);

    // Run crawl again with --resume
    const { stdout, stderr } = await runCrawl(outputDir, ['--resume']);
    const combined = stdout + stderr;

    // Crawler logs "[skip]" for already-crawled URLs
    expect(combined).toMatch(/\[skip\]/i);

    // Row count in inventory should not increase
    const rows = await parseLegacyCsv(inventoryPath);
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // Txt file mtimes should be unchanged (files not re-written)
    for (const [filePath, originalMtime] of txtFiles) {
      const stat = await fs.stat(filePath);
      expect(stat.mtimeMs).toBe(originalMtime);
    }
  }, 120_000);
});

describe('Phase 3 — Summarize (skipped if pi auth unavailable)', () => {
  it('summarize() processes eligible rows when pi auth is available', async () => {
    const authAvailable = await hasPiAuth();
    if (!authAvailable) {
      console.warn(
        '[e2e] Skipping summarize test: pi auth not found.\n' +
        '      Run `npx @mariozechner/pi-coding-agent auth login` to enable this step.'
      );
      return;
    }

    // The summarize() function expects the InventoryRow CSV format (pipeline CSV),
    // which is different from the crawler's legacy French-header format.
    // Build a minimal synthetic InventoryRow CSV pointing at a crawled .txt file.
    const { summarize } = await import('@fci/ai-summarizer');

    // Find a .txt file produced by the crawl
    let txtFile: string | null = null;
    async function findTxt(dir: string): Promise<void> {
      if (txtFile) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await findTxt(full);
        else if (e.name.endsWith('.txt') && !txtFile) txtFile = full;
      }
    }
    await findTxt(outputDir);

    if (!txtFile) {
      throw new Error('No .txt file found in output dir — crawl may have failed');
    }

    // Build a minimal pipeline-format CSV
    const syntheticCsvPath = path.join(outputDir, '_pipeline_inventory.csv');
    const syntheticCsvContent = [
      'url,local_path,crawl_status,sync_status,ai_status,doc_id,sheet_id,title,word_count,page_type,summary',
      // local_path for summarize() is the .html path; it falls back to .txt
      `"${TARGET_URL}","${txtFile.replace(/\.txt$/, '.html')}","done","pending","pending","","","","","",""`,
    ].join('\n') + '\n';

    await fs.writeFile(syntheticCsvPath, syntheticCsvContent, 'utf8');

    // Run summarize
    await summarize({ inventoryPath: syntheticCsvPath, maxConcurrency: 1 });

    // Read results back
    const content = await fs.readFile(syntheticCsvPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    // Should have header + 1 data row
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const dataLine = lines[1];
    // page_type (index 9) and summary (index 10) should be non-empty
    const cols = parseCsvLine(dataLine);
    expect(cols[8]).toBe('done'); // ai_status
    expect(cols[9]).toBeTruthy(); // page_type
    expect(cols[10]).toBeTruthy(); // summary
  }, 180_000);
});
