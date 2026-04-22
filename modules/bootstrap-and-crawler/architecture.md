# Architecture — Bootstrap & Crawler

> **Audience:** Planner (Claude), Orchestrator, Auditor.
> **Constraint:** Keep this file under 400 tokens when processed by Context Builder.
> Extended details belong in `modules/{module-name}/specs.md` or `general/DESIGN.md` — never inline here.

---

## Domain Model

The module manages **CrawlJobs** (a seed URL + `CrawlOptions`) that produce **Pages**. URL discovery depends on mode: Domain mode uses sitemap discovery then BFS link-following within the domain; Folder mode uses path-prefix BFS; Page/List mode uses explicit URLs with no following. Each Page passes through a linear pipeline: Download → MetaExtract → HtmlSanitize → TextConvert → InjectionSanitize → FilePersist → InventoryUpsert. The **Inventory** (`_inventory.csv`) holds one **InventoryRow** per Page (keyed by original URL) and is the resume checkpoint. **CrawlOptions** configure the pipeline (outputDir, mode, folderPrefix, urlsFile, resume flag, injection patterns, userAgent, timeout). The `fci-crawl` binary is the entry point; it delegates to `crawl()`, which calls `processPage()` per URL.

---

## Data Flow — Happy Path

1. `fci-crawl` CLI parses args → detects crawl mode → builds `CrawlOptions`
2. URL discovery (before processing):
   - **Domain mode**: fetch `robots.txt` → parse `Sitemap:` → fetch and parse sitemap XML for all `<loc>` entries; fall back to BFS link-following within the domain if no sitemap found
   - **Folder mode**: derive folder prefix from seed URL (parent directory of any filename in the path); BFS link-following within that prefix only
   - **Page/List mode**: URL set is the explicit argument list or lines from `--urls-file`
3. `crawl()` reads `_inventory.csv` to build the set of already-processed URLs (resume support); creates the CSV with headers if absent
4. For each unprocessed URL, `processPage()` runs:
   a. `downloadPage()` fetches HTML via Node `fetch`; records HTTP status, `Last-Modified`, and final URL after redirects (`URL_finale`)
   b. `extractMeta()` parses `<title>`, `<meta description>`, `lang`, word count, canonical, noindex, image count, linked-file count, URL depth
   c. `sanitizeHtml()` strips `nav`, `header`, `footer`, `script`, `style`, and elements whose `id`/`class` matches nav/menu/btn/cta patterns
   d. `htmlToText()` converts cleaned HTML → readable plain text (preserving headings, lists, links, tables)
   e. `sanitizeText()` scans text against patterns from `prompt-injection.conf` and neutralises matches
   f. `.txt` file written to `{outputDir}/{client}_{project}/{domain}/{ascii-slug}.txt` (unidecode transliteration on path only; `index` paths → `homepage`)
   g. `upsertRow()` appends or updates the row in `_inventory.csv` keyed by original URL
5. After all URLs, `crawl()` logs total processed / skipped / failed counts; failed URLs accessible via log

---

## Invariants

- {INV-01} `_inventory.csv` is written via atomic upsert keyed on the original `URL`; a URL appears exactly once. Redirect targets are recorded in `URL_finale` only, never as a separate row.
- {INV-02} `sanitizeText()` always executes before any text is written to disk.
- {INV-03} `unidecode` is applied to URL path segments only when generating file-system names; it is never applied to page text content. Page text uses NFKC normalization for injection-pattern matching.
- {INV-04} Root path (`/`) and `index.html` segments map to `homepage.txt`; no `index/` subdirectory is created.
- {INV-05} Link-following never crosses the seed domain; all discovered URLs are validated against the seed domain before being enqueued.

---

## Constraints

- {PERF} Page processing is sequential; no concurrent fetching. Request delay is configurable (default 500 ms).
- {SEC} Downloaded HTML is never executed; `sanitizeHtml()` removes all `<script>` and `<style>` tags before any further processing.
- {COMPAT} Package targets Node.js ≥ 18 / Bun, ESM + TypeScript; compiled output lives in `packages/crawler/dist/`.

---

## Naming Conventions

| Scope | Convention | Example |
|---|---|---|
| Task IDs | `crawler-{NNN}` | `crawler-001` |
| Source files | `kebab-case.ts` | `sanitize.ts`, `inject.ts` |
| CLI binary | `fci-crawl` | — |
| Output text files | `{unidecode-slug}.txt` | `urbanisme.txt` |
| Root/index pages | `homepage.txt` | — |
| Config file | `prompt-injection.conf` | `packages/crawler/prompt-injection.conf` |

---

## Extended Details

- Functional and non-functional requirements → `modules/bootstrap-and-crawler/specs.md`
- System-wide invariants and module interactions → `general/ARCHITECTURE.md`
- Agent runtime config → `AGENTS.md` + `.pi/skills/`
