# Full Content Inventory Integrated — Implementation Plan (v2)

**Goal:** Build a monorepo CLI toolset (`fci`) that crawls websites, converts pages to sanitized text files, syncs them to Google Drive as Docs/Sheets, and fills AI-generated summaries — all resumable, modular, and independently operable.

**Architecture:** Three independent packages (`crawler`, `gws-sync`, `ai-summarizer`) in a pnpm workspace, coordinated by a root `cli` package and sharing types/utils via a `shared` package. Resume state is tracked in `_inventory.csv` per crawl session; each pipeline stage has its own status column (`crawl_status`, `sync_status`, `ai_status`).

**Tech Stack:** Node.js 20+, TypeScript 5, pnpm workspaces, Commander.js, Cheerio (HTML parsing), csv-parse + csv-stringify, unidecode (homoglyph normalization), Vitest, execa (subprocess), @mariozechner/pi-coding-agent + @mariozechner/pi-ai (AI SDK), wget / gws (system tools, must be globally installed)

**Test URLs:** `https://www.standredekamouraska.ca/espace-citoyen/urbanisme/` & `https://mrckamouraska.com/services/developpement-du-territoire/developpement-culturel/`

---

## Monorepo File Map

| File | Purpose |
|------|---------|
| `package.json` | Workspace root, shared dev scripts |
| `pnpm-workspace.yaml` | Defines `packages/*` |
| `tsconfig.base.json` | Shared TS compiler config |
| `.gitignore` | Node artifacts, `.env`, `node_modules` |
| `.github/workflows/ci.yml` | CI pipeline (build + test) |
| `LICENSE` | MIT |
| `README.md` | Public docs + install instructions |
| `CLAUDE.md` | AI agent skill for this CLI |
| `packages/shared/src/types.ts` | `InventoryRow`, `CrawlConfig`, `SyncConfig`, `SummarizeConfig` |
| `packages/shared/src/inventory.ts` | CSV read / write / upsert helpers |
| `packages/shared/src/paths.ts` | URL → local filesystem path mapping + safe filename sanitization |
| `packages/shared/src/index.ts` | Re-exports |
| `packages/crawler/src/download.ts` | wget wrapper + content-type guard + dangerous-extension guard |
| `packages/crawler/src/sanitize.ts` | Cheerio HTML element filter (remove nav/menu/btn/etc.) |
| `packages/crawler/src/convert.ts` | Sanitized HTML → plain text |
| `packages/crawler/src/injection.ts` | Prompt injection detection + unicode normalization |
| `packages/crawler/src/meta.ts` | Extract page metadata (title, lang, word count, images…) |
| `packages/crawler/src/crawl.ts` | Orchestrator: queue → download → sanitize → convert → upsert CSV |
| `packages/crawler/src/cli.ts` | `fci-crawl` binary entry point |
| `packages/crawler/prompt-injection.conf` | Blacklist regex patterns (user-customizable) |
| `packages/gws-sync/src/drive.ts` | Mirror local folder tree in Google Drive via gws CLI |
| `packages/gws-sync/src/sheets.ts` | Upload / refresh `_inventory.csv` as Google Sheets |
| `packages/gws-sync/src/docs.ts` | Upload `.txt` files as Google Docs |
| `packages/gws-sync/src/images.ts` | Replace `[IMAGE: alt \| src]` markers with real images in GDocs |
| `packages/gws-sync/src/sync.ts` | Orchestrator: iterate CSV rows by sync_status |
| `packages/gws-sync/src/cli.ts` | `fci-sync` binary entry point |
| `packages/ai-summarizer/src/pi.ts` | Pi SDK wrapper (one-shot prompt → string) |
| `packages/ai-summarizer/src/prompts.ts` | System prompts for page type + 200-char summary |
| `packages/ai-summarizer/src/summarize.ts` | Orchestrator: iterate CSV rows by ai_status |
| `packages/ai-summarizer/src/cli.ts` | `fci-summarize` binary entry point |
| `packages/cli/src/index.ts` | Root `fci` binary — wires all sub-commands |
| `packages/cli/package.json` | Public-facing installable package |
| `packages/*/tests/` | Vitest tests per package |
| `packages/crawler/tests/e2e.test.ts` | True E2E: crawl → verify CSV + txt via gws CLI |

---

## v2 Changes vs v1

| Area | v1 | v2 |
|------|----|----|
| **Multi-URL input** | Single `--url` only | `--url` (single) + `--urls-file <path>` (list) + `--max-depth N` (link following) |
| **Malware guard** | Extension-only check | Extension check + `Content-Type` header validation |
| **`Fichiers_liés` column** | Comma-separated paths | Integer count matching inspiration CSV |
| **`Date_modifiee` format** | Raw HTTP date from wget | Parsed to `YYYYMMDD` format matching inspiration CSV |
| **Special chars in paths** | Not handled | Replaced with `_` in `urlToTxtPath` |
| **CSV column order** | Rearranges inspiration columns | Matches inspiration file order; internal columns appended at end |
| **`@mariozechner/pi-ai` dep** | Missing from package.json | Added to `ai-summarizer` deps |
| **Image replacement in GDocs** | Assumes `gws docs replaceText --imageUrl` exists | v1: keep `[IMAGE: alt \| URL]` text markers; defer real insertion until gws capability confirmed |
| **E2E tests** | Manual only | Programmatic E2E test using `gws sheets read` to verify Sheets content |
| **CI pipeline** | None | `.github/workflows/ci.yml` with build + test on push/PR |

---

## Plans

- [Plan 1 v2 - Monorepo Bootstrap & Crawler](<PLAN 1 v2 - Monorepo Bootstrap + Crawler.md>)
- [Plan 2 - Google Workspace Sync](<PLAN 2 - GWS Sync Package.md>) *(unchanged)*
- [Plan 3 - AI Summarizer](<PLAN 3 - AI Summarizer Package.md>) *(unchanged)*
