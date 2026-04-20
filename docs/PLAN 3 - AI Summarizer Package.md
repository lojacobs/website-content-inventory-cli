# PLAN 3: AI Summarizer Package

---

## Task 1: pi SDK Wrapper

**Files:**
- Create: `packages/ai-summarizer/src/pi.ts`
- Create: `packages/ai-summarizer/tests/pi.test.ts`

The Pi SDK (`@mariozechner/pi-coding-agent`) is bundled as a package dependency — no global install required. API keys are read from `~/.pi/agent/auth.json` or standard env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.).

- [ ] **Step 1: Write failing tests**

```typescript
// packages/ai-summarizer/tests/pi.test.ts
import { describe, it, expect } from 'vitest';
import { buildRunPrompt } from '../src/pi.js';

describe('buildRunPrompt', () => {
  it('returns a function', () => {
    const run = buildRunPrompt('You are a helpful assistant.');
    expect(typeof run).toBe('function');
  });

  it('throws if called without valid API key (integration guard)', async () => {
    // This test only runs if ANTHROPIC_API_KEY is not set
    if (process.env.ANTHROPIC_API_KEY) return;
    const run = buildRunPrompt('You are a helpful assistant.');
    await expect(run('hello', undefined, undefined)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — verify failure**

```bash
cd packages/ai-summarizer && pnpm test
```

Expected: `Cannot find module '../src/pi.js'`

- [ ] **Step 3: Implement `pi.ts`**

```typescript
// packages/ai-summarizer/src/pi.ts
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from '@mariozechner/pi-coding-agent';
import { getModel } from '@mariozechner/pi-ai';

export interface RunOptions {
  provider?: string;   // e.g. "anthropic", "openai"
  modelId?: string;    // e.g. "claude-opus-4-5"
}

