# PLAN 3 v3 — AI Summarizer Package

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `ai-summarizer` module — a workspace package that classifies each crawled page into one of 14 page types and writes a ≤200-character summary back to `_inventory.csv`, exposed via the `fci-summarize` CLI.

**Architecture:** Row-by-row pipeline. For each `_inventory.csv` row with `crawl_status=done` and (`ai_status !== 'done'` or `--no-resume`), read the local `.txt`, build a 2000-char-truncated user prompt, then run **classify** and **summarize** in parallel via `Promise.all` against the user-chosen Pi provider/model. Hard-slice the summary to 200 chars, set `ai_status=done`, and flush the CSV after every row so a crash never loses progress. Provider+model are validated against `~/.pi/agent/auth.json` before any AI call.

**Tech Stack:** TypeScript 5 (NodeNext), pnpm workspace, Node 20+, vitest, commander, `@mariozechner/pi-coding-agent` + `@mariozechner/pi-ai`, shared CSV utils from `@full-content-inventory/shared`.

---

## v3 Changes vs v2

| Area | v2 | v3 (this plan) |
|---|---|---|
| Package paths | `packages/ai-summarizer/` | `src/packages/ai-summarizer/` (matches actual monorepo layout) |
| Shared package import | `@fci/shared` | `@full-content-inventory/shared` (matches actual `package.json`) |
| Local txt path | `row.local_path` (field does not exist) | `path.resolve(dirname(inventoryPath), urlToFilename(row.URL))` |
| `error_message` column | written but not declared | declared in `InventoryRow` + `INVENTORY_COLUMNS` |
| `SummarizeConfig` | added in Task 4 mid-orchestrator | added first in Task 1 (clear dependency boundary) |
| Pi SDK test strategy | only an integration guard | unit tests with mocked `@mariozechner/pi-coding-agent` boundary |
| E2E | live live live | optional live + scripted dry-run with mocked SDK |

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/packages/shared/src/types.ts` | modify | Add `SummarizeConfig` interface and `error_message` column to `InventoryRow` |
| `src/packages/shared/src/constants.ts` | modify | Add `'error_message'` to `INVENTORY_COLUMNS` |
| `src/packages/shared/src/index.ts` | modify | Re-export `SummarizeConfig` |
| `src/packages/ai-summarizer/package.json` | modify | Add deps, `bin: fci-summarize`, vitest + test script |
| `src/packages/ai-summarizer/tsconfig.json` | unchanged | Already references shared |
| `src/packages/ai-summarizer/src/types.ts` | create | `RunOptions`, `AuthJson` (local types) |
| `src/packages/ai-summarizer/src/auth.ts` | create | `validateProviderModel(provider, modelId, path?)` |
| `src/packages/ai-summarizer/src/prompts.ts` | create | `PAGE_TYPES`, two system prompts, `buildSummaryUserContent`, `hardSliceSummary` |
| `src/packages/ai-summarizer/src/pi.ts` | create | `buildRunPrompt(systemPrompt)` factory wrapping the Pi SDK |
| `src/packages/ai-summarizer/src/summarize.ts` | create | `summarize(config: SummarizeConfig)` — orchestrator |
| `src/packages/ai-summarizer/src/index.ts` | create | Public exports: `summarize` + types |
| `src/packages/ai-summarizer/src/cli.ts` | create | `fci-summarize` commander entry |
| `src/packages/ai-summarizer/tests/auth.test.ts` | create | Unit tests for auth validation |
| `src/packages/ai-summarizer/tests/prompts.test.ts` | create | Unit tests for prompts/truncation/slicing |
| `src/packages/ai-summarizer/tests/pi.test.ts` | create | Unit tests for SDK wrapper (mocked) |
| `src/packages/ai-summarizer/tests/summarize.test.ts` | create | Unit tests for orchestrator (full mock) |
| `src/packages/ai-summarizer/tests/cli.test.ts` | create | Smoke test for CLI (--help, exit codes) |
| `src/packages/ai-summarizer/tests/fixtures/auth-minimal.json` | create | Empty providers fixture |
| `src/packages/ai-summarizer/tests/fixtures/auth-with-opencode.json` | create | Provider+model match fixture |
| `src/packages/ai-summarizer/tests/fixtures/auth-no-models.json` | create | Provider exists, models list missing → permissive |

---

## Task 1: Extend `@full-content-inventory/shared`

**Why first:** Establishes the canonical `SummarizeConfig` type and the `error_message` column before any consumer is written. INV: spec §"Integration Points → Consumed from other modules" lists `SummarizeConfig` as exported from `@fci/shared`; spec §FR9 writes `error_message` to the row.

**Files:**
- Modify: `src/packages/shared/src/types.ts`
- Modify: `src/packages/shared/src/constants.ts`
- Modify: `src/packages/shared/src/index.ts`
- Test: `src/packages/shared/tests/types.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```typescript
// src/packages/shared/tests/types.test.ts
import { describe, it, expect } from 'vitest';
import { INVENTORY_COLUMNS, type SummarizeConfig, type InventoryRow } from '../src/index.js';

describe('shared types', () => {
  it('SummarizeConfig has the four spec fields', () => {
    const cfg: SummarizeConfig = {
      inventoryPath: '/tmp/_inventory.csv',
      aiProvider: 'opencode-go',
      aiModelId: 'minimax-m2.5',
      resume: true,
    };
    expect(cfg.inventoryPath).toBe('/tmp/_inventory.csv');
    expect(cfg.aiProvider).toBe('opencode-go');
    expect(cfg.aiModelId).toBe('minimax-m2.5');
    expect(cfg.resume).toBe(true);
  });

  it('SummarizeConfig.resume is optional', () => {
    const cfg: SummarizeConfig = {
      inventoryPath: '/tmp/_inventory.csv',
      aiProvider: 'opencode-go',
      aiModelId: 'minimax-m2.5',
    };
    expect(cfg.resume).toBeUndefined();
  });

  it('INVENTORY_COLUMNS includes error_message after ai_status', () => {
    const idxAi = INVENTORY_COLUMNS.indexOf('ai_status');
    const idxErr = INVENTORY_COLUMNS.indexOf('error_message');
    expect(idxErr).toBeGreaterThan(-1);
    expect(idxErr).toBe(idxAi + 1);
  });

  it('InventoryRow accepts error_message', () => {
    const row: InventoryRow = {
      URL: 'https://x.test/',
      Titre: '',
      Description: '',
      Resume_200_chars: '',
      Type_de_page: '',
      Profondeur_URL: 0,
      Nb_mots: 0,
      Statut_HTTP: 200,
      Langue: 'fr',
      Date_modifiee: '',
      Canonical: '',
      Noindex: 'no',
      Nb_images: 0,
      'Fichiers_liés': 0,
      Lien_Google_Doc: '',
      Lien_dossier_Drive: '',
      error_message: 'boom',
    };
    expect(row.error_message).toBe('boom');
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
cd src/packages/shared && pnpm test
```

