/**
 * prompt-injection-filter.ts
 * Remove and detect prompt injection patterns from text content.
 * Spec §6: remove human-readable and encoded injection patterns.
 *
 * Patterns derived from docs/inspirations/prompt-injection-patterns.js
 * and extended with additional coverage.
 *
 * The policy is configurable via a prompt-injection.conf file.
 */

import fs from 'fs/promises';

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

/** Patterns that indicate prompt injection attempts */
const INJECTION_PATTERNS: RegExp[] = [
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

/** Invisible Unicode characters used in steganographic injection */
const INVISIBLE_CHARS_RE =
  /[\u200B\u200C\u200D\u200E\u200F\u00AD\uFEFF\u2028\u2029\u061C\u180E\u2061\u2062\u2063\u2064]/g;

/** Null bytes and other control characters (except normal whitespace) */
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FilterResult {
  /** Cleaned text with injections removed */
  text: string;
  /** Whether any injection patterns were found */
  hasInjections: boolean;
  /** List of pattern descriptions that matched */
  detectedPatterns: string[];
}

export interface FilterOptions {
  /** Path to a custom prompt-injection.conf file with additional regex patterns (one per line) */
  configPath?: string;
  /** Replace matched injections with this string (default: '') */
  replacement?: string;
}

/**
 * Load additional patterns from a config file.
 * Config format: one regex pattern per line, lines starting with # are comments.
 */
export async function loadPatternConfig(configPath: string): Promise<RegExp[]> {
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const patterns: RegExp[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      try {
        patterns.push(new RegExp(trimmed, 'i'));
      } catch {
        console.warn(`[prompt-injection-filter] Invalid pattern in config: ${trimmed}`);
      }
    }

    return patterns;
  } catch {
    return [];
  }
}

/**
 * Filter prompt injection patterns from text.
 * Normalizes invisible chars, control chars, and matches known injection vocabulary.
 */
export async function filterPromptInjections(
  text: string,
  options: FilterOptions = {}
): Promise<FilterResult> {
  const { configPath, replacement = '' } = options;

  let cleaned = text;
  const detected: string[] = [];

  // 1. Remove invisible Unicode characters (steganographic injection)
  if (INVISIBLE_CHARS_RE.test(cleaned)) {
    detected.push('invisible-unicode-chars');
    cleaned = cleaned.replace(INVISIBLE_CHARS_RE, '');
  }

  // 2. Remove control characters
  if (CONTROL_CHARS_RE.test(cleaned)) {
    detected.push('control-chars');
    cleaned = cleaned.replace(CONTROL_CHARS_RE, '');
  }

  // 3. Load custom patterns if config provided
  const customPatterns = configPath ? await loadPatternConfig(configPath) : [];
  const allPatterns = [...INJECTION_PATTERNS, ...customPatterns];

  // 4. Test and remove each pattern
  for (const pattern of allPatterns) {
    if (pattern.test(cleaned)) {
      detected.push(pattern.source);
      // Replace with blank or custom replacement, preserving surrounding whitespace
      cleaned = cleaned.replace(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g')), replacement);
    }
  }

  return {
    text: cleaned.trim(),
    hasInjections: detected.length > 0,
    detectedPatterns: detected,
  };
}

/**
 * Synchronous fast-path filter (no config file, no async).
 * Suitable for use in tight loops where async overhead matters.
 */
export function filterPromptInjectionsSync(text: string, replacement = ''): FilterResult {
  let cleaned = text;
  const detected: string[] = [];

  if (INVISIBLE_CHARS_RE.test(cleaned)) {
    detected.push('invisible-unicode-chars');
    cleaned = cleaned.replace(INVISIBLE_CHARS_RE, '');
  }

  if (CONTROL_CHARS_RE.test(cleaned)) {
    detected.push('control-chars');
    cleaned = cleaned.replace(CONTROL_CHARS_RE, '');
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) {
      detected.push(pattern.source);
      cleaned = cleaned.replace(new RegExp(pattern.source, 'gi'), replacement);
    }
  }

  return {
    text: cleaned.trim(),
    hasInjections: detected.length > 0,
    detectedPatterns: detected,
  };
}
