import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { readInventory, writeInventory, upsertRow, getRow } from '../inventory.js';
import { InventoryRow } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inventory-test-'));
  return path.join(dir, 'inventory.csv');
}

const row1: InventoryRow = {
  url: 'https://example.com/',
  local_path: '/output/example.com/index.txt',
  crawl_status: 'done',
  sync_status: 'pending',
  ai_status: 'pending',
  title: 'Example Home',
  word_count: 120,
};

const row2: InventoryRow = {
  url: 'https://example.com/about',
  local_path: '/output/example.com/about.txt',
  crawl_status: 'done',
  sync_status: 'done',
  ai_status: 'done',
  doc_id: 'doc123',
  sheet_id: 'sheet456',
  title: 'About Us',
  word_count: 200,
  page_type: 'article',
  summary: 'A page about us.',
};

// ---------------------------------------------------------------------------
// readInventory
// ---------------------------------------------------------------------------

describe('readInventory', () => {
  test('returns [] when file does not exist', async () => {
    const p = path.join(os.tmpdir(), 'nonexistent-inventory-xyz.csv');
    const rows = await readInventory(p);
    expect(rows).toEqual([]);
  });

  test('returns [] for a file with only a header row', async () => {
    const p = await tmpFile();
    await writeInventory(p, []);
    const rows = await readInventory(p);
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// writeInventory / round-trip
// ---------------------------------------------------------------------------

describe('writeInventory + readInventory round-trip', () => {
  test('single row round-trips correctly', async () => {
    const p = await tmpFile();
    await writeInventory(p, [row1]);
    const rows = await readInventory(p);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(row1);
  });

  test('multiple rows round-trip correctly', async () => {
    const p = await tmpFile();
    await writeInventory(p, [row1, row2]);
    const rows = await readInventory(p);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(row1);
    expect(rows[1]).toEqual(row2);
  });

  test('optional fields undefined when empty', async () => {
    const p = await tmpFile();
    const minimal: InventoryRow = {
      url: 'https://example.com/minimal',
      local_path: '/output/minimal.txt',
      crawl_status: 'pending',
      sync_status: 'pending',
      ai_status: 'pending',
    };
    await writeInventory(p, [minimal]);
    const rows = await readInventory(p);
    expect(rows[0].doc_id).toBeUndefined();
    expect(rows[0].sheet_id).toBeUndefined();
    expect(rows[0].title).toBeUndefined();
    expect(rows[0].word_count).toBeUndefined();
    expect(rows[0].page_type).toBeUndefined();
    expect(rows[0].summary).toBeUndefined();
  });

  test('fields with commas and quotes survive round-trip', async () => {
    const p = await tmpFile();
    const tricky: InventoryRow = {
      url: 'https://example.com/tricky',
      local_path: '/output/tricky.txt',
      crawl_status: 'done',
      sync_status: 'pending',
      ai_status: 'pending',
      title: 'Hello, "World"',
      summary: 'Contains, commas and "quotes".',
    };
    await writeInventory(p, [tricky]);
    const rows = await readInventory(p);
    expect(rows[0].title).toBe('Hello, "World"');
    expect(rows[0].summary).toBe('Contains, commas and "quotes".');
  });
});

// ---------------------------------------------------------------------------
// upsertRow
// ---------------------------------------------------------------------------

describe('upsertRow', () => {
  test('adds a new row when url does not exist', async () => {
    const p = await tmpFile();
    await upsertRow(p, row1);
    const rows = await readInventory(p);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(row1);
  });

  test('appends second distinct row', async () => {
    const p = await tmpFile();
    await upsertRow(p, row1);
    await upsertRow(p, row2);
    const rows = await readInventory(p);
    expect(rows).toHaveLength(2);
  });

  test('updates existing row with same url', async () => {
    const p = await tmpFile();
    await writeInventory(p, [row1, row2]);

    const updated: InventoryRow = {
      ...row1,
      sync_status: 'done',
      ai_status: 'done',
      doc_id: 'newdoc',
      summary: 'Updated summary.',
    };
    await upsertRow(p, updated);

    const rows = await readInventory(p);
    expect(rows).toHaveLength(2); // count unchanged
    const found = rows.find((r) => r.url === row1.url);
    expect(found?.sync_status).toBe('done');
    expect(found?.doc_id).toBe('newdoc');
    expect(found?.summary).toBe('Updated summary.');
  });
});

// ---------------------------------------------------------------------------
// getRow
// ---------------------------------------------------------------------------

describe('getRow', () => {
  test('finds correct row by url', async () => {
    const p = await tmpFile();
    await writeInventory(p, [row1, row2]);
    const found = await getRow(p, row2.url);
    expect(found).toEqual(row2);
  });

  test('returns undefined for missing url', async () => {
    const p = await tmpFile();
    await writeInventory(p, [row1]);
    const found = await getRow(p, 'https://nothere.com/');
    expect(found).toBeUndefined();
  });

  test('returns undefined on missing file', async () => {
    const p = path.join(os.tmpdir(), 'missing-getrow-xyz.csv');
    const found = await getRow(p, 'https://example.com/');
    expect(found).toBeUndefined();
  });
});
