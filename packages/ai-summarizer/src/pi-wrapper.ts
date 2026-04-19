/**
 * Pi SDK wrapper — factory that creates a one-shot prompt runner.
 *
 * Uses @mariozechner/pi-coding-agent SDK:
 *   - AuthStorage  : loads saved Pi credentials from disk
 *   - createAgentSession : creates a streaming agent session
 *   - DefaultResourceLoader : supplies the system prompt as a resource
 *
 * No global `pi` binary is required.
 */

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
} from "@mariozechner/pi-coding-agent";

/**
 * Build a reusable `runPrompt` function bound to a fixed system prompt.
 *
 * @param systemPrompt - The system-level instruction for every call.
 * @returns An async function that accepts a user prompt and returns the
 *          full text response as a string.
 *
 * @example
 * ```ts
 * const runPrompt = buildRunPrompt("You are a helpful assistant.");
 * const answer = await runPrompt("Summarise this page: ...");
 * ```
 */
export function buildRunPrompt(
  systemPrompt: string
): (userPrompt: string) => Promise<string> {
  return async function runPrompt(userPrompt: string): Promise<string> {
    // Load credentials that were saved by `pi auth login` (or equivalent).
    const auth = await AuthStorage.load();

    // Provide the system prompt as a named resource the SDK can inject.
    const resourceLoader = new DefaultResourceLoader({
      "system-prompt": systemPrompt,
    });

    // Open a streaming session.
    const session = await createAgentSession({
      auth,
      resourceLoader,
      systemPrompt,
    });

    // Collect all text_delta chunks into one string.
    const chunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      session.on("text_delta", (delta: { text: string }) => {
        chunks.push(delta.text);
      });

      session.on("error", (err: Error) => {
        reject(err);
      });

      session.on("done", () => {
        resolve();
      });

      // Send the user message to kick off generation.
      session.send(userPrompt).catch(reject);
    });

    await session.close?.();

    return chunks.join("");
  };
}
