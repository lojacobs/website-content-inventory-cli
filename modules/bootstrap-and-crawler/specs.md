# Specs — Bootstrap & Crawler

> **Location:** `modules/bootstrap-and-crawler/specs.md`
> **Updated by:** Planner.
> **Read by:** Orchestrator (audit mode), Workers (task context).
> Relationships and data flow → `modules/bootstrap-and-crawler/architecture.md`.

---

## Module Purpose

The bootstrap-and-crawler module fetches web pages from a user-supplied list of URLs, sanitizes content, extracts metadata, and persists each page as a clean `.txt` file and an `InventoryRow` in `_inventory.csv`. It is used by the CLI operator and its outputs are consumed by the `gws-sync` and `ai-summarizer` modules.

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
9. The system shall upsert each page's metadata as one row in `_inventory.csv`, using URL as the primary key.
10. The system shall support resume: on restart, URLs already present in `_inventory.csv` are skipped.
11. The system shall log a per-URL error and continue processing remaining URLs when a single page fetch fails; the failed URL shall not be added to the inventory.
12. The system shall operate independently of the `gws-sync` and `ai-summarizer` modules (standalone crawl mode).
13. The system shall allow the injection-pattern list to be customised by editing `prompt-injection.conf`.
14. The system shall expose a `fci-crawl` binary installable via pnpm.

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
- Sitemap discovery or recursive link-following (URLs must be provided explicitly).

---

## Data Structures / Entities

### InventoryRow

| Field | Type | Required | Notes |
|---|---|---|---|
| `URL` | `string` | Yes | Primary key; full URL |
| `Titre` | `string` | Yes | Page `<title>` |
| `Description` | `string` | Yes | `<meta name="description">` |
| `Resume_200_chars` | `string` | No | Max 200 chars; filled by ai-summarizer |
| `Type_de_page` | `string` | No | Filled by ai-summarizer |
| `Profondeur_URL` | `number` | Yes | Path segment depth from root |
| `Nb_mots` | `number` | Yes | Word count of clean text |
| `Statut_HTTP` | `number` | Yes | HTTP status code |
| `Langue` | `string` | Yes | BCP-47 language code (e.g., `fr`) |
| `Date_modifiee` | `string` | No | ISO date from `Last-Modified` header |
| `Canonical` | `string` | No | `<link rel="canonical">` href |
| `Noindex` | `boolean` | Yes | True if `<meta name="robots" content="noindex">` |
| `Nb_images` | `number` | Yes | Count of `<img>` elements |
| `Fichiers_liés` | `number` | Yes | Count of links to PDF/DOC/XLS/etc. |
| `Lien_Google_Doc` | `boolean` | Yes | True if page links to a Google Doc |
| `Lien_dossier_Drive` | `boolean` | Yes | True if page links to a Google Drive folder |

> Full relationships → `modules/bootstrap-and-crawler/architecture.md § Domain Model`

### CrawlOptions

| Field | Type | Required | Notes |
|---|---|---|---|
| `outputDir` | `string` | Yes | Root directory for `.txt` output files |
| `inventoryPath` | `string` | Yes | Path to `_inventory.csv` |
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
| `ai-summarizer` | `_inventory.csv` rows with empty `Type_de_page` / `Resume_200_chars` | `inventoryPath` |

---

## Design Reference

*(This module has no UI.)*

---

## Open Questions

| # | Question | Blocking? | Owner | Notes |
|---|---|---|---|---|
| SQ-01 | Should recursive link-following (spider mode) be added in a future iteration? | No | Planner | Current design requires explicit URL list |
| SQ-02 | How should redirected URLs be recorded in the inventory — original or final URL? | No | Planner | `CrawlResult.finalUrl` is available but not yet used as the key |
