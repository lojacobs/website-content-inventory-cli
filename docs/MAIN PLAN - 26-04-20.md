# Full Content Inventory Integrated — Implementation Plan

**Goal:** Build a monorepo CLI toolset (`fci`) that crawls websites, converts pages to sanitized text files, syncs them to Google Drive as Docs/Sheets, and fills AI-generated summaries — all resumable, modular, and independently operable.

**Architecture:** Three independent packages (`crawler`, `gws-sync`, `ai-summarizer`) in a pnpm workspace, coordinated by a root `cli` package and sharing types/utils via a `shared` package. Resume state is tracked in `_inventory.csv` per crawl session; each pipeline stage has its own status column (`crawl_status`, `sync_status`, `ai_status`).

**Tech Stack:** Node.js 20+, TypeScript 5, pnpm workspaces, Commander.js, Cheerio (HTML parsing), csv-parse + csv-stringify, unidecode (homoglyph normalization), Vitest, execa (subprocess), @mariozechner/pi-coding-agent (AI SDK, bundled as dependency), wget / gws (system tools, must be globally installed)

**Test URL:** `https://www.standredekamouraska.ca/espace-citoyen/urbanisme/`

---

## Monorepo File Map

| File | Purpose |
|------|---------|
| `package.json` | Workspace root, shared dev scripts |
| `pnpm-workspace.yaml` | Defines `packages/*` |
| `tsconfig.base.json` | Shared TS compiler config |
| `LICENSE` | MIT |
| `README.md` | Public docs + install instructions |
| `CLAUDE.md` | AI agent skill for this CLI |
| `packages/shared/src/types.ts` | `InventoryRow`, `CrawlConfig`, `SyncConfig`, `SummarizeConfig` |
| `packages/shared/src/inventory.ts` | CSV read / write / upsert helpers |
| `packages/shared/src/paths.ts` | URL → local filesystem path mapping |
| `packages/shared/src/index.ts` | Re-exports |
| `packages/crawler/src/download.ts` | wget wrapper + dangerous-extension guard |
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
| `packages/ai-summarizer/src/pi.ts` | @mariozechner/pi-coding-agent SDK wrapper (one-shot prompt → string) |
| `packages/ai-summarizer/src/prompts.ts` | System prompts for page type + 200-char summary |
| `packages/ai-summarizer/src/summarize.ts` | Orchestrator: iterate CSV rows by ai_status |
| `packages/ai-summarizer/src/cli.ts` | `fci-summarize` binary entry point |
| `packages/cli/src/index.ts` | Root `fci` binary — wires all sub-commands |
| `packages/cli/package.json` | Public-facing installable package |
| `packages/*/tests/` | Vitest tests per package |

---

## Plans

- [Plan 1 - Monorepo Bootstrap & crawler](<PLAN 1 - Monorepo Bootstrap + Crawler.md>)
- [Plan 2 - Google Workspace Sync](<PLAN 2 - GWS Sync Package.md>)
- [Plan 3 - AI Summarizer](<PLAN 3 - AI Summarizer Package.md>)