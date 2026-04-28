import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InventoryRow } from '@full-content-inventory/shared';

vi.mock('@full-content-inventory/shared', async (orig) => {
  const actual = await orig<typeof import('@full-content-inventory/shared')>();
  return {
    ...actual,
    readInventory: vi.fn<() => Promise<InventoryRow[]>>(),
    writeInventory: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
});

vi.mock('../src/auth.js', () => ({
  validateProviderModel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/pi.js', () => ({
  buildRunPrompt: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('page body text'),
}));

import * as shared from '@full-content-inventory/shared';
import * as auth from '../src/auth.js';
import * as pi from '../src/pi.js';
import { summarize } from '../src/summarize.js';

const baseRow = (over: Partial<InventoryRow>): InventoryRow => ({
  URL: 'https://x.test/a',
  Titre: 'A',
  Description: '',
  Resume_200_chars: '',
  Type_de_page: '',
  Profondeur_URL: 0,
  Nb_mots: 0,
  Statut_HTTP: 200,
  Langue: 'fr',
  Date_modifiee: '',
  Canonical: '',
  Noindex: 'no',
  Nb_images: 0,
  'Fichiers_liés': 0,
  Lien_Google_Doc: '',
  Lien_dossier_Drive: '',
  crawl_status: 'done',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (pi.buildRunPrompt as any)
    .mockReturnValueOnce(vi.fn().mockResolvedValue('service'))   // classify
    .mockReturnValueOnce(vi.fn().mockResolvedValue('a'.repeat(250))); // summary
});

describe('summarize()', () => {
  it('calls validateProviderModel before any row work', async () => {
    (shared.readInventory as any).mockResolvedValue([]);
    await summarize({
      inventoryPath: '/tmp/i.csv',
      aiProvider: 'p', aiModelId: 'm',
    });
    expect(auth.validateProviderModel).toHaveBeenCalledWith('p', 'm');
  });

  it('skips rows where crawl_status !== done', async () => {
    const rows = [baseRow({ crawl_status: 'error' })];
    (shared.readInventory as any).mockResolvedValue(rows);
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    expect(rows[0].ai_status).toBeUndefined();
  });

  it('skips rows where ai_status === done unless resume=false', async () => {
    const rows = [baseRow({ ai_status: 'done', Type_de_page: 'old', Resume_200_chars: 'kept' })];
    (shared.readInventory as any).mockResolvedValue(rows);
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    expect(rows[0].Type_de_page).toBe('old');
    expect(rows[0].Resume_200_chars).toBe('kept');
  });

  it('writes Type_de_page, hard-slices Resume_200_chars to 200, and sets ai_status=done', async () => {
    const rows = [baseRow({})];
    (shared.readInventory as any).mockResolvedValue(rows);
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    expect(rows[0].Type_de_page).toBe('service');
    expect(rows[0].Resume_200_chars).toHaveLength(200);
    expect(rows[0].ai_status).toBe('done');
    expect(rows[0].error_message).toBe('');
  });

  it('flushes the CSV after every processed row', async () => {
    const rows = [baseRow({ URL: 'https://x.test/a' }), baseRow({ URL: 'https://x.test/b' })];
    (shared.readInventory as any).mockResolvedValue(rows);
    (pi.buildRunPrompt as any).mockReset();
    (pi.buildRunPrompt as any)
      .mockReturnValueOnce(vi.fn().mockResolvedValue('service'))
      .mockReturnValueOnce(vi.fn().mockResolvedValue('xx'));
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    expect(shared.writeInventory).toHaveBeenCalledTimes(2);
  });

  it('on per-row error: sets ai_status=error, writes error_message, continues', async () => {
    const rows = [baseRow({ URL: 'https://x.test/a' }), baseRow({ URL: 'https://x.test/b' })];
    (shared.readInventory as any).mockResolvedValue(rows);
    (pi.buildRunPrompt as any).mockReset();
    (pi.buildRunPrompt as any)
      .mockReturnValueOnce(vi.fn().mockRejectedValue(new Error('boom')))
      .mockReturnValueOnce(vi.fn().mockResolvedValue('summary'));
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    expect(rows[0].ai_status).toBe('error');
    expect(rows[0].error_message).toBe('boom');
    expect(shared.writeInventory).toHaveBeenCalledTimes(2);
  });

  it('runs classify and summarize concurrently (Promise.all)', async () => {
    let order: string[] = [];
    const classify = vi.fn().mockImplementation(async () => {
      order.push('classify-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('classify-end');
      return 'service';
    });
    const summary = vi.fn().mockImplementation(async () => {
      order.push('summary-start');
      await new Promise((r) => setTimeout(r, 5));
      order.push('summary-end');
      return 'ok';
    });
    (pi.buildRunPrompt as any).mockReset();
    (pi.buildRunPrompt as any)
      .mockReturnValueOnce(classify)
      .mockReturnValueOnce(summary);
    (shared.readInventory as any).mockResolvedValue([baseRow({})]);
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    // Both starts must precede either end.
    expect(order.indexOf('classify-start')).toBeLessThan(order.indexOf('summary-end'));
    expect(order.indexOf('summary-start')).toBeLessThan(order.indexOf('classify-end'));
  });
});
