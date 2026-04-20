/**
 * summarize.ts
 * Orchestrator: reads inventory CSV, runs classify + summary in parallel
 * for each eligible row, and upserts results back to CSV.
 */

import fs from 'fs/promises';
import path from 'path';
import { stringify } from 'csv-stringify/sync';
import type { SummarizeConfig, InventoryRow, PipelineStatus } from '@fci/shared';
import {
  buildRunPrompt,
  PAGE_TYPE_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildPageTypeUserContent,
  buildSummaryUserContent,
} from './index.js';

const CSV_HEADERS: (keyof InventoryRow)[] = [
  'url',
  'local_path',
  'crawl_status',
  'sync_status',
  'ai_status',
  'doc_id',
  'sheet_id',
  'title',
  'word_count',
  'page_type',
  'summary',
];

/** Parse a CSV file into an array of InventoryRow objects. */
async function readInventoryCsv(csvPath: string): Promise<InventoryRow[]> {
  const content = await fs.readFile(csvPath, 'utf8');
  const lines = content.split('\n');
  if (lines.length === 0) return [];

  const header = parseCSVLine(lines[0]);
  const rows: InventoryRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    header.forEach((col, idx) => {
      row[col] = values[idx] ?? '';
    });
    rows.push({
      url: row['url'] ?? '',
      local_path: row['local_path'] ?? '',
      crawl_status: (row['crawl_status'] as PipelineStatus) ?? 'pending',
      sync_status: (row['sync_status'] as PipelineStatus) ?? 'pending',
      ai_status: (row['ai_status'] as PipelineStatus) ?? 'pending',
      doc_id: row['doc_id'] || undefined,
      sheet_id: row['sheet_id'] || undefined,
      title: row['title'] || undefined,
      word_count: row['word_count'] ? Number(row['word_count']) : undefined,
      page_type: row['page_type'] || undefined,
      summary: row['summary'] || undefined,
    });
  }

  return rows;
}

/** Minimal CSV line parser that handles double-quoted fields. */
function parseCSVLine(line: string): string[] {
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

/** Serialize InventoryRow array back to CSV string. */
function serializeInventoryCsv(rows: InventoryRow[]): string {
  const header = stringify([CSV_HEADERS]);
  const dataRows = rows.map(row =>
    stringify([CSV_HEADERS.map(h => {
      const val = row[h];
      return val === undefined || val === null ? '' : String(val);
    })])
  );
  return header + dataRows.join('');
}

/** Process a single row: classify + summarize in parallel, mutate in place. */
async function processRow(row: InventoryRow, provider?: string, model?: string): Promise<void> {
  const textPath = row.local_path.replace(/\.html?$/i, '.txt');

  let text: string;
  try {
    text = await fs.readFile(textPath, 'utf8');
  } catch {
    // Fall back to local_path itself if .txt variant doesn't exist
    try {
      text = await fs.readFile(row.local_path, 'utf8');
    } catch (err) {
      throw new Error(`Cannot read text file for ${row.url}: ${String(err)}`);
    }
  }

  const classify = buildRunPrompt(PAGE_TYPE_SYSTEM_PROMPT, provider, model);
  const summarize = buildRunPrompt(SUMMARY_SYSTEM_PROMPT, provider, model);

  const [pageType, summary] = await Promise.all([
    classify(buildPageTypeUserContent(text)),
    summarize(buildSummaryUserContent(text)),
  ]);

  row.page_type = pageType.trim();
  row.summary = summary.trim();
  row.ai_status = 'done';
}

/** Run at most `concurrency` promises at a time from a task factory list. */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const taskIndex = index++;
      results[taskIndex] = await tasks[taskIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Main orchestrator entry point.
 *
 * Reads the inventory CSV, processes rows where crawl_status === 'done'
 * and ai_status !== 'done', runs classify + summary in parallel per row,
 * and writes results back after each batch.
 */
export async function summarize(config: SummarizeConfig): Promise<void> {
  const { inventoryPath, provider, model, maxConcurrency = 3 } = config;
  const csvPath = path.resolve(inventoryPath);

  const rows = await readInventoryCsv(csvPath);

  const eligible = rows.filter(
    r => r.crawl_status === 'done' && r.ai_status !== 'done'
  );

  if (eligible.length === 0) {
    console.log('No rows to process.');
    return;
  }

  console.log(`Processing ${eligible.length} rows with concurrency ${maxConcurrency}...`);

  // Process in batches of maxConcurrency, writing to CSV after each batch
  let processed = 0;
  const batches: InventoryRow[][] = [];
  for (let i = 0; i < eligible.length; i += maxConcurrency) {
    batches.push(eligible.slice(i, i + maxConcurrency));
  }

  for (const batch of batches) {
    const tasks = batch.map(row => async () => {
      try {
        await processRow(row, provider, model);
        console.log(`  [done] ${row.url}`);
      } catch (err) {
        row.ai_status = 'error';
        console.error(`  [error] ${row.url}: ${String(err)}`);
      }
    });

    await runWithConcurrency(tasks, maxConcurrency);
    processed += batch.length;

    // Upsert: write all rows back (eligible ones are mutated in place)
    const csv = serializeInventoryCsv(rows);
    await fs.writeFile(csvPath, csv, 'utf8');
    console.log(`Progress: ${processed}/${eligible.length}`);
  }

  console.log('Summarization complete.');
}
