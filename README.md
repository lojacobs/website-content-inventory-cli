# fci — Full Content Inventory

A CLI toolset to crawl websites, convert pages to sanitized text, sync content to Google Drive (Docs and Sheets), and generate AI summaries. All operations are resumable via status columns in `_inventory.csv`.

## Prerequisites

- **Node.js 20+**
- **pnpm** — `npm install -g pnpm`
- **wget** — used by the crawler to fetch pages
- **gws CLI** — authenticated (`gws auth login`); used for Google Drive/Docs/Sheets sync
- **Pi account** — authenticated; used by the AI summarizer

## Installation

```bash
pnpm install
pnpm -r build
```

After building, the following binaries are available:

- `fci` — unified entry point with `crawl`, `sync`, and `summarize` subcommands
- `fci-crawl` — standalone crawl command
- `fci-sync` — standalone sync command
- `fci-summarize` — standalone summarize command

## Usage

### Crawl a website

```bash
fci-crawl \
  --url https://www.strandrekamouraska.ca \
  --output ./output/strandrekamouraska \
  --client strand \
  --project rekamouraska \
  --max-depth 3
```

Or via the unified binary:

```bash
fci crawl \
  --url https://www.strandrekamouraska.ca \
  --output ./output/strandrekamouraska \
  --client strand \
  --project rekamouraska
```

Options:

| Flag | Description |
|---|---|
| `--url <url>` | Root URL to crawl (required) |
| `--output <dir>` | Output directory for `.txt` files and `_inventory.csv` (required) |
| `--client <name>` | Client name label (optional) |
| `--project <name>` | Project name label (optional) |
| `--no-resume` | Ignore existing `_inventory.csv` and start fresh |
| `--max-depth <n>` | Maximum crawl depth from the root URL (default: unlimited) |

### Sync to Google Drive

```bash
fci-sync \
  --inventory ./output/strandrekamouraska/_inventory.csv \
  --drive-folder 1A2B3C4D5E6F7G8H9I0J \
  --client strand \
  --project rekamouraska
```

Or via the unified binary:

```bash
fci sync \
  --inventory ./output/strandrekamouraska/_inventory.csv \
  --drive-folder 1A2B3C4D5E6F7G8H9I0J \
  --client strand \
  --project rekamouraska
```

Options:

| Flag | Description |
|---|---|
| `--inventory <path>` | Path to `_inventory.csv` (required) |
| `--drive-folder <id>` | Google Drive folder ID to upload into (required) |
| `--client <name>` | Client name label (required) |
| `--project <name>` | Project name label (required) |

### Generate AI summaries

```bash
fci-summarize \
  --inventory ./output/strandrekamouraska/_inventory.csv \
  --concurrency 3
```

Or via the unified binary:

```bash
fci summarize \
  --inventory ./output/strandrekamouraska/_inventory.csv
```

Options:

| Flag | Description |
|---|---|
| `--inventory <path>` | Path to `_inventory.csv` (required) |
| `--concurrency <n>` | Number of pages to summarize in parallel (default: 1) |

## `_inventory.csv` Schema

The central state file. One row per discovered URL. Created by `fci-crawl` and updated by each subsequent command.

| Column | Description |
|---|---|
| `url` | Original page URL |
| `local_path` | Path to local sanitized `.txt` file |
| `crawl_status` | Crawl status: `pending`, `done`, `error` |
| `sync_status` | Drive Doc upload status: `pending`, `done`, `error` |
| `ai_status` | AI summary status: `pending`, `done`, `error` |
| `doc_id` | Google Docs file ID (populated after `fci-sync`) |
| `sheet_row` | Sheet row reference (populated after `fci-sync`) |

## Resumability

All three commands are idempotent and resumable. On each run, a command reads `_inventory.csv`, iterates rows, and skips any row where the relevant status column is already `done`. Rows with `error` or `pending` status are retried.

To restart from scratch, delete `_inventory.csv` or pass `--no-resume` to `fci-crawl`.

## Monorepo Structure

```
packages/
  shared/        # Shared types, CSV utilities, inventory schema
  crawler/       # Web crawler (fci-crawl)
  gws-sync/      # Google Workspace sync (fci-sync)
  ai-summarizer/ # AI summarization (fci-summarize)
  cli/           # Unified fci binary
```

## License

MIT — see [LICENSE](./LICENSE).
