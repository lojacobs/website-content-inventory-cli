import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AuthJson } from './types.js';

const DEFAULT_AUTH_PATH = join(homedir(), '.pi', 'agent', 'auth.json');

/**
 * Validate that provider+model are present in ~/.pi/agent/auth.json.
 * Throws a descriptive error on any mismatch (INV-01, FR1).
 */
export async function validateProviderModel(
  provider: string,
  modelId: string,
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
  const providers = auth.providers ?? [];
  const match = providers.find((p) => p.id === provider);

  if (!match) {
    const available = providers.map((p) => p.id).join(', ') || '(none)';
    throw new Error(
      `Provider "${provider}" not found in auth.json. Available: ${available}`
    );
  }

  if (Array.isArray(match.models) && match.models.length > 0 && !match.models.includes(modelId)) {
    throw new Error(
      `Model "${modelId}" not available for provider "${provider}". Available: ${match.models.join(', ')}`
    );
  }
}
