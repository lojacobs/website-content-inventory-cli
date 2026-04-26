import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InventoryRow } from '@full-content-inventory/shared';

// ---------------------------------------------------------------------------
// Mock external dependencies BEFORE importing sync.ts
// ---------------------------------------------------------------------------

vi.mock('@full-content-inventory/shared', () => ({
  readInventory: vi.fn<() => Promise<InventoryRow[]>>(),
  writeInventory: vi.fn<() => Promise<void>>(),
}));

vi.mock('../src/drive.js', () => ({
  ensureDriveFolder: vi.fn<() => Promise<string>>(),
  uploadAsDoc: vi.fn<() => Promise<string>>(),
  uploadAsSheet: vi.fn<() => Promise<string>>(),
  updateSheet: vi.fn<() => Promise<void>>(),
}));

// Mock node:fs/promises for .sync-meta.json reads/writes.
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn<() => Promise<string>>(),
  writeFile: vi.fn<() => Promise<void>>(),
}));

// ---------------------------------------------------------------------------
// Import after all mocks are registered
// ---------------------------------------------------------------------------

import { buildFolderTree, parseImageMarkers, sync, urlToTxtPath, assertPathWithinDir } from '../src/sync.js';
import * as shared from '@full-content-inventory/shared';
import * as drive from '../src/drive.js';

// ---------------------------------------------------------------------------
// buildFolderTree
// ---------------------------------------------------------------------------

