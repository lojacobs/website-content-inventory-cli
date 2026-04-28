import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AuthJson } from './types.js';

const DEFAULT_AUTH_PATH = join(homedir(), '.pi', 'agent', 'auth.json');

/**
 * Validate that the provider exists in ~/.pi/agent/auth.json.
 * The model is NOT validated here — the Pi SDK resolves it at call time.
 * Throws a descriptive error if auth.json is missing or the provider key is absent.
 */
export async function validateProviderModel(
  provider: string,
  _modelId: string,
  authJsonPath: string = DEFAULT_AUTH_PATH
): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(authJsonPath, 'utf8');
  } catch {
    throw new Error(
      `auth.json not found at ${authJsonPath}. Run \`pi auth\` to authenticate.`
    );
  }

  const auth = JSON.parse(raw) as AuthJson;
  if (!(provider in auth)) {
    const available = Object.keys(auth).join(', ') || '(none)';
    throw new Error(
      `Provider "${provider}" not found in auth.json. Available: ${available}`
    );
  }
}
