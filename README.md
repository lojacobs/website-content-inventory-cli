# Full Content Inventory

A TypeScript CLI toolkit for crawling websites, extracting clean content, syncing to Google Drive, and generating AI-powered summaries — all with resume support and incremental progress.

---

## What this app does

Full Content Inventory automates the tedious work of cataloguing a website's content. Given a URL (or list of URLs), it:

1. **Crawls** the site — downloads pages, strips navigation/ads/scripts, converts HTML to clean text.
2. **Creates an inventory** — a spreadsheet (`_inventory.csv`) tracking every page with metadata (title, description, word count, language, HTTP status, etc.).
3. **Syncs to Google Drive** — uploads `.txt` files as Google Docs, mirrors the URL folder structure, and uploads the inventory as a Google Sheet.
4. **AI-summarizes** — classifies each page into one of 14 types (homepage, service, about, blog-post, etc.) and writes a ≤200-character summary.

Each step is **resumable** — if the process crashes or is interrupted, re-run the command and it picks up where it left off.

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Crawler   │────→│   Shared    │←────│  gws-sync   │     │  AI Summar. │
│  fci-crawl  │     │  types/CSV  │     │   fci-sync  │     │ fci-summarize│
└─────────────┘     │  paths/MIME │     └─────────────┘     └─────────────┘
                    └─────────────┘           ↑                    ↑
                                              └────────────────────┘
                                                        │
                                                   ┌─────────┐
                                                   │   CLI   │
                                                   │inventory│
                                                   └─────────┘
```

| Package | CLI | Purpose |
|---------|-----|---------|
| `@full-content-inventory/crawler` | `fci-crawl` | Download pages, sanitize HTML, extract text, build inventory |
| `@full-content-inventory/gws-sync` | `fci-sync` | Upload to Google Drive as Docs/Sheets, mirror folder tree |
| `@full-content-inventory/ai-summarizer` | `fci-summarize` | AI classification + 200-char summary per page |
| `@full-content-inventory/shared` | — | Types, CSV I/O, path utilities, MIME detection |
| `@full-content-inventory/cli` | `inventory` | Unified orchestrator (run any subset of stages) |

---

## Prerequisites

- **Node.js 20+**
- **pnpm 9+**
- **wget** (for crawling)
- **Google Workspace CLI (`gws`)** authenticated (for Drive sync)
- **Pi SDK auth** (`~/.pi/agent/auth.json`) with your chosen AI provider (for summarization)

---

## Installation

```bash
# Clone the repo
git clone <repo-url>
cd full-content-inventory-integrated

# Install dependencies
cd src && pnpm install

# Build all packages
pnpm -r run build

# Run tests
pnpm -r run test
```

---

## Quick Start

### 1. Crawl a website
```bash
node src/packages/crawler/dist/cli.js \
  --url https://example.com \
  --client myclient \
  --project myproject \
  --mode domain
```

Output goes to `./output/myclient_myproject/example.com/`:
```
output/myclient_myproject/example.com/
├── _inventory.csv
├── homepage.txt
├── about.txt
├── services/
│   └── consulting.txt
└── ...
```

### 2. Sync to Google Drive
```bash
node src/packages/gws-sync/dist/cli.js \
  --inventory output/myclient_myproject/example.com/_inventory.csv \
  --folder-id 1aBcD1234...
```

### 3. AI-summarize
```bash
node src/packages/ai-summarizer/dist/cli.js \
  --inventory output/myclient_myproject/example.com/_inventory.csv \
  --provider opencode-go \
  --model minimax-m2.5
```

### Or run the full pipeline via the unified CLI
```bash
node src/packages/cli/dist/index.js \
  --url https://example.com \
  --client myclient \
  --project myproject \
  --folder-id 1aBcD1234... \
  --provider opencode-go \
  --model minimax-m2.5
```

---

## Assumptions

1. **Crawler output is the source of truth.** The sync and summarize modules read `.txt` files and `_inventory.csv` produced by the crawler. They do not fetch URLs themselves.
2. **Directory tree mirrors URL structure.** `https://example.com/services/consulting` → `output/.../example.com/services/consulting.txt`.
3. **No `index` folders.** `www.test.com/index.html` → `homepage.txt`; `www.test.com/parent/index.html` → `parent-folder.txt`.
4. **Resume is the default.** Every module skips rows marked `done` in their respective status column (`crawl_status`, `sync_status`, `ai_status`). Use `--no-resume` to force re-processing.
5. **Google Drive folder ID is provided by the user.** The sync module does not create the root Drive folder; you must create it and pass its ID.
6. **AI provider and model are user-chosen.** The summarizer validates the provider exists in `~/.pi/agent/auth.json`; model resolution is handled by the Pi SDK at runtime.

