// src/patterns.js
import unidecode from 'unidecode';

export const INJECTION_PATTERNS = [
  // Original patterns - ignore instructions
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)\s+/i,
  /forget\s+(?:everything|all\s+(?:previous|prior|above))/i,
  
  // Override/role change
  /you\s+are\s+now\s+(?:a\s+)?(?:different|new|an?\s)/i,
  /override\s+(?:(?:all|previous)\s+)?instructions?/i,
  /new\s+(?:primary\s+)?instructions?\s*:/i,
  /act\s+as\s+if\s+you\s+(?:have\s+no|are\s+not)/i,
  
  // System prompts
  /\bSYSTEM\s*:/,
  /\[INST\]/,
  /\[\/INST\]/,
  
  // Chat format: Claude/Immessage
  /<\|im_start\|>/,
  /<\|im_end\|>/,
  
  // Chat format: Llama 3 / Qwen / ChatML variants
  /<\|(?:user|assistant|system|end_turn|pad)\|>/i,
  
  // Chat format: SysPrompt (<<SYS>>)
  /<<(?:SYS|sys)>>/i,
  
  // Chat format: Raw Hidden
  /\[TOOL_CALLS\]/i,
  /\[(?:Human|Assistant|System)\]/i,
  
  // Jailbreak terms
  /###\s*(?:Human|Assistant|System)\s*:/i,
  /\bDAN\b/,
  /\bjailbreak\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bbypass\s+(?:safety|ethic)/i,
  /\bignore\s+(?:all\s+)?(?:your\s+)?rules/i,
  /\bforget\s+(?:your\s+)?(?:programming|instructions|rules)/i,
];

// Expanded invisible character coverage - includes more Unicode formatting characters
export const INVISIBLE_CHARS_RE = /[\u200B\u200C\u200D\u200E\u200F\u00AD\uFEFF\u2028\u2029\u061C\u180E\u2061\u2062\u2063\u2064]/g;

// Additional Unicode ranges for homoglyph detection (Latin Extended, Cyrillic, Greek)
// These are not removed but normalized via unidecode
export const HOMOGLYPH_RANGES = {
  cyrillic: /[\u0400-\u04FF]/g,
  greek: /[\u0370-\u03FF\u1F00-\u1FFF]/g,
  latinExtA: /[\u0100-\u017F]/g,
  latinExtB: /[\u0180-\u024F]/g,
};

/**
 * Normalize text by converting Unicode characters to ASCII equivalents
 * This handles homoglyph attacks where Cyrillic/Greek letters look like Latin
 */
export function normalizeToAscii(text) {
  // First remove invisible formatting characters
  let normalized = text.replace(INVISIBLE_CHARS_RE, '');
  // Then use unidecode to transliterate Unicode to ASCII
  normalized = unidecode(normalized);
  return normalized;
}

/**
 * Check if text contains homoglyphs (characters that look like Latin but aren't)
 */
export function containsHomoglyphs(text) {
  return HOMOGLYPH_RANGES.cyrillic.test(text) || 
         HOMOGLYPH_RANGES.greek.test(text) ||
         HOMOGLYPH_RANGES.latinExtA.test(text) ||
         HOMOGLYPH_RANGES.latinExtB.test(text);
}