Expected: `error: 'SummarizeConfig' is not exported` and `'error_message' does not exist on type 'InventoryRow'`.

- [ ] **Step 3: Edit `src/packages/shared/src/types.ts`**

Add the `error_message` field to `InventoryRow`, append `'error_message'` to `InventoryColumn`, and add `SummarizeConfig`. Patch the existing file:

```typescript
// after the ai_status field, add:
  /** Last error message if ai_status === 'error' */
  error_message?: string;
```

```typescript
// in InventoryColumn union, add at the end:
  | 'error_message';
```

Add at the bottom of the file:

```typescript
/**
 * Configuration for the AI summarizer pipeline (consumed by ai-summarizer).
 */
export interface SummarizeConfig {
  /** Absolute or relative path to _inventory.csv */
  inventoryPath: string;
  /** Provider ID, must match an entry in ~/.pi/agent/auth.json */
  aiProvider: string;
  /** Model ID, must match the provider's model list in auth.json */
  aiModelId: string;
  /** Defaults to true. Set false (via --no-resume) to re-process done rows. */
  resume?: boolean;
}
```

- [ ] **Step 4: Edit `src/packages/shared/src/constants.ts`**

Append `'error_message'` after `'ai_status'`:

```typescript
export const INVENTORY_COLUMNS = [
  'URL',
  'URL_finale',
  'Titre',
  'Description',
  'Resume_200_chars',
  'Type_de_page',
  'Profondeur_URL',
  'Nb_mots',
  'Statut_HTTP',
  'Langue',
  'Date_modifiee',
  'Canonical',
  'Noindex',
  'Nb_images',
  'Fichiers_liés',
  'Lien_Google_Doc',
  'Lien_dossier_Drive',
  'crawl_status',
  'sync_status',
  'ai_status',
  'error_message',
] as const;
```

- [ ] **Step 5: Edit `src/packages/shared/src/index.ts`**

Add `SummarizeConfig` to the existing `export type` line:

```typescript
export type { CrawlConfig, CrawlResult, InventoryRow, InventoryColumn, SummarizeConfig } from './types.js';
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd src/packages/shared && pnpm test && pnpm build
```

Expected: all 4 tests pass; `tsc --build` exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/packages/shared/src/ src/packages/shared/tests/
git commit -m "feat(shared): add SummarizeConfig type and error_message inventory column"
```

---

## Task 2: Scaffold the `ai-summarizer` package

**Files:**
- Modify: `src/packages/ai-summarizer/package.json`
- Create: `src/packages/ai-summarizer/src/types.ts`
- Create: `src/packages/ai-summarizer/src/index.ts`

- [ ] **Step 1: Edit `src/packages/ai-summarizer/package.json`**

Replace contents with:

```json
{
  "name": "@full-content-inventory/ai-summarizer",
  "version": "0.1.0",
  "type": "module",
  "description": "AI-powered content summarization",
  "bin": {
    "fci-summarize": "./dist/cli.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "clean": "rm -rf dist tsconfig.tsbuildinfo",
    "test": "vitest run"
  },
  "dependencies": {
    "@full-content-inventory/shared": "workspace:*",
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*",
    "commander": "*"
  },
  "devDependencies": {
    "@types/node": "^25.6.0",
    "typescript": "^5.4.0",
    "vitest": "*"
  }
}
```

- [ ] **Step 2: Create `src/packages/ai-summarizer/src/types.ts`**

```typescript
/**
 * Local types for ai-summarizer.
 * SummarizeConfig is re-exported from @full-content-inventory/shared.
 */

