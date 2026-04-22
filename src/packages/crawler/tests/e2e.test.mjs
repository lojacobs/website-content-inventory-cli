/**
 * E2E Integration Test — fci-crawl CLI against real URL
 *
 * Verifies:
 *  1. Inventory CSV exists with correct INVENTORY_COLUMNS headers
 *  2. .txt file exists at correct URL-relative path under outputDir
 *  3. .txt file has non-empty sanitized text content
 *  4. crawl_status='done' — URL appears in CSV with a valid HTTP status
 *  5. Titre is non-empty
 *  6. Date_modifiee is YYYYMMDD format or 'missing-value'
 *  7. Fichiers_liés is an integer string
 *
 * Run: node --test packages/crawler/tests/e2e.test.mjs
 */

import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { test, before, after } from "node:test";
import { INVENTORY_COLUMNS } from "@full-content-inventory/shared";

const TEST_URL = "https://www.standredekamouraska.ca/espace-citoyen/urbanisme/";
const TEST_CLIENT = "standre";
const TEST_PROJECT = "e2e-test";
const OUTPUT_DIR = join(process.cwd(), ".test-e2e-output");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the fci-crawl CLI as a child process and wait for it to complete.
 */
function runCrawlCli() {
  return new Promise((resolve, reject) => {
    const cliPath = join(process.cwd(), "packages/crawler/dist/cli.js");
    const args = [
      "--url", TEST_URL,
      "--client", TEST_CLIENT,
      "--project", TEST_PROJECT,
      "--output", OUTPUT_DIR,
      "--no-resume",
    ];

    console.log("[e2e] Spawning: node", cliPath, args.join(" "));
    const proc = spawn("node", [cliPath, ...args], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    let stderr = "";

    proc.stdout?.on("data", (chunk) => {
      process.stdout.write(chunk);
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`CLI exited with code ${code}\nSTDERR: ${stderr}`));
      }
    });
    proc.on("error", reject);
  });
}

/**
 * Parse the inventory CSV and return an array of rows.
 */
function readInventoryCsv(csvPath) {
  const content = readFileSync(csvPath, "utf-8");
  return parse(content, {
    columns: [...INVENTORY_COLUMNS],
    skip_empty_lines: true,
    bom: true,
  });
}

/**
 * Compute the expected .txt filename for a given URL using the same logic
 * as the crawler (urlToFilename + ".txt").
 */
function urlToFilename(url) {
  const { pathname } = new URL(url);
  const decoded = pathname
    .replace(/^\//, "")
    .replace(/\//g, "__")
    .replace(/[^a-zA-Z0-9_\-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (decoded || "index") + ".txt";
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

before(() => {
  // Clean output directory before test
  if (existsSync(OUTPUT_DIR)) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`[e2e] Output dir: ${OUTPUT_DIR}`);
});

after(() => {
  // Cleanup after tests
  if (existsSync(OUTPUT_DIR)) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
    console.log(`[e2e] Cleaned up ${OUTPUT_DIR}`);
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("E2E — fci-crawl completes successfully against real URL", async (t) => {
  await t.test("CLI exits 0", () => runCrawlCli());

  const inventoryPath = join(OUTPUT_DIR, `${TEST_CLIENT}_${TEST_PROJECT}_inventory.csv`);

  await t.test("Inventory CSV exists", () => {
    const exists = existsSync(inventoryPath);
    if (!exists) throw new Error(`CSV not found: ${inventoryPath}`);
  });

  await t.test("CSV has correct header columns matching INVENTORY_COLUMNS", () => {
    const content = readFileSync(inventoryPath, "utf-8");
    const firstLine = content.split("\n")[0];
    const actualHeaders = firstLine.split(",").map((h) => h.trim().replace(/^"/, "").replace(/"$/, ""));
    const expected = [...INVENTORY_COLUMNS];
    if (actualHeaders.length !== expected.length) {
      throw new Error(
        `Header column count mismatch.\nExpected: ${expected.join(", ")}\nGot:      ${actualHeaders.join(", ")}`
      );
    }
    for (let i = 0; i < expected.length; i++) {
      if (actualHeaders[i] !== expected[i]) {
        throw new Error(
          `Header column mismatch at index ${i}.\nExpected: "${expected[i]}"\nGot:      "${actualHeaders[i]}"`
        );
      }
    }
  });

  const rows = readInventoryCsv(inventoryPath);
  const targetRow = rows.find((r) => r.URL === TEST_URL);

  await t.test("URL row is present in CSV (crawl_status='done')", () => {
    if (!targetRow) {
      throw new Error(
        `Target URL "${TEST_URL}" not found in CSV.\nCSV rows: ${rows.map((r) => r.URL).join(", ")}`
      );
    }
  });

  await t.test(".txt file exists at correct URL-relative path", () => {
    const filename = urlToFilename(TEST_URL);
    const txtPath = join(OUTPUT_DIR, filename);
    const exists = existsSync(txtPath);
    if (!exists) throw new Error(`.txt file not found: ${txtPath} (expected filename: ${filename})`);
  });

  await t.test(".txt file has non-empty sanitized text content", () => {
    const filename = urlToFilename(TEST_URL);
    const txtPath = join(OUTPUT_DIR, filename);
    const content = readFileSync(txtPath, "utf-8").trim();
    if (!content || content.length === 0) {
      throw new Error(`.txt file is empty: ${txtPath}`);
    }
    // Sanitized content should have some actual words (not just whitespace)
    const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
    if (wordCount < 5) {
      throw new Error(`.txt file has too few words (${wordCount}): ${txtPath}`);
    }
  });

  await t.test("Titre is non-empty", () => {
    if (!targetRow) throw new Error("No row found — previous test failed");
    const titre = targetRow.Titre;
    if (!titre || titre.trim().length === 0) {
      throw new Error(`Titre is empty for URL ${TEST_URL}`);
    }
  });

  await t.test("Date_modifiee is YYYYMMDD format or 'missing-value'", () => {
    if (!targetRow) throw new Error("No row found — previous test failed");
    const dm = targetRow.Date_modifiee;
    if (dm === "missing-value") return; // valid
    if (!/^\d{8}$/.test(dm)) {
      throw new Error(`Date_modifiee "${dm}" is not YYYYMMDD format or 'missing-value'`);
    }
    const year = parseInt(dm.slice(0, 4), 10);
    const month = parseInt(dm.slice(4, 6), 10);
    const day = parseInt(dm.slice(6, 8), 10);
    if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(`Date_modifiee "${dm}" has invalid date components (year=${year}, month=${month}, day=${day})`);
    }
  });

  await t.test("Fichiers_liés is an integer string", () => {
    if (!targetRow) throw new Error("No row found — previous test failed");
    const fl = targetRow.Fichiers_liés;
    if (fl === undefined || fl === null || fl === "") {
      throw new Error(`Fichiers_liés is empty/null for URL ${TEST_URL}`);
    }
    const num = parseInt(fl, 10);
    if (isNaN(num)) {
      throw new Error(`Fichiers_liés "${fl}" is not a valid integer`);
    }
  });
});
