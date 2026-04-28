import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { validateProviderModel } from '../src/auth.js';

const fx = (name: string) => resolve(__dirname, 'fixtures', name);

describe('validateProviderModel', () => {
  it('throws with a descriptive error if auth.json is missing', async () => {
    await expect(
      validateProviderModel('opencode-go', 'minimax-m2.5', '/no/such/path.json')
    ).rejects.toThrow(/auth\.json/);
  });

  it('throws if the provider is not present', async () => {
    await expect(
      validateProviderModel('ghost-provider', 'any-model', fx('auth-with-opencode.json'))
    ).rejects.toThrow(/Provider "ghost-provider"/);
  });

  it('resolves when provider is present (model not validated)', async () => {
    await expect(
      validateProviderModel('opencode-go', 'minimax-m2.5', fx('auth-with-opencode.json'))
    ).resolves.toBeUndefined();
  });

  it('accepts any model string when provider exists', async () => {
    await expect(
      validateProviderModel('opencode-go', 'totally-made-up-model', fx('auth-no-models.json'))
    ).resolves.toBeUndefined();
  });

  it('throws if auth.json is empty', async () => {
    await expect(
      validateProviderModel('opencode-go', 'minimax-m2.5', fx('auth-minimal.json'))
    ).rejects.toThrow(/Available: \(none\)/);
  });
});
