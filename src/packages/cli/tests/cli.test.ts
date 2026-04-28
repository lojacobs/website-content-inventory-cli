import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cliPath = resolve(__dirname, '../dist/index.js');

describe('inventory CLI', () => {
  it('--help lists all flags and exits 0', () => {
    const out = spawnSync('node', [cliPath, '--help'], { encoding: 'utf8' });
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('--url');
    expect(out.stdout).toContain('--urls-file');
    expect(out.stdout).toContain('--client');
    expect(out.stdout).toContain('--project');
    expect(out.stdout).toContain('--output');
    expect(out.stdout).toContain('--inventory');
    expect(out.stdout).toContain('--folder-id');
    expect(out.stdout).toContain('--provider');
    expect(out.stdout).toContain('--model');
    expect(out.stdout).toContain('--mode');
    expect(out.stdout).toContain('--delay');
    expect(out.stdout).toContain('--no-resume');
    expect(out.stdout).toContain('--skip-crawl');
    expect(out.stdout).toContain('--skip-summarize');
    expect(out.stdout).toContain('--skip-sync');
  });

  it('exits non-zero when crawl required flags are missing', () => {
    const out = spawnSync('node', [cliPath], { encoding: 'utf8' });
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/required|required option|missing/i);
  });

  it('--skip-crawl --skip-summarize --skip-sync exits 0 (no-op)', () => {
    const out = spawnSync(
      'node',
      [cliPath, '--skip-crawl', '--skip-summarize', '--skip-sync'],
      { encoding: 'utf8' },
    );
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('nothing to do');
  });
});
