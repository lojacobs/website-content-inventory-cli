/**
 * Prompt Injection Detection Module
 *
 * Provides utilities for detecting and sanitizing prompt injection attempts
 * in crawled text content before it is used in LLM contexts.
 *
 * Features:
 * - Loads injection patterns from a config file
 * - Removes invisible unicode characters (zero-width space, BOM, etc.)
 * - Normalizes homoglyphs (Cyrillic → Latin equivalents)
 * - Strips sentences/phrases matching known injection patterns
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import unidecode from "unidecode";

// __dirname polyfill for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default path to the injection patterns config relative to this file's dir. */
const DEFAULT_CONF = resolve(__dirname, "..", "prompt-injection.conf");

/** Invisible / control unicode characters to strip. */
const INVISIBLE_CHARS: Array<[RegExp, string]> = [
  // Zero-width space
  [/\u200B/g, ""],
  // Zero-width non-joiner
  [/\u200C/g, ""],
  // Zero-width joiner
  [/\u200D/g, ""],
  // Word joiner
  [/\u2060/g, ""],
  // Zero-width no-break space (BOM variant)
  [/\uFEFF/g, ""],
  // Soft hyphen
  [/\u00AD/g, ""],
  // Figure space
  [/\u2007/g, ""],
  // Narrow no-break space
  [/\u202F/g, ""],
  // Non-breaking hyphen
  [/\u2011/g, ""],
  // Left-to-right mark / right-to-left mark
  [/\u200E/g, ""],
  [/\u200F/g, ""],
  // Line separator / paragraph separator
  [/\u2028/g, " "],
  [/\u2029/g, " "],
  // Carriage return (dangling)
  [/\r/g, ""],
];

/** A simplified homoglyph map: common confusable Cyrillic → Latin.
 *  Full coverage is handled by unidecode; this map catches the most
 *  dangerous single-character replacements that unidecode maps ambiguously.
 */
const HOMOGLYPH_MAP: Array<[RegExp, string]> = [
  // Cyrillic 'а' (U+0430) → Latin 'a'
  [/[\u0430]/g, "a"],
  // Cyrillic 'е' (U+0435) → Latin 'e'
  [/[\u0435]/g, "e"],
  // Cyrillic 'о' (U+043E) → Latin 'o'
  [/[\u043E]/g, "o"],
  // Cyrillic 'р' (U+0440) → Latin 'p'
  [/[\u0440]/g, "p"],
  // Cyrillic 'с' (U+0441) → Latin 'c'
  [/[\u0441]/g, "c"],
  // Cyrillic 'х' (U+0445) → Latin 'x'
  [/[\u0445]/g, "x"],
  // Cyrillic 'у' (U+0443) → Latin 'y'
  [/[\u0443]/g, "y"],
  // Cyrillic 'к' (U+043A) → Latin 'k'
  [/[\u043A]/g, "k"],
  // Cyrillic 'М' (U+041C) → Latin 'M'
  [/[\u041C]/g, "M"],
  // Cyrillic 'А' (U+0410) → Latin 'A'
  [/[\u0410]/g, "A"],
  // Cyrillic 'В' (U+0412) → Latin 'B'
  [/[\u0412]/g, "B"],
  // Cyrillic 'Е' (U+0415) → Latin 'E'
  [/[\u0415]/g, "E"],
  // Cyrillic 'Н' (U+041D) → Latin 'H'
  [/[\u041D]/g, "H"],
  // Cyrillic 'Р' (U+0420) → Latin 'P'
  [/[\u0420]/g, "P"],
  // Cyrillic 'С' (U+0421) → Latin 'C'
  [/[\u0421]/g, "C"],
  // Cyrillic 'Т' (U+0422) → Latin 'T'
  [/[\u0422]/g, "T"],
  // Cyrillic 'Х' (U+0425) → Latin 'X'
  [/[\u0425]/g, "X"],
  // Cyrillic 'У' (U+0423) → Latin 'Y'
  [/[\u0423]/g, "Y"],
  // Cyrillic 'К' (U+041A) → Latin 'K'
  [/[\u041A]/g, "K"],
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load injection pattern keywords/phrases from a config file.
 *
 * Lines starting with `#` or that are blank are ignored.
 * Whitespace is trimmed from each line.
 *
 * @param confPath  Absolute or relative path to the config file.
 *                  Defaults to `prompt-injection.conf` next to this module.
 * @returns Array of non-comment, non-empty pattern strings.
 */
export function loadInjectionPatterns(confPath?: string): string[] {
  const path = confPath
    ? resolve(confPath)
    : DEFAULT_CONF;

  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n");

  const patterns: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip blank lines and comment lines
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    patterns.push(trimmed);
  }

  return patterns;
}

/**
 * Sanitize a text string to reduce prompt injection risk.
 *
 * Operations applied in order:
 * 1. Remove invisible unicode characters
 * 2. Normalize homoglyphs (Cyrillic → Latin) using both the homoglyph map
 *    and `unidecode` for broader coverage
 * 3. Remove sentences/phrases that match any loaded injection pattern
 *    (case-insensitive whole-word match)
 *
 * @param text     The raw text to sanitize.
 * @param patterns Optional array of patterns to use instead of loading from
 *                 the config file. Pass `loadInjectionPatterns()` result
 *                 for best performance when sanitizing multiple texts.
 * @returns Sanitized text.
 */
export function sanitizeText(text: string, patterns?: string[]): string {
  let result = text;

  // 1. Strip invisible unicode characters
  for (const [pattern, replacement] of INVISIBLE_CHARS) {
    result = result.replace(pattern, replacement);
  }

  // 2. Normalize homoglyphs — first the explicit map, then unidecode
  for (const [pattern, replacement] of HOMOGLYPH_MAP) {
    result = result.replace(pattern, replacement);
  }
  // unidecode handles characters that don't have a direct homoglyph mapping
  result = unidecode(result);

  // 3. Remove injection pattern sentences
  const injectionPatterns = patterns ?? loadInjectionPatterns();
  for (const pattern of injectionPatterns) {
    if (!pattern) continue;

    // Escape regex special characters in the pattern
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Match the pattern as a whole token sequence, case-insensitive,
    // bounded by word boundaries where possible.
    // We also handle pattern phrases by splitting on spaces:
    // if it's a single-word pattern, use \b boundaries;
    // if it's multi-word, do a loose substring removal.
    const isMultiWord = pattern.includes(" ");

    if (isMultiWord) {
      // Remove the entire line/sentence containing the phrase.
      // Strategy: split into sentences, remove those containing the phrase,
      // rejoin.
      const sentenceDelimiters = /([.!?]\s+)/;
      const sentences = result.split(sentenceDelimiters);

      const filtered: string[] = [];
      for (let i = 0; i < sentences.length; i += 2) {
        const sentence = sentences[i] ?? "";
        const separator = sentences[i + 1] ?? "";

        const contains = new RegExp(escaped, "i").test(sentence);
        if (!contains) {
          filtered.push(sentence, separator);
        }
        // If the sentence matches, we skip it (don't add to filtered output)
      }

      result = filtered.join("");
    } else {
      // Single-word pattern — remove word-level occurrences with boundaries
      const wordRe = new RegExp(`\\b${escaped}\\b`, "gi");
      result = result.replace(wordRe, "");
    }
  }

  // Clean up any double-spaces or triple-spaces introduced by removals
  result = result.replace(/  +/g, " ");

  return result.trim();
}
