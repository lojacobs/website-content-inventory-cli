# Specs — Bootstrap & Crawler

> **Location:** `modules/bootstrap-and-crawler/specs.md`
> **Updated by:** Planner.
> **Read by:** Orchestrator (audit mode), Workers (task context).
> Relationships and data flow → `modules/bootstrap-and-crawler/architecture.md`.

---

## Module Purpose

The bootstrap-and-crawler module discovers and fetches web pages (via explicit URL lists, folder prefix, or full-domain crawl with sitemap discovery), sanitizes content, extracts metadata, and persists each page as a clean `.txt` file and an `InventoryRow` in `_inventory.csv`. It is used by the CLI operator and its outputs are consumed by the `gws-sync` and `ai-summarizer` modules.

---

## Functional Requirements

1. The system shall fetch HTML from each provided URL via HTTP without executing any JavaScript.
2. The system shall strip non-content elements (nav, header, footer, script, style, and elements whose id/class matches nav/menu/btn/cta patterns) from downloaded HTML before any further processing.
3. The system shall convert sanitized HTML to plain text, preserving the semantic structure of headings, paragraphs, lists, links, and tables.
4. The system shall scan plain text against patterns defined in `prompt-injection.conf` and neutralise all matches before writing to disk.
5. The system shall write each page's clean text to `~/tmp/{client}_{project}/{domain}/{path}.txt`, transliterating non-ASCII characters via unidecode and replacing remaining special characters with `_`.
6. The system shall map root paths (`/`, `/index.html`, `/index`) to `homepage.txt`; no `index/` subdirectory shall be created.
7. The system shall mirror the URL path hierarchy in the local folder structure (e.g., `/parent/page.html` → `parent/page.txt`).
8. The system shall extract and record per-page metadata: URL, page title, meta description, detected language, word count, HTTP status code, last-modified date, canonical URL, noindex flag, image count, linked-file count, URL depth.
9. The system shall upsert each page's metadata as one row in `_inventory.csv`, using the **original** URL as the primary key. When a redirect is encountered, `Statut_HTTP` records the redirect code (e.g. 301) and `URL_finale` records the final URL after all redirects; the final URL is not inserted as a separate row.
10. The system shall support resume: on restart, URLs already present in `_inventory.csv` are skipped.
11. The system shall log a per-URL error and continue processing remaining URLs when a single page fetch fails; the failed URL shall not be added to the inventory.
12. The system shall operate independently of the `gws-sync` and `ai-summarizer` modules (standalone crawl mode).
13. The system shall allow the injection-pattern list to be customised by editing `prompt-injection.conf`.
14. The system shall expose a `fci-crawl` binary installable via pnpm.
15. The system shall warn the user of URL errors detected during the crawl; the log of failed URLs shall be accessible on request.
16. The system shall support three crawl modes selected via CLI flags:
    - **Domain mode** (auto-detected when the seed URL is a root URL, i.e. path is `/` or absent): attempts sitemap discovery via `robots.txt` → `Sitemap:` directive, then fetches and parses all `<url><loc>` entries; falls back to BFS link-following within the same domain if no sitemap is found or the sitemap is partial. All discovered URLs within the domain are crawled.
    - **Folder mode** (`--folder` flag): crawls all pages whose path starts with the parent directory of the given URL. If the given URL ends in a filename (e.g. `/espace-citoyen/page.html`), the folder prefix is derived as `/espace-citoyen/`. Link-following is enabled within that path prefix only; no sitemap is used.
    - **Page / List mode** (default when no flag given, or `--urls-file <path>`): fetches only the explicitly provided URLs with no link-following. Multiple URL arguments are accepted. `--urls-file` reads one URL per line from a file.
17. The system shall never follow links outside the seed domain in any crawl mode. Cross-domain redirect targets are fetched for their HTTP status and final URL only; they are not recursed into.

---

## Non-Functional Requirements

| Category | Requirement | Threshold |
|---|---|---|
| Performance | Request delay between HTTP fetches | Configurable; default ≥ 500 ms |
| Security | Downloaded HTML never executed | `<script>` and `<style>` tags stripped before text extraction |
| Reliability | Per-URL failure tolerance | Errors logged and skipped; crawl continues; ≤ 3 retries per URL |
| Reliability | Resume on interruption | Any URL in `_inventory.csv` is skipped on restart |
| Compatibility | Runtime | Node.js ≥ 18 or Bun; ESM modules; TypeScript source |

