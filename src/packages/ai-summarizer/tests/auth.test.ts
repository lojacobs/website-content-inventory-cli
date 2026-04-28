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

  it('throws if the provider exists but the model is not listed', async () => {
    await expect(
      validateProviderModel('opencode-go', 'gpt-4o-mini', fx('auth-with-opencode.json'))
    ).rejects.toThrow(/Model "gpt-4o-mini"/);
  });

  it('resolves when provider+model are both present', async () => {
    await expect(
      validateProviderModel('opencode-go', 'minimax-m2.5', fx('auth-with-opencode.json'))
    ).resolves.toBeUndefined();
  });

  it('is permissive when the provider is present but has no models list', async () => {
    await expect(
      validateProviderModel('opencode-go', 'whatever-model', fx('auth-no-models.json'))
    ).resolves.toBeUndefined();
  });

  it('throws if the providers array is empty', async () => {
    await expect(
      validateProviderModel('opencode-go', 'minimax-m2.5', fx('auth-minimal.json'))
    ).rejects.toThrow(/Available: \(none\)/);
  });
});