---

## Invariants (global)

| ID | Invariant | Where enforced |
|----|-----------|---------------|
| G-INV-01 | `_inventory.csv` is the single source of truth for progress | All modules read/write the same CSV |
| G-INV-02 | Each stage has its own status column | `crawl_status`, `sync_status`, `ai_status` |
| G-INV-03 | CSV is flushed after every row | `writeInventory()` called inside every row loop |
| G-INV-04 | Per-row errors do not abort the pipeline | `try/catch` around every row handler |
| G-INV-05 | Path traversal is blocked | `urlToFilename()` filters `.`/`..`; `assertPathWithinDir()` guards file reads |
| G-INV-06 | Stages are independently runnable | Each module has its own CLI and resume logic |

---

## The Happy Path

1. **Install prerequisites** (Node, pnpm, wget, gws CLI, Pi auth).
2. **Run the crawler** with `--url`, `--client`, `--project`.
3. **Crawl completes** → `_inventory.csv` has rows with `crawl_status=done`, `.txt` files exist in the mirrored directory tree.
4. **Run the sync** with `--inventory` and `--folder-id`.
5. **Sync completes** → Google Docs created in mirrored Drive folders, inventory uploaded as Sheet, rows have `sync_status=done` and `Lien_Google_Doc` populated.
6. **Run the summarizer** with `--inventory`, `--provider`, `--model`.
7. **Summarize completes** → `Type_de_page` and `Resume_200_chars` filled by AI, `ai_status=done`.
8. **Open the Google Sheet** — all columns populated, ready for review.

---

## Troubleshooting & workarounds

### General

#### `pnpm: command not found`
**Fix:** Install pnpm — `npm install -g pnpm` or `corepack enable`.

#### `Invalid Record Length: columns length is 21, got N`
**Cause:** The `_inventory.csv` was generated by an older version of the crawler.  
**Fix:** Re-run the crawler with `--no-resume` to regenerate the inventory with the current 21-column schema.

#### Build fails with "Cannot find module"
**Cause:** Packages were not built in dependency order.  
**Fix:** Run `pnpm -r run clean` then `pnpm -r run build` from the `src/` directory.

### Crawl stage

See [`@full-content-inventory/crawler` README](src/packages/crawler/README.md).

### Sync stage

See [`@full-content-inventory/gws-sync` README](src/packages/gws-sync/README.md).

### Summarize stage

See [`@full-content-inventory/ai-summarizer` README](src/packages/ai-summarizer/README.md).

### Common cross-stage issues

#### `.txt` file not found during sync/summarize
**Cause:** The crawler skipped the page (non-HTML content), or the URL path mapping is mismatched.  
**Fix:**
- Check `crawl_status` in the inventory — if `done` but no `.txt`, the page was non-HTML.
- Verify `urlToFilename()` produces the same path on both crawler and reader. Rebuild the monorepo (`pnpm -r run build`) to ensure version alignment.

#### Row stuck with `error` status
**Cause:** A previous run failed for that row.  
**Fix:** Resolve the underlying issue, then re-run the affected module with `--no-resume` to force re-processing.

#### Google Drive sync creates duplicate files
**Cause:** The `.sync-meta.json` was deleted or the Drive folder was reorganized manually.  
**Fix:** Clean up duplicates in Drive, delete `.sync-meta.json`, and re-run sync with `--no-resume`.

#### AI summaries are partial sentences or in wrong language
**Cause:** The model did not follow the system prompt instructions.  
**Fix:** Re-run with `--no-resume`. The prompt explicitly requires complete sentences and same-language summaries, but model compliance varies.

---

## Package READMEs

- [`@full-content-inventory/crawler`](src/packages/crawler/README.md) — Web crawling, text extraction, prompt-injection detection
- [`@full-content-inventory/gws-sync`](src/packages/gws-sync/README.md) — Google Drive sync, folder mirroring, Sheets upload
- [`@full-content-inventory/ai-summarizer`](src/packages/ai-summarizer/README.md) — AI classification, 200-char summary, Pi SDK integration
- [`@full-content-inventory/shared`](src/packages/shared/README.md) — Types, CSV I/O, path utilities, MIME detection
- [`@full-content-inventory/cli`](src/packages/cli/README.md) — Unified pipeline orchestrator

---

## License

Open source. See repository for full license details.
