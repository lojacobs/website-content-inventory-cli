/**
 * Inventory CSV read/write utilities
 * Uses csv-parse and csv-stringify for CSV handling
 */

import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

import type { InventoryRow } from './types.js';
import { INVENTORY_COLUMNS } from './constants.js';

/**
 * Read an inventory CSV file and return an array of InventoryRow objects
 */
export function readInventory(path: string): Promise<InventoryRow[]> {
  return readFile(path, 'utf-8').then((content) => {
    const records = parse(content, {
      columns: [...INVENTORY_COLUMNS],
      from_line: 2,
      skip_empty_lines: true,
      bom: true,
    }) as InventoryRow[];
    return records;
  });
}

/**
 * Write an array of InventoryRow objects to a CSV file
 */
export function writeInventory(path: string, rows: InventoryRow[]): Promise<void> {
  const content = stringify(rows, {
    header: true,
    columns: [...INVENTORY_COLUMNS],
  });
  return writeFile(path, content, 'utf-8');
}

/**
 * Insert or update a row by URL key, returning the updated array
 */
export async function upsertRow(
  path: string,
  row: InventoryRow,
  _keyColumn: 'URL'
): Promise<InventoryRow[]> {
  const rows = await readInventory(path);
  const index = rows.findIndex((r) => r.URL === row.URL);
  if (index >= 0) {
    rows[index] = row;
  } else {
    rows.push(row);
  }
  await writeInventory(path, rows);
  return rows;
}

/**
 * Find a row by URL in an array of InventoryRow
 */
export function getRow(rows: InventoryRow[], url: string): InventoryRow | undefined {
  return rows.find((r) => r.URL === url);
}