import { promises as fs } from 'fs';
import { InventoryRow } from './types.js';

// ---------------------------------------------------------------------------
// CSV column order (determines header and serialization order)
// ---------------------------------------------------------------------------
const COLUMNS: (keyof InventoryRow)[] = [
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
  'description',
  'http_status',
  'language',
  'date_modified',
  'canonical',
  'noindex',
  'image_count',
  'linked_files',
];

// ---------------------------------------------------------------------------
// Minimal CSV helpers (no external deps)
// ---------------------------------------------------------------------------

/** Escape a single CSV field value. */
function escapeField(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  // Wrap in double-quotes if the value contains comma, double-quote, or newline
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/** Serialize a row to a CSV line. */
function rowToCsvLine(row: InventoryRow): string {
  return COLUMNS.map((col) => escapeField(row[col])).join(',');
}

/** Parse one CSV line into an array of raw string values, respecting quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          // Escaped double-quote
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current);
  return fields;
}

/** Convert a raw array of CSV values (in COLUMNS order) to an InventoryRow. */
function fieldsToRow(fields: string[]): InventoryRow {
  const get = (idx: number): string => (fields[idx] ?? '').trim();
  const opt = (idx: number): string | undefined => {
    const v = get(idx);
    return v === '' ? undefined : v;
  };

  const wordCountRaw = opt(COLUMNS.indexOf('word_count'));
  const httpStatusRaw = opt(COLUMNS.indexOf('http_status'));
  const imageCountRaw = opt(COLUMNS.indexOf('image_count'));
  const noindexRaw = opt(COLUMNS.indexOf('noindex'));


  return {
    url: get(COLUMNS.indexOf('url')),
    local_path: get(COLUMNS.indexOf('local_path')),
    crawl_status: get(COLUMNS.indexOf('crawl_status')) as InventoryRow['crawl_status'],
    sync_status: get(COLUMNS.indexOf('sync_status')) as InventoryRow['sync_status'],
    ai_status: get(COLUMNS.indexOf('ai_status')) as InventoryRow['ai_status'],
    doc_id: opt(COLUMNS.indexOf('doc_id')),
    sheet_id: opt(COLUMNS.indexOf('sheet_id')),
    title: opt(COLUMNS.indexOf('title')),
    word_count: wordCountRaw !== undefined ? Number(wordCountRaw) : undefined,
    page_type: opt(COLUMNS.indexOf('page_type')),
    summary: opt(COLUMNS.indexOf('summary')),
    description: opt(COLUMNS.indexOf('description')),
    http_status: httpStatusRaw !== undefined ? Number(httpStatusRaw) : undefined,
    language: opt(COLUMNS.indexOf('language')),
    date_modified: opt(COLUMNS.indexOf('date_modified')),
    canonical: opt(COLUMNS.indexOf('canonical')),
    noindex: noindexRaw !== undefined ? noindexRaw === 'true' : undefined,
    image_count: imageCountRaw !== undefined ? Number(imageCountRaw) : undefined,
    linked_files: opt(COLUMNS.indexOf('linked_files')),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read an inventory CSV file and return all rows.
 * Returns an empty array if the file does not exist.
 */
export async function readInventory(csvPath: string): Promise<InventoryRow[]> {
  let content: string;
  try {
    content = await fs.readFile(csvPath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) {
    // Only header or empty — no data rows
    return [];
  }

  // Skip header (lines[0])
  return lines.slice(1).map((line) => fieldsToRow(parseCsvLine(line)));
}

/**
 * Write an array of InventoryRow objects to a CSV file, with a header row.
 * Overwrites the file if it already exists.
 */
export async function writeInventory(csvPath: string, rows: InventoryRow[]): Promise<void> {
  const header = COLUMNS.join(',');
  const dataLines = rows.map(rowToCsvLine);
  const content = [header, ...dataLines].join('\n') + '\n';
  await fs.writeFile(csvPath, content, 'utf8');
}

/**
 * Insert a new row or update the existing row with the same URL.
 */
export async function upsertRow(csvPath: string, row: InventoryRow): Promise<void> {
  const rows = await readInventory(csvPath);
  const idx = rows.findIndex((r) => r.url === row.url);
  if (idx >= 0) {
    rows[idx] = row;
  } else {
    rows.push(row);
  }
  await writeInventory(csvPath, rows);
}

/**
 * Find a row by URL. Returns undefined if not found.
 */
export async function getRow(csvPath: string, url: string): Promise<InventoryRow | undefined> {
  const rows = await readInventory(csvPath);
  return rows.find((r) => r.url === url);
}
