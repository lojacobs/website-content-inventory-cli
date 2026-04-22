# Architecture — Bootstrap & Crawler

> **Audience:** Planner (Claude), Orchestrator, Auditor.
> **Constraint:** Keep this file under 400 tokens when processed by Context Builder.
> Extended details belong in `modules/{module-name}/specs.md` or `general/DESIGN.md` — never inline here.

---

## Domain Model

The module manages **CrawlJobs** (a list of URLs + `CrawlOptions`) that produce **Pages**. Each Page passes through a linear pipeline: Download → MetaExtract → HtmlSanitize → TextConvert → InjectionSanitize → FilePersist → InventoryUpsert. The **Inventory** (`_inventory.csv`) holds one **InventoryRow** per Page (keyed by URL) and is the resume checkpoint. **CrawlOptions** configure the pipeline (outputDir, inventoryPath, resume flag, injection patterns, userAgent, timeout). The `fci-crawl` binary is the entry point; it delegates to `crawl()`, which calls `processPage()` per URL.

---

## Data Flow — Happy Path

1. `fci-crawl` CLI parses args → builds `CrawlOptions`
2. `crawl()` reads `_inventory.csv` to build the set of already-processed URLs (resume support); creates the CSV with headers if absent
3. For each unprocessed URL, `processPage()` runs:
   a. `downloadPage()` fetches HTML via Node `fetch`; records HTTP status and `Last-Modified`
   b. `extractMeta()` parses `<title>`, `<meta description>`, `lang`, word count, canonical, noindex, image count, linked-file count, URL depth
   c. `sanitizeHtml()` strips `nav`, `header`, `footer`, `script`, `style`, and elements whose `id`/`class` matches nav/menu/btn/cta patterns
   d. `htmlToText()` converts cleaned HTML → readable plain text (preserving headings, lists, links, tables)
   e. `sanitizeText()` scans text against patterns from `prompt-injection.conf` and neutralises matches
   f. `.txt` file written to `outputDir/{ascii-slug}.txt` (unidecode transliteration; `index` paths → `homepage`)
   g. `upsertRow()` appends or updates the row in `_inventory.csv`
4. After all URLs, `crawl()` logs total processed / skipped counts

---

## Invariants

- {INV-01} `_inventory.csv` is written via atomic upsert keyed on `URL`; a URL appears exactly once.
- {INV-02} `sanitizeText()` always executes before any text is written to disk.
- {INV-03} URL path segments are transliterated to ASCII via `unidecode` before becoming file-system names; remaining special characters are replaced with `_`.
- {INV-04} Root path (`/`) and `index.html` segments map to `homepage.txt`; no `index/` subdirectory is created.

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