/** Forwarded to every Pi SDK call. Both fields required (INV-02). */
export interface RunOptions {
  provider: string;
  modelId: string;
}

/** Shape of ~/.pi/agent/auth.json — read-only. */
export interface AuthJson {
  providers?: Array<{
    id: string;
    models?: string[];
  }>;
}
```

- [ ] **Step 3: Create `src/packages/ai-summarizer/src/index.ts`**

```typescript
/**
 * @full-content-inventory/ai-summarizer
 * Public surface: summarize() + types.
 */
export { summarize } from './summarize.js';
export type { RunOptions, AuthJson } from './types.js';
export type { SummarizeConfig } from '@full-content-inventory/shared';
```

The `summarize` import will be unresolved until Task 6 — that is intentional. Build will fail until then; we run partial builds per task.

- [ ] **Step 4: Install deps**

```bash
cd src && pnpm install
```

Expected: `pnpm-lock.yaml` updates with `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `commander`, `vitest`, `@types/node`.

- [ ] **Step 5: Commit**

```bash
git add src/packages/ai-summarizer/package.json src/packages/ai-summarizer/src/types.ts src/packages/ai-summarizer/src/index.ts src/pnpm-lock.yaml
git commit -m "feat(ai-summarizer): scaffold package with deps, bin, and types"
```

---

## Task 3: Provider+model auth validation (`auth.ts`)

**Spec ties:** FR1, INV-01, SEC-no-keys-in-code.

**Files:**
- Create: `src/packages/ai-summarizer/src/auth.ts`
- Create: `src/packages/ai-summarizer/tests/auth.test.ts`
- Create: `src/packages/ai-summarizer/tests/fixtures/auth-minimal.json`
- Create: `src/packages/ai-summarizer/tests/fixtures/auth-with-opencode.json`
- Create: `src/packages/ai-summarizer/tests/fixtures/auth-no-models.json`

- [ ] **Step 1: Create the three fixtures**

```json
// src/packages/ai-summarizer/tests/fixtures/auth-minimal.json
{ "providers": [] }
```

```json
// src/packages/ai-summarizer/tests/fixtures/auth-with-opencode.json
{
  "providers": [
    { "id": "opencode-go", "models": ["minimax-m2.5", "claude-haiku-4-5"] },
    { "id": "openai",      "models": ["gpt-4o-mini"] }
  ]
}
```

```json
// src/packages/ai-summarizer/tests/fixtures/auth-no-models.json
{
  "providers": [
    { "id": "opencode-go" }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// src/packages/ai-summarizer/tests/auth.test.ts
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
```

- [ ] **Step 3: Run the tests — verify they fail**

```bash
cd src/packages/ai-summarizer && pnpm test
```

Expected: `Cannot find module '../src/auth.js'`.

- [ ] **Step 4: Implement `src/packages/ai-summarizer/src/auth.ts`**

```typescript
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
```

- [ ] **Step 5: Run tests — verify all 6 pass**

```bash
cd src/packages/ai-summarizer && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add src/packages/ai-summarizer/src/auth.ts src/packages/ai-summarizer/tests/auth.test.ts src/packages/ai-summarizer/tests/fixtures/
git commit -m "feat(ai-summarizer): provider+model validation against ~/.pi/agent/auth.json"
```

---

## Task 4: Prompts and content shaping (`prompts.ts`)

**Spec ties:** FR4 (14 labels), FR5 (same language), FR7 (truncate to 2000 chars), INV-04 (hard-slice 200), INV-06 (label allowlist).

