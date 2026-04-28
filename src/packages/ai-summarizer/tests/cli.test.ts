import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cliPath = resolve(__dirname, '../dist/cli.js');

describe('fci-summarize CLI', () => {
  it('--help lists the four required+optional flags', () => {
    const out = spawnSync('node', [cliPath, '--help'], { encoding: 'utf8' });
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('--inventory');
    expect(out.stdout).toContain('--provider');
    expect(out.stdout).toContain('--model');
    expect(out.stdout).toContain('--no-resume');
  });

  it('exits non-zero if a required flag is missing', () => {
    const out = spawnSync('node', [cliPath], { encoding: 'utf8' });
    expect(out.status).not.toBe(0);
    expect(out.stderr).toMatch(/required option|missing/i);
  });
});