---

## Out of Scope

- Google Drive folder creation or file upload (handled by `gws-sync`).
- AI classification of `Type_de_page` or generation of `Resume_200_chars` (handled by `ai-summarizer`).
- JavaScript rendering or headless-browser crawling.
- Authentication-gated pages (login walls, OAuth-protected content).
- Cross-domain crawling (all link-following is constrained to the seed domain).

---

## Data Structures / Entities

### InventoryRow

| Field | Type | Required | Notes |
|---|---|---|---|
| `URL` | `string` | Yes | Primary key; original URL as requested |
| `URL_finale` | `string` | No | Final URL after redirects; absent if no redirect occurred |
| `Titre` | `string` | Yes | Page `<title>` |
| `Description` | `string` | Yes | `<meta name="description">` |
| `Resume_200_chars` | `string` | No | Max 200 chars; filled by ai-summarizer |
| `Type_de_page` | `string` | No | Filled by ai-summarizer |
| `Profondeur_URL` | `number` | Yes | Path segment depth from root |
| `Nb_mots` | `number` | Yes | Word count of clean text |
| `Statut_HTTP` | `number` | Yes | HTTP status code of the original URL (e.g. 301 for a redirect) |
| `Langue` | `string` | Yes | BCP-47 language code (e.g., `fr`) |
| `Date_modifiee` | `string` | No | ISO date from `Last-Modified` header |
| `Canonical` | `string` | No | `<link rel="canonical">` href |
| `Noindex` | `boolean` | Yes | True if `<meta name="robots" content="noindex">` |
| `Nb_images` | `number` | Yes | Count of `<img>` elements |
| `Fichiers_liés` | `number` | Yes | Count of links to PDF/DOC/XLS/etc. |
| `Lien_Google_Doc` | `string` | No | URL of the Google Doc created by gws-sync for this page; empty until gws-sync runs |
| `Lien_dossier_Drive` | `string` | No | URL of the Google Drive folder containing this page's doc; multiple pages sharing a path prefix share the same folder URL; empty until gws-sync runs |

> Full relationships → `modules/bootstrap-and-crawler/architecture.md § Domain Model`

### CrawlOptions

| Field | Type | Required | Notes |
|---|---|---|---|
| `outputDir` | `string` | No | Root directory for output; default `~/tmp/`. Full output path is `{outputDir}/{client}_{project}/{domain}/` |
| `mode` | `'domain' \| 'folder' \| 'page' \| 'list'` | Yes | Crawl mode; see FR-16 |
| `folderPrefix` | `string` | No | Path prefix to constrain folder-mode crawling; derived automatically from the seed URL when `mode=folder` |
| `urlsFile` | `string` | No | Path to a newline-delimited file of URLs; used when `mode=list` |
| `resume` | `boolean` | No | Default `true`; skip already-processed URLs |
| `patterns` | `string[]` | No | Injection patterns; loaded from `prompt-injection.conf` if absent |
| `userAgent` | `string` | No | HTTP User-Agent header |
| `timeout` | `number` | No | Per-request timeout in seconds |

---

## Integration Points

### Consumed from other modules

| Module | What is consumed | Reference |
|---|---|---|
| `shared` | `InventoryRow`, `upsertRow`, `readInventory`, `writeInventory`, `ensureDirForFile` | `packages/shared/src/` |

### Exposed to other modules

| Consumer | What is exposed | Reference |
|---|---|---|
| `gws-sync` | `_inventory.csv` + `*.txt` files on disk | `outputDir/` |
| `ai-summarizer` | `_inventory.csv` rows with empty `Type_de_page` / `Resume_200_chars` | `{outputDir}/{client}_{project}/{domain}/_inventory.csv` |

---

## Design Reference

*(This module has no UI.)*

---

## Open Questions

| # | Question | Status | Resolution |
|---|---|---|---|
| SQ-01 | Should recursive link-following (spider mode) be added? | **Resolved** | Yes, within the seed domain only. Three modes defined: Domain (sitemap + BFS), Folder (path-prefix BFS), Page/List (explicit, no following). See FR-16–17. |
| SQ-02 | How should redirected URLs be recorded — original or final URL? | **Resolved** | Original URL is the primary key. `Statut_HTTP` holds the redirect code (e.g. 301). `URL_finale` holds the final URL. Final URL is not inserted as a separate row. |
