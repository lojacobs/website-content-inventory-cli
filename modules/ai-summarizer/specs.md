# Specs — ai-summarizer

> Relationships and data flow → `modules/ai-summarizer/architecture.md`.

---

## Module Purpose

The `ai-summarizer` module classifies each crawled page into one of 14 predefined page types and generates a ≤200-character summary in the page's own language, writing both results back to `_inventory.csv`. It is consumed by the `fci-summarize` CLI and by any pipeline that needs AI-enriched inventory data.

---

## Functional Requirements

1. The system shall validate the requested provider and model against `~/.pi/agent/auth.json` before processing any rows; it shall throw a descriptive error if the combination is absent.
2. The system shall skip rows where `crawl_status !== 'done'`.
3. The system shall skip rows where `ai_status === 'done'` unless `--no-resume` is passed.
4. The system shall classify each eligible page into exactly one of the 14 allowed labels: `homepage`, `service`, `about`, `contact`, `blog-post`, `news`, `faq`, `landing-page`, `resource`, `product`, `category`, `legal`, `form`, `other`.
5. The system shall generate a summary of ≤200 characters in the same language as the page content.
6. The system shall run classification and summary in parallel per row (`Promise.all`); sequential execution is not permitted.
7. The system shall truncate page text to 2000 characters before sending it to any model.
8. The system shall write `Type_de_page` and `Resume_200_chars` (hard-sliced to ≤200 chars) onto the row and set `ai_status=done` on success.
9. The system shall set `ai_status=error` and write the error message to `error_message` on failure, then continue to the next row.
10. The system shall flush `_inventory.csv` to disk after processing each row so that progress survives a crash.
11. The system shall expose a `fci-summarize` CLI accepting required flags `--inventory <path>`, `--provider <name>`, `--model <id>`, and optional `--no-resume`.

---

## Non-Functional Requirements

| Category | Requirement | Threshold |
|---|---|---|
| Performance | Classify + summarize run concurrently per row | `Promise.all` — never sequential |
| Performance | Page text truncated before model call | ≤ 2000 characters per prompt |
| Security | No API keys in code, task files, or logs | All auth via `~/.pi/agent/auth.json` |
| Reliability | CSV flushed after each row | Progress survives crash at any row boundary |
| Reliability | Error on one row does not abort the run | Remaining rows are still processed |
| Output quality | Summary hard-sliced before writing | `Resume_200_chars` ≤ 200 characters always |

---

## Out of Scope

- Crawling pages (handled by `bootstrap-and-crawler` module).
- Google Drive, Docs, or Sheets sync (handled by `gw-sync` module).
- Image parsing or insertion.
- Any UI or web interface.
- Batch/bulk AI calls; processing is row-by-row with per-row crash recovery.
- Model fine-tuning or prompt customisation beyond the two built-in system prompts.

---

## Data Structures / Entities

### SummarizeConfig

| Field | Type | Required | Notes |
|---|---|---|---|
| `inventoryPath` | `string` | Yes | Absolute or relative path to `_inventory.csv` |
| `aiProvider` | `string` | Yes | Provider ID, must match an entry in `auth.json` |
| `aiModelId` | `string` | Yes | Model ID, must match provider's model list in `auth.json` |
| `resume` | `boolean` | No | Defaults to `true`; set `false` via `--no-resume` to re-process |

> Full relationships → `modules/ai-summarizer/architecture.md § Domain Model`

---

### RunOptions

| Field | Type | Required | Notes |
|---|---|---|---|
| `provider` | `string` | Yes | Forwarded to every Pi SDK call; no default |
| `modelId` | `string` | Yes | Forwarded to every Pi SDK call; no default |

> Full relationships → `modules/ai-summarizer/architecture.md § Domain Model`

---

### AuthJson (external read-only)

| Field | Type | Required | Notes |
|---|---|---|---|
| `providers` | `Array<{ id: string; models?: string[] }>` | Yes | Read from `~/.pi/agent/auth.json` |

> Full relationships → `modules/ai-summarizer/architecture.md § Domain Model`

---

## Integration Points

### Consumed from other modules

| Module | What is consumed | Reference |
|---|---|---|
| `@fci/shared` | `readInventory()`, `writeInventory()`, `SummarizeConfig` type | `packages/shared/src/` |
| `@mariozechner/pi-coding-agent` | `AuthStorage`, `createAgentSession`, `ModelRegistry`, `SessionManager`, `DefaultResourceLoader` | Pi SDK (package dep) |
| `@mariozechner/pi-ai` | `getModel()` | Pi AI helpers (package dep) |

### Exposed to other modules

| Consumer | What is exposed | Reference |
|---|---|---|
| `@fci/cli` (or direct callers) | `summarize(config: SummarizeConfig): Promise<void>` | `packages/ai-summarizer/src/index.ts` |

---

## Design Reference

*(This module has no UI.)*

---

## Open Questions

| # | Question | Blocking? | Owner | Notes |
|---|---|---|---|---|
| SQ-01 | Should `Type_de_page` values be validated against the 14-label allowlist before writing, or is the model expected to self-constrain? | No | Planner | Current implementation writes the raw model output; a validation + fallback-to-`other` guard could be added |
| SQ-02 | Should failed rows be retried automatically within a run, or only on the next `fci-summarize` invocation? | No | Planner | Pi SDK handles transient retries internally; cross-run resume is the current approach |
