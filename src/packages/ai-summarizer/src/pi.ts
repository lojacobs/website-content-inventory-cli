import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from '@mariozechner/pi-coding-agent';
import { getModel } from '@mariozechner/pi-ai';
import type { RunOptions } from './types.js';

/**
 * Factory returning a runPrompt(userContent, opts) closure bound to a system prompt.
 * Used to build runClassify and runSummarize. Streams text_delta events from the
 * Pi SDK session and returns the trimmed concatenation.
 */
export function buildRunPrompt(systemPrompt: string) {
  return async function runPrompt(
    userContent: string,
    opts: RunOptions,
    authJsonPath?: string
  ): Promise<string> {
    const authStorage = AuthStorage.create(authJsonPath);
    const modelRegistry = ModelRegistry.create(authStorage);

    const loader = new DefaultResourceLoader({
      systemPromptOverride: () => systemPrompt,
    });
    await loader.reload();

    const model =
      modelRegistry.find?.(opts.provider, opts.modelId) ??
      getModel(opts.provider, opts.modelId) ??
      undefined;

    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      authStorage,
      modelRegistry,
      resourceLoader: loader,
      ...(model ? { model } : {}),
    });

    let output = '';
    const unsubscribe = session.subscribe((event: any) => {
      if (
        event?.type === 'message_update' &&
        event.assistantMessageEvent?.type === 'text_delta'
      ) {
        output += event.assistantMessageEvent.delta;
      }
    });

    await session.prompt(userContent);
    unsubscribe();

    return output.trim();
  };
}
