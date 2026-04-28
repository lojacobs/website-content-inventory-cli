# `@full-content-inventory/cli`

Unified command-line interface that orchestrates the Full Content Inventory pipeline: **crawl → ai-summarize → gws-sync**, or any subset.

---

## What it does

The main CLI provides a **single entry point** for the entire pipeline. Instead of running `fci-crawl`, `fci-summarize`, and `fci-sync` separately, you can run them in sequence or individually through this unified interface.

It depends on:
- `@full-content-inventory/crawler` — for downloading and text extraction
- `@full-content-inventory/ai-summarizer` — for AI classification and summarization
- `@full-content-inventory/gws-sync` — for Google Drive upload
- `@full-content-inventory/shared` — for types and utilities

---

## Prerequisites

- **Node.js 20+** and `pnpm`.
- All prerequisites from `crawler`, `gws-sync`, and `ai-summarizer` (see their READMEs).

---

## Installation

From the monorepo root:
```bash
cd src && pnpm install
pnpm -r run build
```

The CLI is available at:
```bash
node src/packages/cli/dist/index.js --help
```

Or via the bin symlink:
```bash
inventory --help
```

---

## Usage

> **Note:** This package is a **meta-orchestrator**. For granular control, use the individual CLIs directly:
> - `fci-crawl` (from `@full-content-inventory/crawler`)
> - `fci-sync` (from `@full-content-inventory/gws-sync`)
> - `fci-summarize` (from `@full-content-inventory/ai-summarizer`)

### Full pipeline (crawl + summarize + sync)
```bash
inventory \
  --url https://example.com \
  --client myclient \
  --project myproject \
  --provider opencode-go \
  --model minimax-m2.5 \
  --folder-id 1aBcD1234...
```

### Crawl only
```bash
inventory --url https://example.com --client myclient --project myproject --skip-summarize --skip-sync
```

### Summarize existing crawl output
```bash
inventory --inventory /path/to/_inventory.csv --provider opencode-go --model minimax-m2.5 --skip-crawl --skip-sync
```

### Sync to Drive (with AI data already in inventory)
```bash
inventory --inventory /path/to/_inventory.csv --folder-id 1aBcD1234... --skip-crawl --skip-summarize
```

### Crawl + sync without AI summarization
```bash
inventory \
  --url https://example.com \
  --client myclient \
  --project myproject \
  --folder-id 1aBcD1234... \
  --skip-summarize
```

---

## Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| INV-01 | Each stage validates its prerequisites before running | Auth checks, file existence, column schema |
| INV-02 | Stages are independently resumable | Each module tracks its own status column |
| INV-03 | The pipeline can run any subset of stages | `--skip-*` flags disable individual stages |

---

## The Happy Path

1. **Run the full pipeline** with `--url`, `--client`, `--project`, `--provider`, `--model`, `--folder-id`.
2. **Crawl stage** downloads pages, writes `.txt` files and `_inventory.csv`.
3. **Summarize stage** classifies each page and writes ≤200-char summaries back to the inventory.
4. **Sync stage** uploads `.txt` as Google Docs, mirrors folder tree, uploads the enriched inventory (with `Type_de_page` and `Resume_200_chars`) as a Google Sheet.
5. **All stages complete** → console prints summary. Exit 0.

---

## Troubleshooting

This CLI delegates to the individual packages. For stage-specific issues, refer to:
- **Crawl errors** → `@full-content-inventory/crawler` README
- **Sync errors** → `@full-content-inventory/gws-sync` README
- **Summarize errors** → `@full-content-inventory/ai-summarizer` README

### `inventory: command not found`
**Cause:** The package isn't linked globally.  
**Fix:** Use the full path: `node src/packages/cli/dist/index.js`.

### Stage fails but others continue
**Cause:** The CLI catches stage errors and continues to the next stage.  
**Fix:** Check the console output for the failing stage, resolve the issue, and re-run with `--skip-*` for stages that already succeeded.
