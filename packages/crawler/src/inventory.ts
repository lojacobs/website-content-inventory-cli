/**
 * inventory.ts
 * Manage the _inventory.csv file for tracking crawl progress.
 * Supports writing, appending, and reading records.
 */

import fs from 'fs/promises';
import path from 'path';
import { stringify } from 'csv-stringify/sync';
import type { PageMetadata } from '@fci/shared';
import { metadataToInventoryRow } from './metadata.js';

const CSV_HEADERS = [
  'URL',
  'Titre',
  'Description',
  'Resume_200_chars',
  'Type_de_page',
  'Profondeur_URL',
  'Nb_mots',
  'Statut_HTTP',
  'Langue',
  'Date_modifiee',
  'Canonical',
  'Noindex',
  'Nb_images',
  'Fichiers_liés',
  'Lien_Google_Doc',
  'Lien_dossier_Drive',
];

export class InventoryManager {
  private csvPath: string;
  private initialized = false;

  constructor(outputDir: string) {
    this.csvPath = path.join(outputDir, '_inventory.csv');
  }

  /**
   * Initialize the inventory file with headers (idempotent).
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await fs.access(this.csvPath);
      // File exists — we're resuming
      this.initialized = true;
    } catch {
      // Create fresh inventory with headers
      const header = stringify([CSV_HEADERS]);
      await fs.mkdir(path.dirname(this.csvPath), { recursive: true });
      await fs.writeFile(this.csvPath, header, 'utf8');
      this.initialized = true;
    }
  }

  /**
   * Append a page record to the inventory.
   */
  async append(metadata: PageMetadata, plainText: string): Promise<void> {
    await this.init();
    const row = metadataToInventoryRow(metadata, plainText);
    const line = stringify([CSV_HEADERS.map(h => row[h] ?? '')]);
    await fs.appendFile(this.csvPath, line, 'utf8');
  }

  /**
   * Get the list of already-crawled URLs (for resume support).
   */
  async getCrawledUrls(): Promise<Set<string>> {
    try {
      const content = await fs.readFile(this.csvPath, 'utf8');
      const lines = content.split('\n').slice(1); // Skip header
      const urls = new Set<string>();
      for (const line of lines) {
        if (!line.trim()) continue;
        // URL is always the first column
        const url = line.split(',')[0].replace(/^"|"$/g, '').trim();
        if (url) urls.add(url);
      }
      return urls;
    } catch {
      return new Set();
    }
  }

  get path(): string {
    return this.csvPath;
  }
}