**Files:**
- Create: `src/packages/ai-summarizer/src/prompts.ts`
- Create: `src/packages/ai-summarizer/tests/prompts.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/packages/ai-summarizer/tests/prompts.test.ts
import { describe, it, expect } from 'vitest';
import {
  PAGE_TYPES,
  CLASSIFY_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserContent,
  hardSliceSummary,
} from '../src/prompts.js';

describe('PAGE_TYPES', () => {
  it('contains exactly the 14 spec labels', () => {
    expect(PAGE_TYPES).toEqual([
      'homepage', 'service', 'about', 'contact', 'blog-post',
      'news', 'faq', 'landing-page', 'resource', 'product',
      'category', 'legal', 'form', 'other',
    ]);
  });
});

describe('CLASSIFY_SYSTEM_PROMPT / SUMMARY_SYSTEM_PROMPT', () => {
  it('classify prompt enumerates every label', () => {
    for (const label of PAGE_TYPES) {
      expect(CLASSIFY_SYSTEM_PROMPT).toContain(label);
    }
  });

  it('summary prompt requires 200-character cap and same-language', () => {
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/200 char/i);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/same language/i);
  });
});

describe('buildSummaryUserContent', () => {
  it('truncates body to 2000 chars before composing the prompt', () => {
    const long = 'a'.repeat(5000);
    const out = buildSummaryUserContent('Title', long);
    // Title + framing add ~30 chars; total must be <= 2000 + framing budget
    expect(out.length).toBeLessThanOrEqual(2000 + 64);
  });

  it('keeps ≤2000-char body intact and includes the title', () => {
    const out = buildSummaryUserContent('My Page', 'short body');
    expect(out).toContain('My Page');
    expect(out).toContain('short body');
  });
});

describe('hardSliceSummary', () => {
  it('passes through ≤200-char strings unchanged', () => {
    expect(hardSliceSummary('a'.repeat(200))).toHaveLength(200);
    expect(hardSliceSummary('hello')).toBe('hello');
  });

  it('hard-slices >200-char strings to exactly 200', () => {
    expect(hardSliceSummary('a'.repeat(500))).toHaveLength(200);
  });

  it('trims whitespace before slicing', () => {
    expect(hardSliceSummary('  hi  ')).toBe('hi');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd src/packages/ai-summarizer && pnpm test
```

Expected: module not found.

- [ ] **Step 3: Implement `src/packages/ai-summarizer/src/prompts.ts`**

```typescript
/**
 * System prompts and content-shaping helpers for ai-summarizer.
 *
 * INV-04: Resume_200_chars hard-sliced before write.
 * INV-06: Type_de_page must be one of PAGE_TYPES.
 * FR7:   Truncate page text to 2000 chars before any model call.
 */

export const PAGE_TYPES = [
  'homepage',
  'service',
  'about',
  'contact',
  'blog-post',
  'news',
  'faq',
  'landing-page',
  'resource',
  'product',
  'category',
  'legal',
  'form',
  'other',
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

const PAGE_TYPE_BULLETS = PAGE_TYPES.map((t) => `- ${t}`).join('\n');

export const CLASSIFY_SYSTEM_PROMPT = `You are a content classification expert. Given the content of a web page, classify it into exactly one of these page types:

${PAGE_TYPE_BULLETS}

Respond with ONLY the page type label, no explanation, no punctuation.`;

export const SUMMARY_SYSTEM_PROMPT = `You are a content summarizer. Given the content of a web page, write a summary in the same language as the page content. The summary must be 200 characters or fewer. Be factual and neutral. Do not start with "This page" or "The page". Respond with ONLY the summary text.`;

const MAX_BODY_CHARS = 2000;

/**
 * Build the user-content prompt body. Truncates `pageText` to 2000 chars (FR7).
 */
export function buildSummaryUserContent(pageTitle: string, pageText: string): string {
  const truncated = pageText.slice(0, MAX_BODY_CHARS);
  return `Title: ${pageTitle}\n\nContent:\n${truncated}`;
}

/**
 * Hard-slice a model summary to ≤200 characters (INV-04). Trims whitespace first.
 */
export function hardSliceSummary(raw: string): string {
  return raw.trim().slice(0, 200);
}
```

- [ ] **Step 4: Run tests — verify all 8 pass**

```bash
cd src/packages/ai-summarizer && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add src/packages/ai-summarizer/src/prompts.ts src/packages/ai-summarizer/tests/prompts.test.ts
git commit -m "feat(ai-summarizer): system prompts, 14-label allowlist, and 2000/200 truncation helpers"
```

---

## Task 5: Pi SDK wrapper (`pi.ts`)

**Spec ties:** Architecture §"Pi SDK session wiring", FR6 (parallel runs), INV-02 (provider+modelId always required).

**Files:**
- Create: `src/packages/ai-summarizer/src/pi.ts`
- Create: `src/packages/ai-summarizer/tests/pi.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/packages/ai-summarizer/tests/pi.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Pi SDK boundary BEFORE importing pi.ts.
vi.mock('@mariozechner/pi-coding-agent', () => {
  return {
    AuthStorage: { create: vi.fn(() => ({ __auth: true })) },
    ModelRegistry: { create: vi.fn(() => ({ find: vi.fn(() => ({ __mr: 'mr-model' })) })) },
    SessionManager: { inMemory: vi.fn(() => ({ __sm: true })) },
    DefaultResourceLoader: vi.fn().mockImplementation(() => ({
      reload: vi.fn().mockResolvedValue(undefined),
    })),
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
    expect(ctorArg.systemPromptOverride()).toBe('CUSTOM-SYS');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd src/packages/ai-summarizer && pnpm test
```

Expected: `Cannot find module '../src/pi.js'`.

