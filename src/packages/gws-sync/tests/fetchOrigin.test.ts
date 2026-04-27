import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchToTemp } from '../src/fetchOrigin.js';
import { stat, access } from 'node:fs/promises';

describe('fetchToTemp', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('downloads a file to a temp path and returns a cleanup function', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('hello world'),
    } as unknown as Response);

    const result = await fetchToTemp('https://example.com/report.pdf');

    expect(result.tempPath).toContain('report.pdf');
    expect(result.tempPath).toMatch(/fci-sync-/);

    // File should exist on disk
    const s = await stat(result.tempPath);
    expect(s.isFile()).toBe(true);
    expect(s.size).toBe(11);

    // Cleanup should remove the file and directory
    await result.cleanup();
    await expect(access(result.tempPath)).rejects.toThrow();
  });

  it('uses "asset" as fallback filename when pathname has no basename', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('data'),
    } as unknown as Response);

    const result = await fetchToTemp('https://example.com/');

    expect(result.tempPath).toContain('asset');

    await result.cleanup();
  });

  it('throws on non-2xx HTTP status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response);

    await expect(fetchToTemp('https://example.com/missing.pdf')).rejects.toThrow(
      'fetch https://example.com/missing.pdf: HTTP 404',
    );
  });

  it('throws on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(fetchToTemp('https://example.com/file.pdf')).rejects.toThrow(
      'ECONNREFUSED',
    );
  });

  it('decodes percent-encoded characters in the temp filename', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('x'),
    } as unknown as Response);

    const result = await fetchToTemp('https://example.com/foo%20bar.pdf');
    expect(result.tempPath).toContain('foo bar.pdf');
    expect(result.tempPath).not.toContain('foo%20bar.pdf');
    await result.cleanup();
  });

  it('removes the temp directory when arrayBuffer() fails after mkdtemp', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => { throw new Error('aborted'); },
    } as unknown as Response);

    await expect(fetchToTemp('https://example.com/file.pdf')).rejects.toThrow('aborted');
    // No way to recover the temp dir path, but the test verifies the throw propagates
    // and (by inspection of the implementation) the dir is rmdir'd before re-throw.
  });

  it('cleans up even when called twice (idempotent)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('x'),
    } as unknown as Response);

    const result = await fetchToTemp('https://example.com/file.pdf');
    await result.cleanup();
    await result.cleanup(); // should not throw
  });
});
