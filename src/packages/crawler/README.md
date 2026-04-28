# `@full-content-inventory/crawler`

Web crawler that downloads pages, extracts clean text, detects prompt-injection artefacts, and writes `.txt` files + `_inventory.csv` for downstream processing.

---

## What it does

The crawler is the **first step** in the Full Content Inventory pipeline. It takes one or more seed URLs and produces:

1. **Plain-text `.txt` files** — sanitized HTML content, one per page, organized in a directory tree mirroring the URL structure.
2. **`_inventory.csv`** — a spreadsheet tracking every crawled URL with metadata (title, description, word count, HTTP status, language, canonical, noindex, images, linked files, etc.).

For each page:
- Downloads via `wget` (with configurable delay and User-Agent).
- Extracts metadata (title, description, word count, language, canonical, noindex, image count, linked files).
- Sanitizes HTML — removes navigation, scripts, footers, ads, and elements with CSS classes/IDs like `nav`, `menu`, `btn`, `cta`.
- Converts sanitized HTML → plain text.
- Detects and strips prompt-injection patterns (customizable via config file).
- Writes the clean `.txt` to the output directory tree.
- Upserts a row into `_inventory.csv` with `crawl_status=done`.

---

## Prerequisites

- **Node.js 20+** and `pnpm`.
- **`wget`** installed on the system (used for downloading pages).

---

## Installation

From the monorepo root:
```bash
cd src && pnpm install
pnpm -r run build
```

The CLI is available at:
```bash
node src/packages/crawler/dist/cli.js --help
```

---

## Usage

### Crawl a single URL
```bash
node src/packages/crawler/dist/cli.js \
  --url https://example.com \
  --client myclient \
  --project myproject
```

### Crawl a list of URLs from a file
```bash
node src/packages/crawler/dist/cli.js \
  --urls-file urls.txt \
  --client myclient \
  --project myproject
```

### Domain crawl (discover all pages via sitemap + BFS)
```bash
node src/packages/crawler/dist/cli.js \
  --url https://example.com \
  --client myclient \
  --project myproject \
  --mode domain \
  --delay 1000
```

### Force re-crawl (ignore resume)
```bash
node src/packages/crawler/dist/cli.js \
  --url https://example.com \
  --client myclient \
  --project myproject \
  --no-resume
```

### CLI reference

| Flag | Required | Description |
|------|----------|-------------|
| `--url <url>` | *One of* | Single seed URL |
| `--urls-file <path>` | *One of* | File with one URL per line (`#` comments supported) |
| `--client <name>` | **Yes** | Client identifier |
| `--project <name>` | **Yes** | Project name |
| `--output <dir>` | No | Output directory (default: `./output`) |
| `--mode <mode>` | No | `domain` \| `folder` \| `page` \| `list` (default: `page`) |
| `--delay <ms>` | No | Milliseconds between fetches (default: `500`) |
| `--no-resume` | No | Re-crawl URLs already in the inventory |
| `--config <path>` | No | Custom prompt-injection patterns file |
| `--max-depth <n>` | No | Maximum crawl depth (default: `0`) |

---

## Output directory layout

```
output/
└── myclient_myproject/
    └── example.com/
        ├── _inventory.csv          ← inventory with all metadata
        ├── homepage.txt            ← root URL content
        ├── about.txt               ← /about
        ├── services/
        │   └── consulting.txt      ← /services/consulting
        └── contact.txt             ← /contact
```

- **No `index` folders or `index.txt` files** — `www.test.com/index.html` → `homepage.txt`, and `www.test.com/parent-folder/index.html` → `parent-folder.txt`.
- Special characters in URLs are transliterated to ASCII (`unidecode`) and sanitized to safe path segments.

---

## Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| INV-01 | Only HTML content gets a `.txt` file | `contentType` check before conversion |
| INV-02 | Navigation, scripts, footers, ads are stripped | `sanitizeHtml()` removes elements by tag and CSS class/ID |
| INV-03 | Prompt-injection patterns are detected and stripped | `sanitizeText()` applies configurable regex patterns |
| INV-04 | No `index` folders or files | `urlToFilename()` normalizes `index` and `/` → `homepage.txt` |
| INV-05 | Resume is the default behavior | `crawl_status=done` in CSV causes skip on next run |
| INV-06 | Directory tree mirrors URL path structure | `urlToFilename()` produces `path/to/page.txt` from `/path/to/page` |

---

## The Happy Path

1. **Prepare a seed URL or URL list file.**
2. **Run the crawler** with `--client`, `--project`, and `--url` / `--urls-file`.
3. **For each URL:**
   - Page is downloaded via `wget`.
   - HTML is sanitized (nav/scripts/ads removed).
   - Clean text is written to the mirrored directory tree.
   - Metadata is extracted and upserted into `_inventory.csv` with `crawl_status=done`.
4. **All URLs processed** → console prints summary. Exit 0.

---

## Troubleshooting & workarounds

### `wget: command not found`
**Cause:** `wget` is not installed on the system.  
**Fix:** Install `wget` — `brew install wget` (macOS), `apt-get install wget` (Ubuntu), etc.

### `Error: Either --url or --urls-file must be provided`
**Cause:** No seed URL was given.  
**Fix:** Provide `--url` for a single URL or `--urls-file` for a list.

### Pages are skipped with `crawl_status=done`
**Cause:** Resume mode is active and the URLs already exist in the inventory.  
**Fix:** Use `--no-resume` to force re-crawl.

### Non-HTML content shows `skipped txt`
**Cause:** The URL returned a non-HTML content type (PDF, image, etc.).  
**Mitigation:** Only HTML pages are converted to `.txt`. Binary assets are tracked in the inventory but not textified.

### Sanitized text still contains unwanted content
**Cause:** The page uses custom CSS classes/IDs not in the default blocklist.  
**Fix:** Create a custom `prompt-injection.conf` or patterns file and pass it via `--config`.

### Prompt-injection artefacts in output
**Cause:** New injection patterns not covered by the default config.  
**Fix:** Extend the patterns file. The default patterns catch common adversarial prefixes; you can add regex patterns for new attacks.

### `sanitizeHtml` removes too much content
**Cause:** Aggressive CSS class filtering hits legitimate content.  
**Workaround:** Review the sanitize blocklist in `src/sanitize.ts` and adjust for your target site's CSS conventions.

### Crawl is slow on large sites
**Cause:** Default 500ms delay between fetches, plus sequential processing.  
**Fix:** Reduce `--delay` (e.g., `--delay 100`) for faster crawling, or run in `list` mode with a pre-filtered URL list.

### URLs are discovered but not all are crawled
**Cause:** `domain` mode discovers URLs via sitemap/robots.txt + BFS, but some may be excluded by depth or blocked by robots.  
**Fix:** Increase `--max-depth`, or manually add missing URLs to a `--urls-file` and use `--mode list`.