describe('buildFolderTree', () => {
  it('builds correct parent-child structure for rows spanning 2 subdirectories', () => {
    const rows: InventoryRow[] = [
      { URL: 'https://example.com/a/b/page1.html', crawl_status: 'done' } as InventoryRow,
      { URL: 'https://example.com/a/c/page2.html', crawl_status: 'done' } as InventoryRow,
      { URL: 'https://example.com/a/page3.html', crawl_status: 'done' } as InventoryRow,
    ];

    const tree = buildFolderTree(rows);

    // Root: 'a'
    expect(tree.length).toBe(1);
    expect(tree[0].name).toBe('a');

    // Direct children: 'b' and 'c'
    const childrenNames = tree[0].children.map((c) => c.name).sort();
    expect(childrenNames).toEqual(['b', 'c']);
  });

  it('returns empty array for rows with no directory segments', () => {
    const rows: InventoryRow[] = [
      { URL: 'https://example.com/page.html', crawl_status: 'done' } as InventoryRow,
    ];
    expect(buildFolderTree(rows)).toEqual([]);
  });

  it('skips rows with invalid URLs', () => {
    const rows: InventoryRow[] = [
      { URL: 'not-a-valid-url', crawl_status: 'done' } as InventoryRow,
    ];
    expect(buildFolderTree(rows)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseImageMarkers
// ---------------------------------------------------------------------------

describe('parseImageMarkers', () => {
  it('extracts 2 ImageMarker objects from text with 2 [IMAGE: alt | src] patterns', () => {
    const text =
      'Here is an image: [IMAGE: My Alt Text | https://example.com/img.png]. ' +
      'And another: [IMAGE: Another Alt | /assets/logo.jpg]';

    const markers = parseImageMarkers(text);

    expect(markers).toHaveLength(2);

    expect(markers[0]).toEqual({
      alt: 'My Alt Text',
      src: 'https://example.com/img.png',
      fullMatch: '[IMAGE: My Alt Text | https://example.com/img.png]',
    });

    expect(markers[1]).toEqual({
      alt: 'Another Alt',
      src: '/assets/logo.jpg',
      fullMatch: '[IMAGE: Another Alt | /assets/logo.jpg]',
    });
  });

  it('returns empty array when no markers are present', () => {
    expect(parseImageMarkers('plain text with no markers')).toEqual([]);
  });

  it('handles whitespace in markers', () => {
    const markers = parseImageMarkers('[IMAGE:   spaced alt   |   spaced src   ]');
    expect(markers).toHaveLength(1);
    expect(markers[0].alt).toBe('spaced alt');
    expect(markers[0].src).toBe('spaced src');
  });
});

// ---------------------------------------------------------------------------
// sync — resume behavior
// ---------------------------------------------------------------------------

describe('sync — resume behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all functions succeed.
    vi.mocked(shared.readInventory).mockResolvedValue([]);
    vi.mocked(shared.writeInventory).mockResolvedValue();
    vi.mocked(drive.ensureDriveFolder).mockResolvedValue('folder-id');
    vi.mocked(drive.uploadAsDoc).mockResolvedValue('doc-id');
    vi.mocked(drive.uploadAsSheet).mockResolvedValue('sheet-id');
    vi.mocked(drive.updateSheet).mockResolvedValue();
  });

  it('skips rows where sync_status === "done" when resume is true', async () => {
    // 2 rows: first done, second pending.
    const rows: InventoryRow[] = [
      { URL: 'https://example.com/a/page1.html', crawl_status: 'done', sync_status: 'done' } as InventoryRow,
      { URL: 'https://example.com/a/b/page2.html', crawl_status: 'done' } as InventoryRow,
    ];
    vi.mocked(shared.readInventory).mockResolvedValue(rows);

    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue('content with no images' as never);

    await sync({
      inventoryPath: '/tmp/test.csv',
      driveFolderId: 'folder-1',
      resume: true,
    });

    // uploadAsDoc should be called exactly once — for the row without sync_status=done.
    expect(drive.uploadAsDoc).toHaveBeenCalledTimes(1);
  });

  it('processes all crawled rows when resume is false', async () => {
    const rows: InventoryRow[] = [
      { URL: 'https://example.com/a/page1.html', crawl_status: 'done', sync_status: 'done' } as InventoryRow,
      { URL: 'https://example.com/a/b/page2.html', crawl_status: 'done' } as InventoryRow,
    ];
    vi.mocked(shared.readInventory).mockResolvedValue(rows);

    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue('content' as never);

    await sync({
      inventoryPath: '/tmp/test.csv',
      driveFolderId: 'folder-1',
      resume: false,
    });

    // Both rows should be processed (resume=false ignores sync_status).
    expect(drive.uploadAsDoc).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// sync — error isolation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// urlToTxtPath — path traversal hardening
// ---------------------------------------------------------------------------

describe('urlToTxtPath', () => {
  it('filters out .. segments', () => {
    expect(urlToTxtPath('https://evil.com/../../../etc/passwd')).toBe('etc/passwd.txt');
    expect(urlToTxtPath('https://example.com/a/../b/page.html')).toBe('b/page.txt');
  });

  it('filters out . segments', () => {
    expect(urlToTxtPath('https://example.com/./page.html')).toBe('page.txt');
    expect(urlToTxtPath('https://example.com/a/./b/page.html')).toBe('a/b/page.txt');
  });

  it('preserves normal paths unchanged', () => {
    expect(urlToTxtPath('https://example.com/about.html')).toBe('about.txt');
    expect(urlToTxtPath('https://example.com/a/b/page.html')).toBe('a/b/page.txt');
  });

  it('maps root paths to homepage.txt', () => {
    expect(urlToTxtPath('https://example.com/')).toBe('homepage.txt');
    expect(urlToTxtPath('https://example.com/index.html')).toBe('homepage.txt');
  });

  it('filters out percent-encoded .. and . segments', () => {
    expect(urlToTxtPath('https://evil.com/%2e%2e/etc/passwd')).toBe('etc/passwd.txt');
    expect(urlToTxtPath('https://example.com/a/%2e%2e/b/page.html')).toBe('b/page.txt');
    expect(urlToTxtPath('https://example.com/%2e/page.html')).toBe('page.txt');
  });

  it('filters out double-encoded .. segments', () => {
    expect(urlToTxtPath('https://evil.com/%252e%252e/etc/passwd')).toBe('etc/passwd.txt');
    // When .. is between segments, it is removed (not resolved), so a/..  →  a
    expect(urlToTxtPath('https://example.com/a/%252e%252e/b/page.html')).toBe('a/b/page.txt');
  });
});

// ---------------------------------------------------------------------------
// sync — path traversal guard
// ---------------------------------------------------------------------------

describe('assertPathWithinDir', () => {
  it('throws when a resolved path escapes the base directory', () => {
    expect(() => assertPathWithinDir('/tmp/inventory/../../etc/passwd', '/tmp/inventory')).toThrow(
      'Path traversal blocked'
    );
  });

  it('throws when an absolute path outside the base is provided', () => {
    expect(() => assertPathWithinDir('/etc/passwd', '/tmp/inventory')).toThrow(
      'Path traversal blocked'
    );
  });

  it('does not throw for paths inside the base directory', () => {
    expect(() => assertPathWithinDir('/tmp/inventory/a/page.txt', '/tmp/inventory')).not.toThrow();
    expect(() => assertPathWithinDir('/tmp/inventory/homepage.txt', '/tmp/inventory')).not.toThrow();
  });
});

describe('sync — path traversal guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shared.readInventory).mockResolvedValue([]);
    vi.mocked(shared.writeInventory).mockResolvedValue();
    vi.mocked(drive.ensureDriveFolder).mockResolvedValue('folder-id');
    vi.mocked(drive.uploadAsDoc).mockResolvedValue('doc-id');
    vi.mocked(drive.uploadAsSheet).mockResolvedValue('sheet-id');
    vi.mocked(drive.updateSheet).mockResolvedValue();
  });

  it('processes normal rows without triggering the guard', async () => {
    const rows: InventoryRow[] = [
      { URL: 'https://example.com/a/page.html', crawl_status: 'done' } as InventoryRow,
    ];
    vi.mocked(shared.readInventory).mockResolvedValue(rows);

    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue('safe content' as never);

    await sync({
      inventoryPath: '/tmp/inventory/_inventory.csv',
      driveFolderId: 'folder-1',
    });

    expect(drive.uploadAsDoc).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// sync — error isolation
// ---------------------------------------------------------------------------

describe('sync — error isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shared.readInventory).mockResolvedValue([]);
    vi.mocked(shared.writeInventory).mockResolvedValue();
    vi.mocked(drive.ensureDriveFolder).mockResolvedValue('folder-id');
    vi.mocked(drive.uploadAsSheet).mockResolvedValue('sheet-id');
    vi.mocked(drive.updateSheet).mockResolvedValue();
  });

  it('sets sync_status=error on the failing row and continues to the next row', async () => {
    // Two rows, both crawled. First one throws on upload.
    const rows: InventoryRow[] = [
      { URL: 'https://example.com/a/page1.html', crawl_status: 'done' } as InventoryRow,
      { URL: 'https://example.com/a/b/page2.html', crawl_status: 'done' } as InventoryRow,
    ];
    vi.mocked(shared.readInventory).mockResolvedValue(rows);

    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue('content' as never);

    // Fail on the first call to uploadAsDoc, succeed on the second.
    vi.mocked(drive.uploadAsDoc)
      .mockRejectedValueOnce(new Error('upload failed'))
      .mockResolvedValueOnce('doc-id-2');

    await sync({
      inventoryPath: '/tmp/test.csv',
      driveFolderId: 'folder-1',
    });

    // Second row was processed.
    expect(drive.uploadAsDoc).toHaveBeenCalledTimes(2);

    // writeInventory was called (at least once after the error row).
    expect(shared.writeInventory).toHaveBeenCalled();

    // The first row should have sync_status='error'.
    const writtenRows = vi.mocked(shared.writeInventory).mock.calls.at(-1)?.[1] as InventoryRow[];
    expect(writtenRows[0].sync_status).toBe('error');
    // The second row should have sync_status='done'.
    expect(writtenRows[1].sync_status).toBe('done');
  });

  it('does not crash when every row fails', async () => {
    const rows: InventoryRow[] = [
      { URL: 'https://example.com/a/page1.html', crawl_status: 'done' } as InventoryRow,
    ];
    vi.mocked(shared.readInventory).mockResolvedValue(rows);

    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue('content' as never);

    vi.mocked(drive.uploadAsDoc).mockRejectedValue(new Error('upload failed'));

    // Should not throw — errors are caught per-row.
    await expect(
      sync({ inventoryPath: '/tmp/test.csv', driveFolderId: 'folder-1' })
    ).resolves.not.toThrow();
  });
});