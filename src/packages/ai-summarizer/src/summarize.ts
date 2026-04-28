import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  readInventory,
  writeInventory,
  urlToFilename,
  type SummarizeConfig,
} from '@full-content-inventory/shared';
import { validateProviderModel } from './auth.js';
import { buildRunPrompt } from './pi.js';
import {
  CLASSIFY_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserContent,
  hardSliceSummary,
} from './prompts.js';
import type { RunOptions } from './types.js';

/**
 * Run the AI summarizer pipeline against an _inventory.csv.
 *
 * Per spec:
 *   - validates provider+model first (INV-01)
 *   - skips rows by crawl_status / ai_status (FR2, FR3)
 *   - runs classify + summarize concurrently (INV-03)
 *   - hard-slices summary to 200 chars (INV-04)
 *   - flushes CSV after every row (INV-05)
 *   - per-row errors do not abort the run (FR9)
 */
export async function summarize(config: SummarizeConfig): Promise<void> {
  const { inventoryPath, aiProvider, aiModelId, resume = true } = config;

  await validateProviderModel(aiProvider, aiModelId);

  const rows = await readInventory(inventoryPath);
  if (rows.length === 0) {
    console.log('[summarize] No rows in inventory.');
    return;
  }

  const opts: RunOptions = { provider: aiProvider, modelId: aiModelId };
  const runClassify = buildRunPrompt(CLASSIFY_SYSTEM_PROMPT);
  const runSummarize = buildRunPrompt(SUMMARY_SYSTEM_PROMPT);

  const inventoryDir = dirname(resolve(inventoryPath));

  for (const row of rows) {
    if (row.crawl_status !== 'done') continue;
    if (resume && row.ai_status === 'done') continue;

    try {
      const txtPath = resolve(inventoryDir, urlToFilename(row.URL));
      const text = await readFile(txtPath, 'utf8');
      const userContent = buildSummaryUserContent(row.Titre ?? '', text);

      const [pageType, summary] = await Promise.all([
        runClassify(userContent, opts),
        runSummarize(userContent, opts),
      ]);

      row.Type_de_page = pageType.trim();
      row.Resume_200_chars = hardSliceSummary(summary);
      row.ai_status = 'done';
      row.error_message = '';
    } catch (err) {
      row.ai_status = 'error';
      row.error_message = err instanceof Error ? err.message : String(err);
    }

    await writeInventory(inventoryPath, rows);
    console.log(`[summarize] ${row.URL} → ${row.Type_de_page || row.ai_status}`);
  }

  console.log('[summarize] Done.');
}