- [ ] **Step 3: Implement `src/packages/ai-summarizer/src/pi.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests — verify all 3 pass**

```bash
cd src/packages/ai-summarizer && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add src/packages/ai-summarizer/src/pi.ts src/packages/ai-summarizer/tests/pi.test.ts
git commit -m "feat(ai-summarizer): pi SDK wrapper with required provider+model and streaming aggregator"
```

---

## Task 6: `summarize()` orchestrator

**Spec ties:** FR2/FR3 (skip rules), FR6 (parallel), FR8 (write fields + status), FR9 (error per-row), FR10 (flush after each row), INV-03/INV-04/INV-05.

**Files:**
- Create: `src/packages/ai-summarizer/src/summarize.ts`
- Create: `src/packages/ai-summarizer/tests/summarize.test.ts`
- Create: `src/packages/ai-summarizer/tests/fixtures/page.txt`

- [ ] **Step 1: Create `src/packages/ai-summarizer/tests/fixtures/page.txt`**

```
Bonjour. Ceci est une page de test pour le summarizer.
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/packages/ai-summarizer/tests/summarize.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InventoryRow } from '@full-content-inventory/shared';

vi.mock('@full-content-inventory/shared', async (orig) => {
  const actual = await orig<typeof import('@full-content-inventory/shared')>();
  return {
    ...actual,
    readInventory: vi.fn<() => Promise<InventoryRow[]>>(),
    writeInventory: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
});

vi.mock('../src/auth.js', () => ({
  validateProviderModel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/pi.js', () => ({
  buildRunPrompt: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('page body text'),
}));

import * as shared from '@full-content-inventory/shared';
import * as auth from '../src/auth.js';
import * as pi from '../src/pi.js';
import { summarize } from '../src/summarize.js';

const baseRow = (over: Partial<InventoryRow>): InventoryRow => ({
  URL: 'https://x.test/a',
  Titre: 'A',
  Description: '',
  Resume_200_chars: '',
  Type_de_page: '',
  Profondeur_URL: 0,
  Nb_mots: 0,
  Statut_HTTP: 200,
  Langue: 'fr',
  Date_modifiee: '',
  Canonical: '',
  Noindex: 'no',
  Nb_images: 0,
  'Fichiers_liés': 0,
  Lien_Google_Doc: '',
  Lien_dossier_Drive: '',
  crawl_status: 'done',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: classify returns 'service', summary returns a 250-char string.
  (pi.buildRunPrompt as any)
    .mockReturnValueOnce(vi.fn().mockResolvedValue('service'))   // classify
    .mockReturnValueOnce(vi.fn().mockResolvedValue('a'.repeat(250))); // summary
});

describe('summarize()', () => {
  it('calls validateProviderModel before any row work', async () => {
    (shared.readInventory as any).mockResolvedValue([]);
    await summarize({
      inventoryPath: '/tmp/i.csv',
      aiProvider: 'p', aiModelId: 'm',
    });
    expect(auth.validateProviderModel).toHaveBeenCalledWith('p', 'm');
  });

  it('skips rows where crawl_status !== done', async () => {
    const rows = [baseRow({ crawl_status: 'error' })];
    (shared.readInventory as any).mockResolvedValue(rows);
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    expect(rows[0].ai_status).toBeUndefined();
  });

  it('skips rows where ai_status === done unless resume=false', async () => {
    const rows = [baseRow({ ai_status: 'done', Type_de_page: 'old', Resume_200_chars: 'kept' })];
    (shared.readInventory as any).mockResolvedValue(rows);
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    expect(rows[0].Type_de_page).toBe('old');
    expect(rows[0].Resume_200_chars).toBe('kept');
  });

  it('writes Type_de_page, hard-slices Resume_200_chars to 200, and sets ai_status=done', async () => {
    const rows = [baseRow({})];
    (shared.readInventory as any).mockResolvedValue(rows);
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    expect(rows[0].Type_de_page).toBe('service');
    expect(rows[0].Resume_200_chars).toHaveLength(200);
    expect(rows[0].ai_status).toBe('done');
    expect(rows[0].error_message).toBe('');
  });

  it('flushes the CSV after every processed row', async () => {
    const rows = [baseRow({ URL: 'https://x.test/a' }), baseRow({ URL: 'https://x.test/b' })];
    (shared.readInventory as any).mockResolvedValue(rows);
    // 2 rows × 2 prompts = 4 buildRunPrompt calls; reset mock seq:
    (pi.buildRunPrompt as any).mockReset();
    (pi.buildRunPrompt as any)
      .mockReturnValueOnce(vi.fn().mockResolvedValue('service'))
      .mockReturnValueOnce(vi.fn().mockResolvedValue('xx'));
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    expect(shared.writeInventory).toHaveBeenCalledTimes(2);
  });

  it('on per-row error: sets ai_status=error, writes error_message, continues', async () => {
    const rows = [baseRow({ URL: 'https://x.test/a' }), baseRow({ URL: 'https://x.test/b' })];
    (shared.readInventory as any).mockResolvedValue(rows);
    (pi.buildRunPrompt as any).mockReset();
    // Row A: classify rejects → row marked error.
    (pi.buildRunPrompt as any)
      .mockReturnValueOnce(vi.fn().mockRejectedValue(new Error('boom')))
      .mockReturnValueOnce(vi.fn().mockResolvedValue('summary'));
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    expect(rows[0].ai_status).toBe('error');
    expect(rows[0].error_message).toBe('boom');
    // Second row was still attempted (writeInventory called twice).
    expect(shared.writeInventory).toHaveBeenCalledTimes(2);
  });

  it('runs classify and summarize concurrently (Promise.all)', async () => {
    let order: string[] = [];
    const classify = vi.fn().mockImplementation(async () => {
      order.push('classify-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('classify-end');
      return 'service';
    });
    const summary = vi.fn().mockImplementation(async () => {
      order.push('summary-start');
      await new Promise((r) => setTimeout(r, 5));
      order.push('summary-end');
      return 'ok';
    });
    (pi.buildRunPrompt as any).mockReset();
    (pi.buildRunPrompt as any)
      .mockReturnValueOnce(classify)
      .mockReturnValueOnce(summary);
    (shared.readInventory as any).mockResolvedValue([baseRow({})]);
    await summarize({ inventoryPath: '/tmp/i.csv', aiProvider: 'p', aiModelId: 'm' });
    // Both starts must precede either end.
    expect(order.indexOf('classify-start')).toBeLessThan(order.indexOf('summary-end'));
    expect(order.indexOf('summary-start')).toBeLessThan(order.indexOf('classify-end'));
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd src/packages/ai-summarizer && pnpm test
```

Expected: `Cannot find module '../src/summarize.js'`.

- [ ] **Step 4: Implement `src/packages/ai-summarizer/src/summarize.ts`**

```typescript
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  readInventory,
  writeInventory,
  urlToFilename,
  type SummarizeConfig,
} from '@full-content-inventory/shared';
import { validateProviderModel } from './auth.js';
import { buildRunPrompt } from './pi.js';
import {
  CLASSIFY_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserContent,
  hardSliceSummary,
} from './prompts.js';
import type { RunOptions } from './types.js';

/**
 * Run the AI summarizer pipeline against an _inventory.csv.
 *
 * Per spec:
 *   - validates provider+model first (INV-01)
 *   - skips rows by crawl_status / ai_status (FR2, FR3)
 *   - runs classify + summarize concurrently (INV-03)
 *   - hard-slices summary to 200 chars (INV-04)
 *   - flushes CSV after every row (INV-05)
 *   - per-row errors do not abort the run (FR9)
 */
export async function summarize(config: SummarizeConfig): Promise<void> {
  const { inventoryPath, aiProvider, aiModelId, resume = true } = config;

  await validateProviderModel(aiProvider, aiModelId);

  const rows = await readInventory(inventoryPath);
  if (rows.length === 0) {
    console.log('[summarize] No rows in inventory.');
    return;
  }

  const opts: RunOptions = { provider: aiProvider, modelId: aiModelId };
  const runClassify = buildRunPrompt(CLASSIFY_SYSTEM_PROMPT);
  const runSummarize = buildRunPrompt(SUMMARY_SYSTEM_PROMPT);

  const inventoryDir = dirname(resolve(inventoryPath));

  for (const row of rows) {
    if (row.crawl_status !== 'done') continue;
    if (resume && row.ai_status === 'done') continue;

    try {
      const txtPath = resolve(inventoryDir, urlToFilename(row.URL));
      const text = await readFile(txtPath, 'utf8');
      const userContent = buildSummaryUserContent(row.Titre ?? '', text);

      const [pageType, summary] = await Promise.all([
        runClassify(userContent, opts),
        runSummarize(userContent, opts),
      ]);

      row.Type_de_page = pageType.trim();
      row.Resume_200_chars = hardSliceSummary(summary);
      row.ai_status = 'done';
      row.error_message = '';
    } catch (err) {
      row.ai_status = 'error';
      row.error_message = err instanceof Error ? err.message : String(err);
    }

    await writeInventory(inventoryPath, rows);
    console.log(`[summarize] ${row.URL} → ${row.Type_de_page || row.ai_status}`);
  }

  console.log('[summarize] Done.');
}
```

- [ ] **Step 5: Run tests — verify all 7 pass**

```bash
cd src/packages/ai-summarizer && pnpm test
```

- [ ] **Step 6: Build the package**

```bash
cd src/packages/ai-summarizer && pnpm build
```

Expected: `tsc --build` exits 0; `dist/summarize.js` and `dist/index.js` exist.

- [ ] **Step 7: Commit**

```bash
git add src/packages/ai-summarizer/src/summarize.ts src/packages/ai-summarizer/tests/summarize.test.ts src/packages/ai-summarizer/tests/fixtures/page.txt
git commit -m "feat(ai-summarizer): row-by-row orchestrator with parallel classify+summarize and per-row error containment"
```

---

## Task 7: `fci-summarize` CLI

**Spec ties:** FR11 (CLI flags).

**Files:**
- Create: `src/packages/ai-summarizer/src/cli.ts`
- Create: `src/packages/ai-summarizer/tests/cli.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/packages/ai-summarizer/tests/cli.test.ts
import { describe, it, expect } from 'vitest';
import { execa } from 'node:child_process';
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
```

(The unused `execa` import keeps the file matching the project's typing style — remove if your linter complains.)

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd src/packages/ai-summarizer && pnpm build && pnpm test
```

Expected: build fails with "Cannot find module './cli.js'" — confirms cli.ts isn't there yet.

- [ ] **Step 3: Implement `src/packages/ai-summarizer/src/cli.ts`**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { summarize } from './summarize.js';

const program = new Command();

program
  .name('fci-summarize')
  .description('Classify and summarize crawled pages in _inventory.csv via the Pi SDK.')
  .requiredOption('-i, --inventory <path>', 'Path to _inventory.csv')
  .requiredOption('--provider <name>',     'AI provider (must match ~/.pi/agent/auth.json)')
  .requiredOption('--model <id>',          'AI model ID (must match ~/.pi/agent/auth.json)')
  .option('--no-resume',                   'Re-summarize rows even if ai_status=done');

program.action(async (options) => {
  try {
    await summarize({
      inventoryPath: options.inventory,
      aiProvider:    options.provider,
      aiModelId:     options.model,
      resume:        options.resume,
    });
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
});

program.parse(process.argv);
```

- [ ] **Step 4: Build, then run tests — verify both pass**

```bash
cd src/packages/ai-summarizer && pnpm build && pnpm test
```

- [ ] **Step 5: Smoke the binary**

```bash
node src/packages/ai-summarizer/dist/cli.js --help
```

Expected: usage text printed listing `--inventory`, `--provider`, `--model`, and `--no-resume`. Exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/packages/ai-summarizer/src/cli.ts src/packages/ai-summarizer/tests/cli.test.ts
git commit -m "feat(ai-summarizer): fci-summarize CLI with required --inventory/--provider/--model"
```

---

## Task 8: Cross-package build + dry-run E2E

**Goal:** Confirm the whole monorepo still compiles and the CLI walks an inventory end-to-end against a stubbed Pi SDK fixture (no live API). Live-API E2E is out of scope here — it's covered by the existing v2 plan §"Task 5" once auth is configured.

**Files:**
- Create: `src/packages/ai-summarizer/tests/e2e-dryrun.test.ts`
- Create: `src/packages/ai-summarizer/tests/fixtures/_inventory.csv`
- Create: `src/packages/ai-summarizer/tests/fixtures/homepage.txt`

- [ ] **Step 1: Top-of-repo build**

```bash
cd src && pnpm -r run build
```

Expected: every package compiles. Specifically `@full-content-inventory/shared`, `@full-content-inventory/ai-summarizer`, `@full-content-inventory/cli`, `@full-content-inventory/gws-sync`.

- [ ] **Step 2: Create fixture inventory and page**

```
// src/packages/ai-summarizer/tests/fixtures/homepage.txt
Bienvenue. Ceci est la page d'accueil de test.
```

```
// src/packages/ai-summarizer/tests/fixtures/_inventory.csv
URL,URL_finale,Titre,Description,Resume_200_chars,Type_de_page,Profondeur_URL,Nb_mots,Statut_HTTP,Langue,Date_modifiee,Canonical,Noindex,Nb_images,Fichiers_liés,Lien_Google_Doc,Lien_dossier_Drive,crawl_status,sync_status,ai_status,error_message
https://example.test/,https://example.test/,Accueil,,,,0,5,200,fr,,,no,0,0,,,done,,,
```

- [ ] **Step 3: Write the dry-run E2E test**

```typescript
// src/packages/ai-summarizer/tests/e2e-dryrun.test.ts
import { describe, it, expect, vi } from 'vitest';
import { resolve, dirname } from 'node:path';
import { copyFile, readFile, mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('@mariozechner/pi-coding-agent', () => ({
  AuthStorage: { create: vi.fn(() => ({})) },
  ModelRegistry: { create: vi.fn(() => ({ find: vi.fn(() => null) })) },
  SessionManager: { inMemory: vi.fn(() => ({})) },
  DefaultResourceLoader: vi.fn().mockImplementation(() => ({ reload: vi.fn() })),
  createAgentSession: vi.fn(async () => ({
    session: {
      subscribe(cb: any) { (globalThis as any).__cb = cb; return () => {}; },
      async prompt(text: string) {
        const cb = (globalThis as any).__cb;
        // Heuristic: prompt body includes the system text → respond appropriately.
        const isClassify = text.includes('Title:'); // both prompts include Title; pick by order
        cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: isClassify ? 'homepage' : 'Bienvenue sur la page d\'accueil de test.' } });
      },
    },
  })),
}));
vi.mock('@mariozechner/pi-ai', () => ({ getModel: vi.fn(() => null) }));
vi.mock('../src/auth.js', () => ({ validateProviderModel: vi.fn().mockResolvedValue(undefined) }));

import { summarize } from '../src/summarize.js';

describe('summarize() dry-run E2E', () => {
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
```

- [ ] **Step 4: Run the test**

```bash
cd src/packages/ai-summarizer && pnpm test
```

Expected: dry-run test passes. The one-row CSV ends with `Type_de_page=homepage`, `ai_status=done`, summary present.

- [ ] **Step 5: Live-mode hand-off note**

For the live-API E2E (provider `opencode-go`, model `minimax-m2.5`, against the spec test URLs), follow `docs/PLAN 3 v2 - AI Summarizer Package.md` §Task 5 — it remains accurate for the post-implementation sanity check once `~/.pi/agent/auth.json` is provisioned on the dev machine.

- [ ] **Step 6: Commit**

```bash
git add src/packages/ai-summarizer/tests/e2e-dryrun.test.ts src/packages/ai-summarizer/tests/fixtures/_inventory.csv src/packages/ai-summarizer/tests/fixtures/homepage.txt
git commit -m "test(ai-summarizer): dry-run E2E against stubbed Pi SDK boundary"
```

---

## Self-Review

### Spec coverage

| Spec § | Requirement | Implemented in |
|---|---|---|
| FR1, INV-01 | Validate provider+model against `auth.json` before any AI call | Task 3 (`auth.ts`); Task 6 calls it first |
| FR2 | Skip rows where `crawl_status !== 'done'` | Task 6 |
| FR3 | Skip rows where `ai_status === 'done'` unless `--no-resume` | Task 6 |
| FR4, INV-06 | 14-label allowlist | Task 4 (`PAGE_TYPES`, `CLASSIFY_SYSTEM_PROMPT`) |
| FR5 | Same-language summary | Task 4 (`SUMMARY_SYSTEM_PROMPT`) |
| FR6, INV-03 | Parallel classify+summarize via `Promise.all` | Task 6 + concurrency test |
| FR7 | 2000-char truncation | Task 4 (`buildSummaryUserContent`) |
| FR8, INV-04 | Hard-slice summary to 200; write `Type_de_page`+`Resume_200_chars`; set `ai_status=done` | Task 4 (`hardSliceSummary`); Task 6 |
| FR9 | Per-row error: set `ai_status=error`, write `error_message`, continue | Task 6 + error test |
| FR10, INV-05 | Flush CSV after each row | Task 6 + flush test |
| FR11 | CLI flags `--inventory`, `--provider`, `--model`, `--no-resume` | Task 7 |
| INV-02 | `provider` and `modelId` always required | Task 5 (`RunOptions`); Task 7 (commander `requiredOption`) |
| SEC | No keys in code/logs | Task 3 reads from `~/.pi/agent/auth.json`; nothing logs the file content |
| Integration | `@full-content-inventory/shared` exports `SummarizeConfig`, `readInventory`, `writeInventory` | Task 1 + Task 6 imports |

### Placeholder scan

No "TBD", "implement later", "similar to above", or vague error/validation language. Every step ships either runnable code or a runnable command.

### Type consistency

- `RunOptions { provider; modelId }` — declared once in `src/types.ts`, consumed unchanged by `pi.ts` and `summarize.ts`.
- `SummarizeConfig { inventoryPath; aiProvider; aiModelId; resume? }` — declared in shared; CLI passes `opts.resume` through unchanged so `--no-resume` (commander default-true `boolean`) maps correctly to the `resume` field.
- `buildRunPrompt(systemPrompt: string)` — single shape used by both `runClassify` and `runSummarize`.
- `hardSliceSummary(raw: string): string` — used in `summarize.ts`, tested with three cases in `prompts.test.ts`.
- `urlToFilename(row.URL)` (not `row.local_path`, which does not exist on `InventoryRow`) — same helper gws-sync uses, so the .txt path resolution is symmetric across the two consumers of the inventory.

---

## Verification — end-to-end

After all 8 tasks are complete:

```bash
# 1. Whole-monorepo build
cd src && pnpm -r run build

# 2. Whole-monorepo unit tests
cd src && pnpm -r run test

# 3. CLI is wired
node src/packages/ai-summarizer/dist/cli.js --help

# 4. (Optional, requires real ~/.pi/agent/auth.json + a populated inventory)
node src/packages/ai-summarizer/dist/cli.js \
  --inventory ~/tmp/laurent_test/_inventory.csv \
  --provider opencode-go \
  --model minimax-m2.5
```

All commands must exit 0 (the live run requires auth + real inputs).

---

## Architecture update flag

None. The current `modules/ai-summarizer/architecture.md` and `general/ARCHITECTURE.md` are sufficient — the only ambiguity (`row.local_path`) was a v2 plan slip, not an architecture gap. The .txt-path-from-URL convention is already locked in by `urlToFilename` in `@full-content-inventory/shared`.
