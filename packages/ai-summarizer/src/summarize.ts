/**
 * summarize.ts
 * Orchestrateur: lit _inventory.csv, exécute classify + summary en // pour chaque ligne,
 * réécrit les résultats dans le CSV puis recharge la Google Sheet.
 */

import fs from 'fs/promises';
import path from 'path';
import { readInventory, writeInventory } from '@fci/shared';
import { updateSheet, transformInventoryToPublicCSV } from '@fci/gws-sync';
import {
  buildRunPrompt,
  PAGE_TYPE_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildPageTypeUserContent,
  buildSummaryUserContent,
} from './index.js';
import type { SummarizeConfig, InventoryRow } from '@fci/shared';

/** Traite une ligne: classify + summarize en parallèle, modifie la ligne en place. */
async function processRow(
  row: InventoryRow,
  provider?: string,
  model?: string
): Promise<void> {
  const textPath = row.local_path?.replace(/\.html?$/i, '.txt') ?? '';

  let text: string;
  try {
    text = await fs.readFile(textPath, 'utf8');
  } catch {
    try {
      text = await fs.readFile(row.local_path ?? '', 'utf8');
    } catch (err) {
      throw new Error(`Impossible de lire le fichier texte pour ${row.url}: ${String(err)}`);
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

/** Exécute au plus `concurrency` promesses en parallèle. */
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

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Orchestrateur principal.
 *
 * Lit _inventory.csv, traite les lignes où crawl_status === 'done' et ai_status !== 'done',
 * exécute classify + summary en //, réécrit les résultats dans le CSV,
 * puis recharge la Google Sheet avec le contenu à jour.
 */
export async function summarize(config: SummarizeConfig): Promise<void> {
  const { inventoryPath, provider, model, maxConcurrency = 3 } = config;
  const csvPath = path.resolve(inventoryPath);

  const rows = await readInventory(csvPath);

  const eligible = rows.filter(
    (r) => r.crawl_status === 'done' && r.ai_status !== 'done'
  );

  if (eligible.length === 0) {
    console.log('No rows to process.');
    return;
  }

  console.log(
    `Processing ${eligible.length} row(s) with concurrency ${maxConcurrency}...`
  );

  // Traite par lots de maxConcurrency
  for (let i = 0; i < eligible.length; i += maxConcurrency) {
    const batch = eligible.slice(i, i + maxConcurrency);

    const tasks = batch.map((row) => async () => {
      try {
        await processRow(row, provider, model);
        console.log(`  [done] ${row.url}`);
      } catch (err) {
        row.ai_status = 'error';
        console.error(`  [error] ${row.url}: ${String(err)}`);
      }
    });

    await runWithConcurrency(tasks, maxConcurrency);

    // Réécrit le CSV local avec les résultats AI
    await writeInventory(csvPath, rows);
    console.log(`  Written to CSV: ${csvPath}`);
  }

  // Phase 2: Recharger la Google Sheet avec le contenu mis à jour
  // Relit le sheet_id depuis le CSV (écrit par fci-sync)
  const sheetId = rows.find((r) => r.sheet_id)?.sheet_id;

  if (sheetId) {
    console.log(`\nUpdating Google Sheet ${sheetId}...`);

    // Construire la map des Drive folder links (optionnel — non utilisé ici
    // car on met à jour la sheet existante, pas une nouvelle)
    const driveFolderLinkMap = new Map<string, string>();

    // Génère le CSV public schema avec les nouvelles valeurs page_type + summary
    const publicCSV = transformInventoryToPublicCSV(rows, driveFolderLinkMap);

    // Écrit dans un fichier temporaire
    const tempCsvPath = path.join(
      path.dirname(csvPath),
      '_summarize_temp_sheet.csv'
    );
    await fs.writeFile(tempCsvPath, publicCSV, 'utf8');

    try {
      await updateSheet(sheetId, tempCsvPath);
      console.log(`  ✅ Sheet mise à jour: https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
    } catch (err) {
      console.error(`  ❌ Échec mise à jour sheet: ${String(err)}`);
      // Ne pas propagerr l'erreur — le CSV local est déjà à jour
    } finally {
      await fs.unlink(tempCsvPath).catch(() => undefined);
    }
  } else {
    console.log(
      `\n⚠️  sheet_id non trouvé dans le CSV — impossible de recharger la Google Sheet.\n` +
      `   Exécutez fci-sync après fci-summarize pour mettre à jour la sheet.`
    );
  }

  console.log('\nSummarization complete.');
}
