import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve, dirname } from 'node:path';
import { copyFile, readFile, mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Shared counter to differentiate classify vs summarize sessions
let sessionCounter = 0;

vi.mock('@mariozechner/pi-coding-agent', () => ({
  AuthStorage: { create: vi.fn(() => ({})) },
  ModelRegistry: { create: vi.fn(() => ({ find: vi.fn(() => null) })) },
  SessionManager: { inMemory: vi.fn(() => ({})) },
  DefaultResourceLoader: class { reload() {} },
  createAgentSession: vi.fn().mockImplementation(async () => {
    const idx = sessionCounter++;
    return {
      session: {
        subscribe(cb: any) {
          (globalThis as any)[`__cb_${idx}`] = cb;
          return () => {};
        },
        async prompt(text: string) {
          const cb = (globalThis as any)[`__cb_${idx}`];
          if (!cb) return;
          // First session (classify) -> 'homepage'; second (summarize) -> French summary
          const response = idx === 0
            ? 'homepage'
            : 'Bienvenue sur la page d\'accueil de test.';
          cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: response } });
        },
      },
    };
  }),
}));
vi.mock('@mariozechner/pi-ai', () => ({ getModel: vi.fn(() => null) }));
vi.mock('../src/auth.js', () => ({ validateProviderModel: vi.fn().mockResolvedValue(undefined) }));

import { summarize } from '../src/summarize.js';

describe('summarize() dry-run E2E', () => {
  beforeEach(() => {
    sessionCounter = 0;
  });

  it('processes a one-row inventory and writes both fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ai-sum-'));
    const fxDir = resolve(__dirname, 'fixtures');
    const inv = join(dir, '_inventory.csv');
    await copyFile(join(fxDir, '_inventory.csv'), inv);
    await copyFile(join(fxDir, 'homepage.txt'), join(dir, 'homepage.txt'));

    await summarize({
      inventoryPath: inv,
      aiProvider: 'opencode-go',
      aiModelId: 'minimax-m2.5',
    });

    const after = await readFile(inv, 'utf8');
    expect(after).toContain('homepage');
    expect(after).toMatch(/Bienvenue/);
    expect(after).toContain(',done,');
  });
});
