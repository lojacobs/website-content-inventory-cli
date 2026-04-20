#!/bin/bash
set -e
cd /Users/lo/dev/full-content-inventory-integrated

echo "=== Creating Epic ==="
EPIC=$(bd create "Full Content Inventory Integrated" -t epic -p 1 -d "Monorepo CLI toolset (fci) that crawls websites, converts pages to sanitized text files, syncs to Google Drive as Docs/Sheets, and fills AI-generated summaries. Three independent packages: crawler, gws-sync, ai-summarizer. All operations resumable via _inventory.csv status columns." --json)
EPIC_ID=$(echo "$EPIC" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Epic: $EPIC_ID"

echo "=== Creating Plan Tasks ==="
PLAN1=$(bd create "PLAN 1: Monorepo Bootstrap + Crawler" -t task -p 1 -d "Set up pnpm monorepo, shared types/utils package, and the full crawler pipeline: wget download, HTML sanitization, prompt injection removal, HTML-to-text conversion, metadata extraction, and fci-crawl CLI." --json)
PLAN1_ID=$(echo "$PLAN1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Plan1: $PLAN1_ID"

PLAN2=$(bd create "PLAN 2: GWS Sync" -t task -p 2 -d "Build gws-sync package: mirror folder tree in Google Drive, upload _inventory.csv as Google Sheets, upload .txt files as Google Docs, replace image markers with real images in GDocs, and fci-sync CLI." --json)
PLAN2_ID=$(echo "$PLAN2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Plan2: $PLAN2_ID"

PLAN3=$(bd create "PLAN 3: AI Summarizer" -t task -p 2 -d "Build ai-summarizer package using @mariozechner/pi-coding-agent SDK (bundled, no global install): page type classification and 200-char summary, summarize orchestrator with resume support, fci-summarize CLI, end-to-end integration test, and CI pipeline." --json)
PLAN3_ID=$(echo "$PLAN3" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Plan3: $PLAN3_ID"

echo "=== Creating Plan 1 Sub-tasks ==="
P1T1=$(bd create "P1-T1: Monorepo Scaffold" -t task -p 2 -d "Create root package.json, pnpm-workspace.yaml, tsconfig.base.json, and package.json for all 5 packages (shared, crawler, gws-sync, ai-summarizer, cli). Run pnpm install." --json)
P1T1_ID=$(echo "$P1T1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T1: $P1T1_ID"

P1T2=$(bd create "P1-T2: Shared Types" -t task -p 2 -d "Define InventoryRow (all CSV columns including crawl_status/sync_status/ai_status), CrawlConfig, SyncConfig, SummarizeConfig in packages/shared/src/types.ts." --json)
P1T2_ID=$(echo "$P1T2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T2: $P1T2_ID"

P1T3=$(bd create "P1-T3: URL Path Mapping" -t task -p 2 -d "Implement urlToTxtPath() with index.html collapse logic and urlToDownloadDir() in packages/shared/src/paths.ts. TDD with test cases for standredekamouraska.ca and spec examples." --json)
P1T3_ID=$(echo "$P1T3" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T3: $P1T3_ID"

P1T4=$(bd create "P1-T4: Inventory CSV Helpers" -t task -p 2 -d "Implement readInventory, writeInventory, upsertRow (by URL), getRow in packages/shared/src/inventory.ts. TDD with tmp-file tests." --json)
P1T4_ID=$(echo "$P1T4" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T4: $P1T4_ID"

P1T5=$(bd create "P1-T5: Prompt Injection Module" -t task -p 2 -d "Create prompt-injection.conf blacklist, loadInjectionPatterns(), sanitizeText() with invisible char stripping and homoglyph normalization via unidecode. TDD." --json)
P1T5_ID=$(echo "$P1T5" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T5: $P1T5_ID"

P1T6=$(bd create "P1-T6: HTML Sanitizer" -t task -p 2 -d "Cheerio-based sanitizer removing nav/menu/btn/cta/footer/header/sidebar/etc. by class and id patterns. Keep content elements. TDD." --json)
P1T6_ID=$(echo "$P1T6" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T6: $P1T6_ID"

P1T7=$(bd create "P1-T7: HTML to Text Converter" -t task -p 2 -d "Convert sanitized HTML to plain text. Headings to uppercase, images to [IMAGE: alt | src] markers, links to text (url). TDD." --json)
P1T7_ID=$(echo "$P1T7" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T7: $P1T7_ID"

P1T8=$(bd create "P1-T8: Page Metadata Extractor" -t task -p 2 -d "Extract title, description, lang, canonical, noindex, image count, linked files, word count, URL depth from HTML. TDD with standredekamouraska HTML fixture." --json)
P1T8_ID=$(echo "$P1T8" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T8: $P1T8_ID"

P1T9=$(bd create "P1-T9: wget Download Wrapper" -t task -p 2 -d "Wrap wget with dangerous-extension guard (exe/dmg/sh/bat etc.), build args with --server-response for HTTP status, parse Last-Modified header. TDD." --json)
P1T9_ID=$(echo "$P1T9" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T9: $P1T9_ID"

P1T10=$(bd create "P1-T10: Crawler Orchestrator" -t task -p 2 -d "Tie download + sanitize + inject + convert + metadata + CSV upsert into crawl() function with resume support via crawl_status column." --json)
P1T10_ID=$(echo "$P1T10" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T10: $P1T10_ID"

P1T11=$(bd create "P1-T11: Crawler CLI" -t task -p 2 -d "Create fci-crawl binary (packages/crawler/src/cli.ts) with Commander.js. Options: --url, --client, --project, --output, --no-resume, --config. Smoke test with standredekamouraska.ca URL." --json)
P1T11_ID=$(echo "$P1T11" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T11: $P1T11_ID"

P1T12=$(bd create "P1-T12: Root CLI Package" -t task -p 2 -d "Create packages/cli/src/index.ts: root fci binary wiring crawl/sync/summarize as sub-commands via Commander.js." --json)
P1T12_ID=$(echo "$P1T12" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T12: $P1T12_ID"

P1T13=$(bd create "P1-T13: LICENSE, README, CLAUDE.md" -t task -p 3 -d "MIT license, README with prerequisites and usage examples, CLAUDE.md AI agent skill documenting fci commands and workflow." --json)
P1T13_ID=$(echo "$P1T13" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P1T13: $P1T13_ID"

echo "=== Creating Plan 2 Sub-tasks ==="
P2T1=$(bd create "P2-T1: Verify gws CLI Interface" -t task -p 2 -d "Run gws --help and gws drive files --help to confirm exact sub-command names before implementing. Note upload vs import vs create commands." --json)
P2T1_ID=$(echo "$P2T1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P2T1: $P2T1_ID"

P2T2=$(bd create "P2-T2: Drive Folder Structure Mirror" -t task -p 2 -d "buildFolderTree() from local paths, mirrorFolderTree() calling gws drive files create with folder mimeType, returns Map of local path to Drive folder ID. TDD." --json)
P2T2_ID=$(echo "$P2T2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P2T2: $P2T2_ID"

P2T3=$(bd create "P2-T3: TXT to Google Docs Upload" -t task -p 2 -d "uploadAsDoc() using gws drive files import with application/vnd.google-apps.document mimeType. Returns GDoc URL. TDD." --json)
P2T3_ID=$(echo "$P2T3" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P2T3: $P2T3_ID"

P2T4=$(bd create "P2-T4: CSV to Google Sheets Upload" -t task -p 2 -d "uploadAsSheet() and updateSheet() using gws with application/vnd.google-apps.spreadsheet mimeType. TDD." --json)
P2T4_ID=$(echo "$P2T4" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P2T4: $P2T4_ID"

P2T5=$(bd create "P2-T5: Image Replacement in GDocs" -t task -p 2 -d "parseImageMarkers() extracts [IMAGE: alt | src] from txt. replaceImagesInDoc() calls gws docs replaceText to swap markers with real images. TDD for parser." --json)
P2T5_ID=$(echo "$P2T5" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P2T5: $P2T5_ID"

P2T6=$(bd create "P2-T6: Sync Orchestrator + CLI" -t task -p 2 -d "sync() iterates CSV rows by sync_status, mirrors folders, uploads docs, updates sheet, handles errors with resume. fci-sync CLI binary." --json)
P2T6_ID=$(echo "$P2T6" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P2T6: $P2T6_ID"

echo "=== Creating Plan 3 Sub-tasks ==="
P3T1=$(bd create "P3-T1: Pi SDK Wrapper" -t task -p 2 -d "buildRunPrompt(systemPrompt) factory using @mariozechner/pi-coding-agent SDK: AuthStorage + createAgentSession + DefaultResourceLoader for system prompt + event subscription for text_delta output. No global pi binary needed." --json)
P3T1_ID=$(echo "$P3T1" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P3T1: $P3T1_ID"

P3T2=$(bd create "P3-T2: AI Prompts" -t task -p 2 -d "PAGE_TYPE_SYSTEM_PROMPT (classify into 14 page types, respond with label only) and SUMMARY_SYSTEM_PROMPT (200-char max, same language as page). buildSummaryUserContent() truncates to 2000 chars." --json)
P3T2_ID=$(echo "$P3T2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P3T2: $P3T2_ID"

P3T3=$(bd create "P3-T3: Summarizer Orchestrator + CLI" -t task -p 2 -d "summarize() iterates CSV rows by ai_status, runs classify + summary in parallel via Promise.all, upserts after each row. fci-summarize CLI binary." --json)
P3T3_ID=$(echo "$P3T3" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P3T3: $P3T3_ID"

P3T4=$(bd create "P3-T4: End-to-End Integration Test" -t task -p 2 -d "Full pipeline test with standredekamouraska.ca: crawl to inspect txt to summarize to sync. Verify resume (re-run crawl skips already-done rows). Requires real API key and gws auth." --json)
P3T4_ID=$(echo "$P3T4" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P3T4: $P3T4_ID"

P3T5=$(bd create "P3-T5: CI Pipeline" -t task -p 3 -d "GitHub Actions workflow: pnpm install --frozen-lockfile, pnpm build, pnpm test on ubuntu-latest Node 20." --json)
P3T5_ID=$(echo "$P3T5" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "P3T5: $P3T5_ID"

echo "=== Adding Dependencies ==="
# Plan-level: PLAN2 and PLAN3 blocked by PLAN1
bd dep add "$PLAN2_ID" "$PLAN1_ID"
bd dep add "$PLAN3_ID" "$PLAN1_ID"

# Plan 1 sequential chain
bd dep add "$P1T2_ID" "$P1T1_ID"
bd dep add "$P1T3_ID" "$P1T2_ID"
bd dep add "$P1T4_ID" "$P1T3_ID"
bd dep add "$P1T5_ID" "$P1T4_ID"
bd dep add "$P1T6_ID" "$P1T5_ID"
bd dep add "$P1T7_ID" "$P1T6_ID"
bd dep add "$P1T8_ID" "$P1T7_ID"
bd dep add "$P1T9_ID" "$P1T8_ID"
bd dep add "$P1T10_ID" "$P1T9_ID"
bd dep add "$P1T11_ID" "$P1T10_ID"
bd dep add "$P1T12_ID" "$P1T11_ID"
bd dep add "$P1T13_ID" "$P1T12_ID"

# Plan 2: T1 first, T2-T5 parallel, T6 last
bd dep add "$P2T2_ID" "$P2T1_ID"
bd dep add "$P2T3_ID" "$P2T1_ID"
bd dep add "$P2T4_ID" "$P2T1_ID"
bd dep add "$P2T5_ID" "$P2T1_ID"
bd dep add "$P2T6_ID" "$P2T2_ID"
bd dep add "$P2T6_ID" "$P2T3_ID"
bd dep add "$P2T6_ID" "$P2T4_ID"
bd dep add "$P2T6_ID" "$P2T5_ID"

# Plan 3 sequential chain
bd dep add "$P3T2_ID" "$P3T1_ID"
bd dep add "$P3T3_ID" "$P3T2_ID"
bd dep add "$P3T4_ID" "$P3T3_ID"
bd dep add "$P3T5_ID" "$P3T4_ID"

echo "=== Linking to Epic ==="
bd dep add "$EPIC_ID" "$PLAN1_ID"
bd dep add "$EPIC_ID" "$PLAN2_ID"
bd dep add "$EPIC_ID" "$PLAN3_ID"
bd dep add "$EPIC_ID" "$P1T1_ID"
bd dep add "$EPIC_ID" "$P1T2_ID"
bd dep add "$EPIC_ID" "$P1T3_ID"
bd dep add "$EPIC_ID" "$P1T4_ID"
bd dep add "$EPIC_ID" "$P1T5_ID"
bd dep add "$EPIC_ID" "$P1T6_ID"
bd dep add "$EPIC_ID" "$P1T7_ID"
bd dep add "$EPIC_ID" "$P1T8_ID"
bd dep add "$EPIC_ID" "$P1T9_ID"
bd dep add "$EPIC_ID" "$P1T10_ID"
bd dep add "$EPIC_ID" "$P1T11_ID"
bd dep add "$EPIC_ID" "$P1T12_ID"
bd dep add "$EPIC_ID" "$P1T13_ID"
bd dep add "$EPIC_ID" "$P2T1_ID"
bd dep add "$EPIC_ID" "$P2T2_ID"
bd dep add "$EPIC_ID" "$P2T3_ID"
bd dep add "$EPIC_ID" "$P2T4_ID"
bd dep add "$EPIC_ID" "$P2T5_ID"
bd dep add "$EPIC_ID" "$P2T6_ID"
bd dep add "$EPIC_ID" "$P3T1_ID"
bd dep add "$EPIC_ID" "$P3T2_ID"
bd dep add "$EPIC_ID" "$P3T3_ID"
bd dep add "$EPIC_ID" "$P3T4_ID"
bd dep add "$EPIC_ID" "$P3T5_ID"

echo "=== Final List ==="
bd list

echo "=== DONE ==="
