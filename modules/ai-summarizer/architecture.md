# Architecture — ai-summarizer

## Domain Model

The module's two core entities are `SummarizeConfig` (holds `inventoryPath`, `aiProvider`, `aiModelId`, and the optional `resume` flag) and `RunOptions` (holds `provider` and `modelId`, both required, forwarded to every Pi SDK call). `AuthJson` represents the structure of `~/.pi/agent/auth.json` and is read once at startup to validate the requested provider+model combination before any AI work begins. Rows in `_inventory.csv` are the unit of work: each eligible row produces two AI results (`Type_de_page`, `Resume_200_chars`) that are written back to the same CSV.

## Data Flow — Happy Path

1. `fci-summarize` CLI parses `--inventory`, `--provider`, and `--model` flags and calls `summarize(config)`.
2. `summarize()` calls `validateProviderModel(provider, modelId)`, which reads `~/.pi/agent/auth.json` and throws if the combination is absent.
3. `readInventory(inventoryPath)` (from `@fci/shared`) loads `_inventory.csv` into memory.
4. For each row where `crawl_status=done` and (`ai_status !== 'done'` or `--no-resume`): read the `.txt` file at `local_path`, build `userContent` via `buildSummaryUserContent(title, text)` (2000-char truncation), then run `runClassify` and `runSummarize` in parallel via `Promise.all`.
5. Write `Type_de_page` (one of 14 allowed labels) and `Resume_200_chars` (hard-sliced to ≤200 chars) onto the row; set `ai_status=done`.
6. On error: set `ai_status=error`, write `error_message`.
7. Flush `_inventory.csv` via `writeInventory()` after every row.

## Invariants

- **INV-01** Auth validation runs before any AI call; it cannot be skipped or deferred.
- **INV-02** `provider` and `modelId` are both required in `RunOptions`; neither may be optional or defaulted.
- **INV-03** Classification and summary are always run in parallel (`Promise.all`); sequential execution is forbidden.
- **INV-04** `Resume_200_chars` is hard-sliced to ≤200 characters before writing to the CSV; the raw model output is never written directly.
- **INV-05** `_inventory.csv` is flushed after every row to ensure crash-resumable progress.
- **INV-06** `Type_de_page` must be one of the 14 allowed labels: `homepage`, `service`, `about`, `contact`, `blog-post`, `news`, `faq`, `landing-page`, `resource`, `product`, `category`, `legal`, `form`, `other`.

## Constraints

- **SEC** No API keys are committed to the repo or logged; all auth flows through `~/.pi/agent/auth.json`.
- **PERF** Text input to prompts is truncated at 2000 chars to stay within model context budgets; classify+summarize run concurrently per row.
- **COMPAT** Requires Node.js 20+, TypeScript 5, pnpm workspace. Pi SDK (`@mariozechner/pi-coding-agent`) is a package dependency — no global install required.

## Naming Conventions

| Scope | Convention | Example |
|---|---|---|
| Package folder | kebab-case | `packages/ai-summarizer/` |
| Source files | lowercase, `.ts` | `auth.ts`, `pi.ts`, `summarize.ts` |
| Test files | `tests/*.test.ts` | `tests/auth.test.ts` |
| Test fixtures | `tests/fixtures/` | `auth-minimal.json` |
| Env/config vars | SCREAMING_SNAKE_CASE | `AUTH_JSON_PATH` |
| CSV status values | lowercase string literals | `done`, `error` |
| CLI binary | kebab-case | `fci-summarize` |

## Extended Details

- Prompt text and label list: `packages/ai-summarizer/src/prompts.ts`
- Pi SDK session wiring: `packages/ai-summarizer/src/pi.ts`
- Shared CSV utilities: `@fci/shared` (`readInventory`, `writeInventory`, `SummarizeConfig`)