export function buildRunPrompt(systemPrompt: string) {
  return async function runPrompt(
    userContent: string,
    opts?: RunOptions,
    authJsonPath?: string  // override ~/.pi/agent/auth.json location
  ): Promise<string> {
    const authStorage = AuthStorage.create(authJsonPath);
    const modelRegistry = ModelRegistry.create(authStorage);

    const loader = new DefaultResourceLoader({
      systemPromptOverride: () => systemPrompt,
    });
    await loader.reload();

    let model;
    if (opts?.provider && opts?.modelId) {
      model = modelRegistry.find(opts.provider, opts.modelId)
        ?? getModel(opts.provider, opts.modelId)
        ?? undefined;
    }

    const { session } = await createAgentSession({
      sessionManager: SessionManager.inMemory(),
      authStorage,
      modelRegistry,
      resourceLoader: loader,
      ...(model ? { model } : {}),
    });

    let output = '';
    const unsubscribe = session.subscribe((event) => {
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'text_delta'
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

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd packages/ai-summarizer && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/ai-summarizer/src/pi.ts packages/ai-summarizer/tests/pi.test.ts
git commit -m "feat(ai-summarizer): pi SDK wrapper (bundled, no global install needed)"
```

---

## Task 2: Prompts

**Files:**
- Create: `packages/ai-summarizer/src/prompts.ts`

- [ ] **Step 1: Write `prompts.ts`**

```typescript
// packages/ai-summarizer/src/prompts.ts

export const PAGE_TYPE_SYSTEM_PROMPT = `You are a content classification expert. Given the content of a web page, classify it into exactly one of these page types:

- homepage
- services
- about
- contact
- blog-post
- news
- faq
- landing-page
- resource
- product
- category
- legal
- form
- other

Respond with ONLY the page type label, no explanation, no punctuation.`;

export const SUMMARY_SYSTEM_PROMPT = `You are a content summarizer. Given the content of a web page, write a summary in the same language as the page content. The summary must be exactly 200 characters or fewer. Be factual and neutral. Do not start with "This page" or "The page". Respond with ONLY the summary text.`;

export function buildSummaryUserContent(pageTitle: string, pageText: string): string {
  // Truncate page text to avoid excessive tokens (first 2000 chars is sufficient)
  const truncated = pageText.slice(0, 2000);
  return `Title: ${pageTitle}\n\nContent:\n${truncated}`;
}
```

- [ ] **Step 2: Write a test**

```typescript
// packages/ai-summarizer/tests/prompts.test.ts
import { describe, it, expect } from 'vitest';
import { buildSummaryUserContent } from '../src/prompts.js';

describe('buildSummaryUserContent', () => {
  it('truncates content to 2000 chars', () => {
    const longText = 'a'.repeat(5000);
    const result = buildSummaryUserContent('Title', longText);
    expect(result.length).toBeLessThan(2100);
  });

  it('includes the title', () => {
    const result = buildSummaryUserContent('My Page', 'content');
    expect(result).toContain('My Page');
  });
});
```

- [ ] **Step 3: Run tests — verify they pass**

```bash
cd packages/ai-summarizer && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add packages/ai-summarizer/src/prompts.ts packages/ai-summarizer/tests/prompts.test.ts
git commit -m "feat(ai-summarizer): classification and summary system prompts"
```

---

## Task 3: Summarizer Orchestrator + CLI

**Files:**
- Create: `packages/ai-summarizer/src/summarize.ts`
- Create: `packages/ai-summarizer/src/index.ts`
- Create: `packages/ai-summarizer/src/cli.ts`

- [ ] **Step 1: Implement `summarize.ts`**

```typescript
// packages/ai-summarizer/src/summarize.ts
import fs from 'node:fs/promises';
import {
  readInventory, writeInventory, type SummarizeConfig
} from '@fci/shared';
import { buildRunPrompt } from './pi.js';
import {
  PAGE_TYPE_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserContent,
} from './prompts.js';

export async function summarize(config: SummarizeConfig): Promise<void> {
  const { inventoryPath, aiProvider, resume = true } = config;
  const rows = await readInventory(inventoryPath);

  if (rows.length === 0) {
    console.log('[summarize] No rows in inventory.');
    return;
  }

  for (const row of rows) {
    if (row.crawl_status !== 'done') continue;
    if (resume && row.ai_status === 'done') continue;

    try {
      const text = await fs.readFile(row.local_path, 'utf8');
      const userContent = buildSummaryUserContent(row.Titre, text);

      const runClassify = buildRunPrompt(PAGE_TYPE_SYSTEM_PROMPT);
      const runSummarize = buildRunPrompt(SUMMARY_SYSTEM_PROMPT);
      const opts = aiProvider ? { provider: aiProvider } : undefined;

      const [pageType, summary] = await Promise.all([
        runClassify(userContent, opts),
        runSummarize(userContent, opts),
      ]);

      row.Type_de_page = pageType;
      row.Resume_200_chars = summary.slice(0, 200);
      row.ai_status = 'done';
      row.error_message = '';
    } catch (err) {
      row.ai_status = 'error';
      row.error_message = (err as Error).message;
    }

    await writeInventory(inventoryPath, rows);
    console.log(`[summarize] ${row.URL} → ${row.Type_de_page}`);
  }

  console.log('[summarize] Done.');
}
```

- [ ] **Step 2: Create `packages/ai-summarizer/src/index.ts`**

```typescript
export { summarize } from './summarize.js';
```

- [ ] **Step 3: Create `packages/ai-summarizer/src/cli.ts`**

```typescript
#!/usr/bin/env node
// packages/ai-summarizer/src/cli.ts
import { Command } from 'commander';
import { summarize } from './summarize.js';

const program = new Command();

program
  .name('fci-summarize')
  .description('Fill AI summaries in _inventory.csv using pi')
  .requiredOption('-i, --inventory <path>', 'Path to _inventory.csv')
  .option('--provider <name>', 'AI provider to pass to pi')
  .option('--no-resume', 'Re-summarize even if already done');

program.parse();
const opts = program.opts();

await summarize({
  inventoryPath: opts.inventory,
  aiProvider: opts.provider,
  resume: opts.resume,
}).catch(err => {
  console.error(err.message);
  process.exit(1);
});
```

- [ ] **Step 4: Build**

```bash
cd packages/ai-summarizer && pnpm build
node dist/cli.js --help
```

Expected: `fci-summarize` usage displayed.

- [ ] **Step 5: Commit**

```bash
git add packages/ai-summarizer/src/
git commit -m "feat(ai-summarizer): summarize orchestrator and fci-summarize CLI"
```

---

## Task 4: End-to-End Integration Test

Run the full pipeline against the real test URL to validate everything works together.

- [ ] **Step 1: Build all packages**

```bash
pnpm build
```

Expected: all packages compile with no errors.

- [ ] **Step 2: Crawl the test URL**

```bash
node packages/cli/dist/index.js crawl \
  --url "https://www.standredekamouraska.ca/espace-citoyen/urbanisme/" \
  --client test \
  --project standredekamouraska
```

Expected:
- `~/tmp/test_standredekamouraska/standredekamouraska.ca/espace-citoyen/urbanisme.txt` exists
- `~/tmp/test_standredekamouraska/_inventory.csv` has one row with `crawl_status=done`

- [ ] **Step 3: Inspect the txt output**

```bash
cat ~/tmp/test_standredekamouraska/standredekamouraska.ca/espace-citoyen/urbanisme.txt
```

Verify:
- Content is in French
- No HTML tags remain
- No nav/menu/footer boilerplate
- No injection patterns

- [ ] **Step 4: Run AI summarizer (requires pi installed)**

```bash
node packages/cli/dist/index.js summarize \
  --inventory ~/tmp/test_standredekamouraska/_inventory.csv
```

Expected: CSV row updated with `Type_de_page` and `Resume_200_chars`, `ai_status=done`.

- [ ] **Step 5: Run GDrive sync (requires gws authenticated + Drive folder ID)**

Ask the user for their Google Drive root folder ID, then:

```bash
node packages/cli/dist/index.js sync \
  --inventory ~/tmp/test_standredekamouraska/_inventory.csv \
  --folder-id REPLACE_WITH_ACTUAL_FOLDER_ID
```

Expected:
- Google Doc created for `urbanisme.txt`
- `_inventory.csv` uploaded as Google Sheets
- CSV rows updated with `Lien_Google_Doc` and `Lien_dossier_Drive`, `sync_status=done`

- [ ] **Step 6: Test resume — re-run crawl and confirm nothing re-downloaded**

```bash
node packages/cli/dist/index.js crawl \
  --url "https://www.standredekamouraska.ca/espace-citoyen/urbanisme/" \
  --client test \
  --project standredekamouraska
```

Expected: `[skip] Already crawled: ...` logged, no new files created.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "test: end-to-end integration with standredekamouraska.ca verified"
```

---

## Task 5: CI Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for build and test"
```

---

## Self-Review Against Spec

### Coverage check

| Spec requirement | Covered by |
|---|---|
| Crawl page/set/site without LLM | Task 9-10 (Plan 1) |
| Download to `~/tmp/crawl-{domain}/` | Task 9 `downloadPage` |
| Record to `_inventory.csv` per page | Task 10 `crawl.ts` + Task 4 inventory helpers |
| Same folder structure as URL | Task 3 `urlToTxtPath` |
| Convert to `{page}.txt` in folder structure | Task 7 `convert.ts` + Task 10 |
| Keep only content HTML elements | Task 6 `sanitize.ts` |
| Remove nav/menu/btn/cta by CSS class/id | Task 6 `sanitize.ts` NOISE_PATTERNS |
| Remove prompt injection (human/machine readable) | Task 5 `injection.ts` |
| Same folder structure in Google Drive | Plan 2 Task 2 `drive.ts` |
| Upload `_inventory.csv` as Google Sheets | Plan 2 Task 4 `sheets.ts` |
| Convert `.txt` to Google Docs | Plan 2 Task 3 `docs.ts` |
| Replace img elements with real images in GDocs | Plan 2 Task 5 `images.ts` |
| Fill `Type_de_page` + `Resume_200_chars` with AI | Plan 3 Tasks 2-3 |
| Resume crawl | `resume` flag + `crawl_status` column |
| Resume GDrive sync | `resume` flag + `sync_status` column |
| Resume AI summarization | `resume` flag + `ai_status` column |
| Run crawl without GDrive/AI | Standalone `fci crawl` command |
| Run GDrive without crawl/AI | Standalone `fci sync` command |
| Run AI without crawl/GDrive | Standalone `fci summarize` command |
| Installable via pnpm | `packages/cli/package.json` with `bin.fci` |
| Customizable prompt injection conf | `prompt-injection.conf` + `--config` flag |
| AI agent skill (CLAUDE.md) | Task 13 `CLAUDE.md` |
| Open-source license | Task 13 `LICENSE` (MIT) |
| Tests (unit/integration) | Vitest tests in every package |
| Ask user for test URLs | Used `standredekamouraska.ca` throughout |
| No index.html/index folder | Task 3 `urlToTxtPath` collapse logic |
| No malware/virus download | Task 9 `isDangerousUrl` guard |
| Minimum dependencies, open-source/free | cheerio, csv-parse, unidecode, commander, execa, vitest |
| Google Drive folder ID from user | `--folder-id` flag in `fci sync` |

### No placeholder scan

All tasks contain actual code or actual shell commands. No "TBD" or "similar to above" references.

### Type consistency check

- `InventoryRow` defined in `packages/shared/src/types.ts` — used consistently across all packages
- `upsertRow(csvPath, row)` signature used in both `crawl.ts` and `sync.ts`
- `urlToTxtPath(url, baseDir)` matches calls in `processPage`
- `loadInjectionPatterns(confPath)` returns `RegExp[]` — consumed correctly by `sanitizeText(text, patterns)`
- `sync`, `crawl`, `summarize` export signatures match `packages/cli/src/index.ts` call sites