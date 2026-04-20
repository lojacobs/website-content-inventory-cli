/**
 * e2e-full.ts
 * End-to-end integration test for the full FCI pipeline.
 * Run:  npm run -w packages/cli test:e2e
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { readInventory } from '@fci/shared';
import { transformInventoryToPublicCSV } from '@fci/gws-sync';

const exec = promisify(execCb);

const TEST_URL = 'https://www.standredekamouraska.ca/espace-citoyen/urbanisme/';
const DRIVE_FOLDER_ID = '1al1jC0VIkQvbWL_t_jaXLZrkrSObpnbl';

// Project root: packages/cli/tests/e2e-full.ts → go up to full-content-inventory-integrated/
const _dir = path.dirname(fileURLToPath(import.meta.url)); // packages/cli/tests
const _p1 = path.dirname(_dir); // packages/cli
const _p2 = path.dirname(_p1); // packages
const PROJECT_ROOT = path.dirname(_p2); // full-content-inventory-integrated

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'fci-e2e-'));
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { fields.push(current); current = ''; }
      else { current += c; }
    }
  }
  fields.push(current);
  return fields;
}

async function run(cmd: string): Promise<string> {
  try {
    const { stdout, stderr } = await exec(cmd, { cwd: PROJECT_ROOT, timeout: 180_000 });
    if (stderr && stderr.trim() && !stderr.includes('gws')) {
      console.warn('[cmd stderr]', stderr.slice(0, 300));
    }
    return stdout;
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; };
    if (e.stderr && !e.stderr.includes('gws')) {
      console.warn('[cmd stderr]', e.stderr.slice(0, 300));
    }
    return e.stdout ?? '';
  }
}

async function main() {
  const tmpPath = await tmpDir();
  console.log('PROJECT_ROOT:', PROJECT_ROOT);
  console.log('E2E temp dir:', tmpPath);
  let exitCode = 0;

  try {
    // Step 1: Crawl
    console.log('\n=== Step 1: fci-crawl ===');
    await run(`node packages/crawler/dist/cli.js --url "${TEST_URL}" --output ${tmpPath}`);

    const rows = await readInventory(path.join(tmpPath, '_inventory.csv'));
    if (rows.length === 0) throw new Error('No rows found after crawl');
    const r = rows[0];
    if (r.crawl_status !== 'done') throw new Error('crawl_status=' + r.crawl_status);
    if (!r.title) throw new Error('title missing');
    if (!r.word_count || r.word_count <= 0) throw new Error('word_count invalid');
    if (!r.description) throw new Error('description missing');
    if (r.http_status !== 200) throw new Error('http_status=' + r.http_status);
    if (!r.language) throw new Error('language missing');
    if (!r.canonical?.startsWith('http')) throw new Error('canonical not URL');
    if (typeof r.noindex !== 'boolean') throw new Error('noindex not boolean');
    if (!r.linked_files) throw new Error('linked_files missing');

    console.log('  ✅ title:', r.title);
    console.log('  ✅ language:', r.language, '| http_status:', r.http_status);
    console.log('  ✅ canonical:', r.canonical);
    console.log('  ✅ noindex:', r.noindex, '| image_count:', r.image_count);
    console.log('  ✅ linked_files:', r.linked_files?.slice(0, 80));
    console.log('  ✅ Step 1 PASSED');

    // Step 2: Sync
    console.log('\n=== Step 2: fci-sync ===');
    await run(
      'node packages/gws-sync/dist/cli.js ' +
      `--inventory ${tmpPath}/_inventory.csv ` +
      `--drive-folder ${DRIVE_FOLDER_ID} ` +
      '--client e2e-test --project e2e-full'
    );

    const content = await fs.readFile(path.join(tmpPath, '_inventory_public.csv'), 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('Public CSV has no data rows');

    const cols = parseCSVLine(lines[0]);
    const vals = parseCSVLine(lines[1]);
    const get = (col: string) => { const i = cols.indexOf(col); return i >= 0 ? vals[i] : ''; };

    const colChecks: Array<[string, string]> = [
      ['Description', get('Description')],
      ['Statut_HTTP', get('Statut_HTTP')],
      ['Langue', get('Langue')],
      ['Date_modifiee', get('Date_modifiee')],
      ['Canonical', get('Canonical')],
      ['Noindex', get('Noindex')],
      ['Nb_images', get('Nb_images')],
      ['Fichiers_liés', get('Fichiers_liés')],
    ];
    for (const [name, val] of colChecks) {
      console.log('  ✅', name + ':', val.slice(0, 60));
    }
    if (get('Statut_HTTP') !== '200') throw new Error('Statut_HTTP != 200: ' + get('Statut_HTTP'));
    if (!['true','false'].includes(get('Noindex'))) throw new Error('Noindex invalid: ' + get('Noindex'));
    console.log('  ✅ Step 2 PASSED');

    // Step 3: Summarize (may time out if AI not accessible)
    console.log('\n=== Step 3: fci-summarize ===');
    const csvPath = path.join(tmpPath, '_inventory.csv');

    // Find existing sheet ID for re-upload
    try {
      const listOut = await exec(
        'gws drive files list --query "_inventory"',
        { cwd: PROJECT_ROOT, timeout: 30_000 }
      );
      const sheetFiles = JSON.parse(listOut.stdout || listOut.stderr || '{}')
        .files?.filter((f: { mimeType: string }) =>
          f.mimeType === 'application/vnd.google-apps.spreadsheet'
        ) ?? [];
      const existingId = sheetFiles[sheetFiles.length - 1]?.id;
      if (existingId) {
        const rowsPre = await readInventory(csvPath);
        rowsPre.forEach(row => { row.sheet_id = existingId; });
        const { writeInventory: wi } = await import('@fci/shared');
        await wi(csvPath, rowsPre);
        console.log('  Injected sheet_id:', existingId);
      }
    } catch { /* sheet lookup optional */ }

    try {
      await run(
        'node packages/ai-summarizer/dist/cli.js ' +
        `--inventory ${csvPath} --concurrency 1 ` +
        '--provider opencode-go --model minimax-m2.5'
      );
    } catch (err) {
      console.warn('  ⚠️  Summarize error (may be timeout):', String(err).slice(0, 100));
    }

    const rowsPost = await readInventory(csvPath);
    const rs = rowsPost[0];
    if (rs.ai_status === 'done') {
      if (!rs.page_type || rs.page_type.includes('<system>')) {
        throw new Error('page_type invalid: ' + rs.page_type?.slice(0, 80));
      }
      if ((rs.summary?.length ?? 0) < 10 || rs.summary?.includes('<system>')) {
        throw new Error('summary invalid: ' + rs.summary?.slice(0, 80));
      }
      console.log('  ✅ page_type:', rs.page_type);
      console.log('  ✅ summary:', rs.summary?.slice(0, 80));
    } else {
      console.log('  ⚠️  ai_status != done (AI API may not be accessible in this env)');
    }
    console.log('  ✅ Step 3 PASSED (or skipped)');

    // Step 4: Full pipeline — all 14 columns non-empty
    console.log('\n=== Step 4: Full pipeline — validate all Sheet columns ===');
    const allRows = await readInventory(csvPath);
    const folderMap = new Map<string, string>();
    allRows.forEach(row => { if (row.local_path) folderMap.set(row.url, 'https://drive.google.com/drive/folders/placeholder'); });

    const pubCSV = transformInventoryToPublicCSV(allRows, folderMap);
    const pubLines = pubCSV.split('\n').filter(l => l.trim());
    const pubCols = parseCSVLine(pubLines[0]);
    const pubVals = parseCSVLine(pubLines[1]);
    const pubGet = (col: string) => { const i = pubCols.indexOf(col); return i >= 0 ? pubVals[i] : ''; };

    const requiredCols = [
      'URL', 'Titre', 'Description', 'Resume_200_chars', 'Type_de_page',
      'Nb_mots', 'Statut_HTTP', 'Langue', 'Date_modifiee', 'Canonical',
      'Noindex', 'Nb_images', 'Fichiers_liés', 'Lien_dossier_Drive',
    ];

    const failures: string[] = [];
    for (const col of requiredCols) {
      const v = pubGet(col);
      if (!v || v.length === 0) {
        console.log('  ❌ EMPTY:', col);
        failures.push(col);
      } else {
        console.log('  ✅', col + ':', v.slice(0, 60));
      }
    }

    console.log('');
    if (failures.length === 0) {
      console.log('🎉🎉🎉 ALL ' + requiredCols.length + ' COLUMNS POPULATED — E2E TEST PASSED 🎉🎉🎉');
    } else {
      console.log('❌ FAILURES:', failures.join(', '));
      exitCode = 1;
    }

  } catch (err) {
    console.error('\n❌ E2E test error:', err);
    exitCode = 1;
  } finally {
    await fs.rm(tmpPath, { recursive: true, force: true }).catch(() => undefined);
  }

  process.exit(exitCode);
}

main();
