# `fci-summarize` — AI Content Summarizer

Classify every crawled page into one of 14 page types and generate a ≤200-character summary, writing results back into `_inventory.csv`.

---

## What it does

`fci-summarize` is the AI processing step in the Full Content Inventory pipeline. It runs **after** the crawler has produced `.txt` files and an `_inventory.csv`.

For every row where `crawl_status=done`:

1. **Reads** the local `.txt` file derived from the URL.
2. **Truncates** the text to 2000 characters (token budget protection).
3. **Classifies** the page into one of 14 types (`homepage`, `service`, `about`, `contact`, `blog-post`, `news`, `faq`, `landing-page`, `resource`, `product`, `category`, `legal`, `form`, `other`).
4. **Summarizes** the page in its original language using only the first 2 paragraphs (token savings).
5. **Hard-slices** the summary to exactly 200 characters.
6. **Writes** `Type_de_page`, `Resume_200_chars`, and `ai_status=done` back to the row.
7. **Flushes** the entire CSV after every row so a crash never loses progress.

If a row fails (missing `.txt`, model error, network timeout), the error is caught, `ai_status=error` + `error_message` are written, and the pipeline **continues** to the next row.

---

## Prerequisites

1. **Node.js 20+** and `pnpm`.
2. **Crawler output** — an `_inventory.csv` with `crawl_status=done` and matching `.txt` files in the directory tree.
3. **Pi authentication** — `~/.pi/agent/auth.json` must contain the provider you want to use. Example:
   ```json
   {
     "opencode-go": { "type": "api_key", "key": "sk-XXX" }
   }
   ```
   The CLI validates that the **provider key exists**; model resolution is handled by the Pi SDK at runtime.

---

## Installation

From the monorepo root:
```bash
cd src && pnpm install
pnpm -r run build
```

The CLI is available at:
```bash
fci-summarize --help
```

> Run from the `src/` directory after `pnpm install`:
> ```bash
> cd src
> pnpm exec fci-summarize --help
> ```

---

## Usage

### Basic run (resume mode — skips rows already marked `ai_status=done`)
```bash
fci-summarize \
  --inventory /path/to/output/client_project/example.com/_inventory.csv \
  --provider opencode-go \
  --model minimax-m2.5
```

### Force re-processing of all rows
```bash
fci-summarize \
  --inventory /path/to/output/client_project/example.com/_inventory.csv \
  --provider opencode-go \
  --model minimax-m2.5 \
  --no-resume
```

### CLI reference

| Flag | Required | Description |
|------|----------|-------------|
| `-i, --inventory <path>` | **Yes** | Path to `_inventory.csv` |
| `--provider <name>` | **Yes** | Provider key from `~/.pi/agent/auth.json` |
| `--model <id>` | **Yes** | Model ID passed to the Pi SDK |
| `--no-resume` | No | Re-process rows even if `ai_status=done` |

---

## Directory layout assumptions

The CLI assumes the **crawler's output structure**:

```
output/
└── client_project/
    └── example.com/
        ├── _inventory.csv          ← pass this to --inventory
        ├── homepage.txt            ← root URL
        ├── about.txt               ← /about
        ├── services/
        │   └── consulting.txt      ← /services/consulting
        └── ...
```

`.txt` paths are resolved **relative to the CSV's parent directory** (`example.com/`). The filename for each URL is derived by `urlToFilename()` from `@full-content-inventory/shared`.

---

## Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| INV-01 | Provider must exist in `~/.pi/agent/auth.json` before any AI call | `validateProviderModel()` throws on mismatch |
| INV-02 | `provider` and `modelId` are always forwarded to the Pi SDK | `RunOptions` interface; CLI `requiredOption` |
| INV-03 | Classify and summarize run concurrently per row | `Promise.all([runClassify(...), runSummarize(...)])` |
| INV-04 | `Resume_200_chars` is never longer than 200 characters | `hardSliceSummary()` trims to `slice(0, 200)` |
| INV-05 | CSV is flushed after every processed row | `await writeInventory(inventoryPath, rows)` inside the loop |
| INV-06 | `Type_de_page` must be one of the 14 `PAGE_TYPES` | System prompt restricts output to the allowlist |
| FR7 | Page text is truncated to 2000 characters before the model sees it | `buildSummaryUserContent()` slices body to 2000 chars |

---

## The Happy Path

1. **Crawl completes** → `_inventory.csv` has rows with `crawl_status=done` and `.txt` files exist in subdirectories.
2. **Auth is configured** → `~/.pi/agent/auth.json` contains the provider key.
3. **Run the CLI** with `--inventory`, `--provider`, `--model`.
4. **For each row**:
   - Row is read, `.txt` is found, model classifies → `service`, summarizes → `Aide juridique en ligne pour les petites entreprises.`
   - `Type_de_page` = `service`, `Resume_200_chars` = `Aide juridique en ligne pour les petites entreprises.`, `ai_status` = `done`
   - CSV is written immediately.
5. **All rows processed** → console prints `[summarize] Done.` Exit 0.

---

## Troubleshooting & workarounds

### `auth.json not found at ...`
**Cause:** `~/.pi/agent/auth.json` is missing or unreadable.  
**Fix:** Run `pi auth` to authenticate, or create the file manually with the provider key.

### `Provider "X" not found in auth.json`
**Cause:** The `--provider` value does not match any top-level key in `auth.json`.  
**Fix:** Check `auth.json` keys with `cat ~/.pi/agent/auth.json | jq 'keys'`, then use the exact key name.

### `Invalid Record Length: columns length is 21, got 19`
**Cause:** The `_inventory.csv` header does not match the expected 21 columns (missing `error_message` or other columns added in newer shared package versions).  
**Fix:** Re-run the crawler to generate a fresh inventory with the current column schema, or manually add the missing columns to the header row.

### `ENOENT: no such file or directory` for `.txt`
**Cause:** The `.txt` file for a URL is missing from the expected subdirectory.  
**Fix:**
- Check that the crawler actually wrote the file (non-HTML pages are skipped).
- Verify the directory structure matches the crawler output (see **Directory layout assumptions** above).
- The `urlToFilename()` mapping must be symmetric between crawler and summarizer.

### Row stuck at `ai_status=error`
**Cause:** A previous run failed for that row (model timeout, network error, missing `.txt`).  
**Fix:** Resolve the underlying issue, then re-run with `--no-resume` to force re-processing.

### Summaries are partial sentences or fragments
**Cause:** Older prompt version before the "complete sentence" instruction.  
**Fix:** Ensure you are running the latest build (`pnpm -r run build`). The current prompt explicitly requires a complete sentence.

### Rate limiting or slow performance on large inventories
**Cause:** Each row creates 2 concurrent Pi SDK sessions with no global rate limit.  
**Workaround:** Process the inventory in chunks by temporarily moving rows out of the CSV, or wait between runs. A future version may add `--delay-ms` and `--concurrency` flags.

### Output CSV has `error_message` leaking internal paths
**Cause:** The Pi SDK threw an error whose message contained a stack trace or file path.  
**Mitigation:** `error_message` is written to the local CSV only. Do not share the raw CSV externally if this is a concern. You can sanitize the column before export.
