import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Pi SDK boundary BEFORE importing pi.ts.
vi.mock('@mariozechner/pi-coding-agent', () => {
  return {
    AuthStorage: { create: vi.fn(() => ({ __auth: true })) },
    ModelRegistry: { create: vi.fn(() => ({ find: vi.fn(() => ({ __mr: 'mr-model' })) })) },
    SessionManager: { inMemory: vi.fn(() => ({ __sm: true })) },
    DefaultResourceLoader: vi.fn((() => {
      return function DefaultResourceLoader() {
        return { reload: vi.fn().mockResolvedValue(undefined) };
      };
    })()),
    createAgentSession: vi.fn(async () => {
      // Simulate a session that emits two text_delta events when prompt() is called.
      let cb: (e: any) => void = () => {};
      return {
        session: {
          subscribe(handler: (e: any) => void) {
            cb = handler;
            return () => {};
          },
          async prompt(_text: string) {
            cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'hello ' } });
            cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'world' } });
          },
        },
      };
    }),
  };
});

vi.mock('@mariozechner/pi-ai', () => ({
  getModel: vi.fn(() => ({ __ai: 'ai-model' })),
}));

import { buildRunPrompt } from '../src/pi.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildRunPrompt', () => {
  it('returns a callable runPrompt', () => {
    const run = buildRunPrompt('SYSTEM');
    expect(typeof run).toBe('function');
  });

  it('concatenates streamed text_delta events and trims', async () => {
    const run = buildRunPrompt('SYSTEM');
    const out = await run('user content', { provider: 'opencode-go', modelId: 'minimax-m2.5' });
    expect(out).toBe('hello world');
  });

  it('forwards the system prompt to DefaultResourceLoader', async () => {
    const sdk = await import('@mariozechner/pi-coding-agent');
    const run = buildRunPrompt('CUSTOM-SYS');
    await run('q', { provider: 'opencode-go', modelId: 'minimax-m2.5' });
    const ctorArg = (sdk.DefaultResourceLoader as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ctorArg.systemPrompt).toBe('CUSTOM-SYS');
  });
});
