/**
 * prompt-injection.ts
 * Shared prompt injection sanitization utilities.
 *
 * Provides:
 *   - loadInjectionPatterns(confPath?) — load regex patterns from conf file
 *   - sanitizeText(text, patterns?)    — strip invisible chars, normalize homoglyphs,
 *                                        remove injection pattern matches
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// ---------------------------------------------------------------------------
// Invisible / steganographic characters
// ---------------------------------------------------------------------------

/** Invisible Unicode characters used in steganographic injection */
const INVISIBLE_CHARS_RE =
  /[\u200B\u200C\u200D\u200E\u200F\u00AD\uFEFF\u2028\u2029\u061C\u180E\u2061\u2062\u2063\u2064]/g;

/** Null bytes and other C0/C1 control characters (except normal whitespace) */
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// ---------------------------------------------------------------------------
// Homoglyph normalization (manual map — no unidecode dependency)
// Covers common Cyrillic and Greek lookalikes of ASCII letters.
// ---------------------------------------------------------------------------

const HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillic → ASCII
  '\u0430': 'a', // а → a
  '\u0435': 'e', // е → e
  '\u043E': 'o', // о → o
  '\u0440': 'r', // р → r
  '\u0441': 'c', // с → c
  '\u0445': 'x', // х → x
  '\u0443': 'y', // у → y
  '\u0456': 'i', // і → i (Ukrainian)
  '\u0410': 'A', // А → A
  '\u0412': 'B', // В → B
  '\u0415': 'E', // Е → E
  '\u041A': 'K', // К → K
  '\u041C': 'M', // М → M
  '\u041D': 'H', // Н → H
  '\u041E': 'O', // О → O
  '\u0420': 'P', // Р → P
  '\u0421': 'C', // С → C
  '\u0422': 'T', // Т → T
  '\u0425': 'X', // Х → X
  // Greek → ASCII
  '\u03B1': 'a', // α → a
  '\u03B5': 'e', // ε → e (epsilon)
  '\u03BF': 'o', // ο → o (omicron)
  '\u03C1': 'p', // ρ → p (rho)
  '\u03BD': 'v', // ν → v (nu)
  '\u03C5': 'u', // υ → u (upsilon)
  '\u0391': 'A', // Α → A
  '\u0392': 'B', // Β → B
  '\u0395': 'E', // Ε → E
  '\u039A': 'K', // Κ → K
  '\u039C': 'M', // Μ → M
  '\u039D': 'N', // Ν → N
  '\u039F': 'O', // Ο → O
  '\u03A1': 'P', // Ρ → P
  '\u03A4': 'T', // Τ → T
  '\u03A7': 'X', // Χ → X
  // Latin lookalikes
  '\u0131': 'i', // ı (dotless i) → i
  '\u017F': 's', // ſ (long s) → s
  '\u01A3': 'oi', // ƣ → oi (approximate)
};

const HOMOGLYPH_RE = new RegExp(
  Object.keys(HOMOGLYPH_MAP)
    .map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g'
);

/**
 * Normalize homoglyphs (Cyrillic/Greek lookalikes → ASCII equivalents).
 * Uses a manual map; no external dependencies required.
 */
function normalizeHomoglyphs(text: string): string {
  return text.replace(HOMOGLYPH_RE, ch => HOMOGLYPH_MAP[ch] ?? ch);
}

// ---------------------------------------------------------------------------
// Built-in injection patterns
// ---------------------------------------------------------------------------

const BUILTIN_PATTERNS: RegExp[] = [
  // Ignore/disregard/forget instructions
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)\s+/i,
  /forget\s+(?:everything|all\s+(?:previous|prior|above))/i,

  // Override / role change
  /you\s+are\s+now\s+(?:a\s+)?(?:different|new|an?\s)/i,
  /override\s+(?:(?:all|previous)\s+)?instructions?/i,
  /new\s+(?:primary\s+)?instructions?\s*:/i,
  /act\s+as\s+if\s+you\s+(?:have\s+no|are\s+not)/i,

  // System prompt delimiters
  /\bSYSTEM\s*:/,
  /\[INST\]/,
  /\[\/INST\]/,

  // Chat format tokens (ChatML, Llama3, etc.)
  /<\|im_start\|>/,
  /<\|im_end\|>/,
  /<\|(?:user|assistant|system|end_turn|pad)\|>/i,
  /<<(?:SYS|sys)>>/i,

  // Raw hidden markers
  /\[TOOL_CALLS\]/i,
  /\[(?:Human|Assistant|System)\]/i,
  /###\s*(?:Human|Assistant|System)\s*:/i,

  // Jailbreak vocabulary
  /\bDAN\b/,
  /\bjailbreak\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bbypass\s+(?:safety|ethic)/i,
  /\bignore\s+(?:all\s+)?(?:your\s+)?rules/i,
  /\bforget\s+(?:your\s+)?(?:programming|instructions|rules)/i,

  // Data exfiltration prompts
  /print\s+(?:your\s+)?(?:system\s+)?prompt/i,
  /reveal\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions)/i,
  /repeat\s+(?:the\s+)?(?:above|previous)\s+(?:text|content)/i,

  // Common LLM context injection markers
  /\[\/?(context|ctx|instruction|user|human|ai|llm)\]/i,
];

// ---------------------------------------------------------------------------
// Default conf path (bundled alongside this file)
// ---------------------------------------------------------------------------

const DEFAULT_CONF_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'prompt-injection.conf'
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load regex patterns from a prompt-injection.conf file.
 * Format: one regex per line; lines starting with # are comments.
 *
 * @param confPath Path to conf file. Defaults to the built-in prompt-injection.conf.
 * @returns Array of pattern strings (not compiled RegExp).
 */
export function loadInjectionPatterns(confPath?: string): string[] {
  const filePath = confPath ?? DEFAULT_CONF_PATH;
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const patterns: string[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Validate it's a valid regex
    try {
      new RegExp(trimmed, 'i');
      patterns.push(trimmed);
    } catch {
      console.warn(`[prompt-injection] Invalid pattern skipped: ${trimmed}`);
    }
  }
  return patterns;
}

/**
 * Sanitize text by:
 *   1. Stripping invisible Unicode characters (zero-width space, soft hyphen, BOM, etc.)
 *   2. Stripping C0/C1 control characters
 *   3. Normalizing homoglyphs (Cyrillic/Greek lookalikes → ASCII)
 *   4. Removing injection pattern matches
 *
 * @param text     Input text to sanitize.
 * @param patterns Optional array of regex pattern strings to match against.
 *                 If omitted, uses the built-in BUILTIN_PATTERNS only.
 * @returns Sanitized text.
 */
export function sanitizeText(text: string, patterns?: string[]): string {
  let cleaned = text;

  // 1. Strip invisible characters
  cleaned = cleaned.replace(INVISIBLE_CHARS_RE, '');

  // 2. Strip control characters
  cleaned = cleaned.replace(CONTROL_CHARS_RE, '');

  // 3. Normalize homoglyphs
  cleaned = normalizeHomoglyphs(cleaned);

  // 4. Remove built-in injection patterns
  for (const pattern of BUILTIN_PATTERNS) {
    cleaned = cleaned.replace(
      new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'),
      ''
    );
  }

  // 5. Remove caller-supplied pattern strings
  if (patterns) {
    for (const patternStr of patterns) {
      try {
        cleaned = cleaned.replace(new RegExp(patternStr, 'gi'), '');
      } catch {
        // skip invalid patterns
      }
    }
  }

  return cleaned.trim();
}
