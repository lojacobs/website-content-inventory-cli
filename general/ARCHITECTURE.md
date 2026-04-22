# Architecture — System

> **Audience:** Planner (Claude), Orchestrator, Auditor.
> **Constraint:** Keep this file under 400 tokens when processed by Context Builder.
> Extended details belong in `modules/{module-name}/architecture.md`, `modules/{module-name}/specs.md`, or `general/DESIGN.md` — never inline here.

---

## Domain Model

The system manages **Projects** identified by a `{client}_{project}` slug, each targeting one or more **URLs** belonging to a **Domain**. A URL is processed into a **Page**: a sanitized `.txt` file on disk and an **InventoryRow** in `_inventory.csv`. The **Inventory** is the single source of truth for crawl progress and feeds two downstream modules: `gws-sync` uploads `.txt` files as Google Docs and `_inventory.csv` as a Google Sheet into a **Google Drive Folder**; `ai-summarizer` reads the inventory, calls the Pi SDK to classify each Page as a **PageType** and generate a **Resume**, then writes both back to the inventory.

---

## Data Flow — Happy Path

1. User invokes `fci-crawl` CLI with URLs, client name, project name, and options
2. `bootstrap-and-crawler` fetches each page, sanitizes HTML, extracts metadata, converts to `.txt`, upserts `_inventory.csv`
3. `gws-sync` reads the local output folder, mirrors the folder structure in Google Drive, uploads `.txt` → Google Docs and `_inventory.csv` → Google Sheets
4. `ai-summarizer` iterates inventory rows with empty `Type_de_page` / `Resume_200_chars`, calls Pi SDK (user-chosen provider + model), writes results back to the Google Sheet

---

## Invariants

- {INV-01} No downloaded content is executed or rendered locally — HTML is parsed as text only, JS is stripped.
- {INV-02} `_inventory.csv` is the canonical crawl checkpoint; resume logic reads it exclusively.
- {INV-03} Prompt-injection sanitization (from `prompt-injection.conf`) runs on every page before any text reaches disk or an AI model.
- {INV-04} No API keys or credentials are hardcoded; all secrets come from `~/.pi/agent/auth.json` or environment variables.

---

## Constraints

- {PERF} Crawler respects a configurable request delay (default 500 ms) between HTTP fetches to avoid overloading target servers.
- {SEC} All HTML is sanitized before text is persisted to disk or forwarded to any AI provider.
- {COMPAT} All packages target Node.js ≥ 18 / Bun; the monorepo is managed with pnpm workspaces and installable via `pnpm install`.

---

## Naming Conventions

| Scope | Convention | Example |
|---|---|---|
| Task IDs | `{module-prefix}-{NNN}` | `crawler-001` |
| RCA files | `rca-{YY-MM-DD_HH-MM}.md` | `rca-25-04-21_14-30.md` |
| Output root | `~/tmp/{client}_{project}/{domain}/` | `~/tmp/laurent_test/standredekamouraska.ca/` |
| Inventory file | `_inventory.csv` (at output root) | — |
| Page text files | `{ascii-slug}.txt` | `urbanisme.txt`, `homepage.txt` |
| Config variables | `SCREAMING_SNAKE_CASE` | `OUTPUT_DIR` |
| Package folders | `kebab-case` under `packages/` | `packages/crawler` |
| Module folders | `kebab-case` under `modules/` | `modules/bootstrap-and-crawler` |

---

## Extended Details

- Module-level data flows and constraints → `modules/{module-name}/architecture.md`
- Functional and non-functional requirements → `modules/{module-name}/specs.md`
- UI/UX source of truth → `general/DESIGN.md`
- Agent runtime config → `AGENTS.md` + `.pi/skills/`
