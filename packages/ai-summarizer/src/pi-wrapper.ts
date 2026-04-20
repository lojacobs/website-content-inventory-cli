import os from 'os';
import path from 'path';
import {
  AuthStorage,
  ModelRegistry,
  createAgentSession,
} from "@mariozechner/pi-coding-agent";

const AUTH_PATH = path.join(os.homedir(), '.pi', 'agent', 'auth.json');
const MODELS_PATH = path.join(os.homedir(), '.pi', 'agent', 'models.json');
const AGENT_DIR = path.join(os.homedir(), '.pi', 'agent');

const DEFAULT_PROVIDER = 'opencode-go';
const DEFAULT_MODEL_ID = 'minimax-m2.5';

export function buildRunPrompt(
  systemPrompt: string,
  providerName = DEFAULT_PROVIDER,
  modelId = DEFAULT_MODEL_ID
): (userPrompt: string) => Promise<string> {
  return async function runPrompt(userPrompt: string): Promise<string> {
    const authStorage = AuthStorage.create(AUTH_PATH);

    const registry = ModelRegistry.create(authStorage, MODELS_PATH);
    const model = registry.find(providerName, modelId);

    if (!model) {
      throw new Error(
        `Model "${providerName}/${modelId}" not found in registry. ` +
        `Available: ${registry.getAll().map(m => `${m.provider}/${m.id}`).join(', ')}`
      );
    }

    const { session } = await createAgentSession({
      authStorage,
      model,
      agentDir: AGENT_DIR,
    });

    const chunks: string[] = [];
    let agentEnded = false;

    return new Promise<string>((resolve, reject) => {
      // Subscribe to session events
      const unsubscribe = session.subscribe((event: any) => {
        try {
          if (event.type === 'message_end') {
            // Extract text from message content
            const textParts = event.message.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => (c as any).text);
            chunks.push(...textParts);
          } else if (event.type === 'agent_end') {
            // Agent has finished processing
            agentEnded = true;
            unsubscribe();
            resolve(chunks.join(''));
          }
        } catch (err) {
          unsubscribe();
          reject(err);
        }
      });

      // Send the message with system prompt prepended
      const messageToSend = `<system>${systemPrompt}</system>\n\n${userPrompt}`;
      session.sendUserMessage(messageToSend).catch((err: Error) => {
        unsubscribe();
        reject(err);
      });
    });
  };
}
