/**
 * System prompts and content-shaping helpers for ai-summarizer.
 *
 * INV-04: Resume_200_chars hard-sliced before write.
 * INV-06: Type_de_page must be one of PAGE_TYPES.
 * FR7:   Truncate page text to 2000 chars before any model call.
 */

export const PAGE_TYPES = [
  'homepage',
  'service',
  'about',
  'contact',
  'blog-post',
  'news',
  'faq',
  'landing-page',
  'resource',
  'product',
  'category',
  'legal',
  'form',
  'other',
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

const PAGE_TYPE_BULLETS = PAGE_TYPES.map((t) => `- ${t}`).join('\n');

export const CLASSIFY_SYSTEM_PROMPT = `You are a content classification expert. Given the content of a web page, classify it into exactly one of these page types:

${PAGE_TYPE_BULLETS}

Respond with ONLY the page type label, no explanation, no punctuation.`;

export const SUMMARY_SYSTEM_PROMPT = `You are a content summarizer. Given the content of a web page, write a summary in the same language as the page content. The summary must be 200 characters or fewer. It must be a complete sentence — do not output a partial sentence or a fragment with just a subject and a verb. Read only the first 2 paragraphs of the page to form your summary; ignore the rest. Be factual and neutral. Do not start with "This page" or "The page". Respond with ONLY the summary text.`;

const MAX_BODY_CHARS = 2000;

/**
 * Build the user-content prompt body. Truncates `pageText` to 2000 chars (FR7).
 */
export function buildSummaryUserContent(pageTitle: string, pageText: string): string {
  const truncated = pageText.slice(0, MAX_BODY_CHARS);
  return `Title: ${pageTitle}\n\nContent:\n${truncated}`;
}

/**
 * Hard-slice a model summary to ≤200 characters (INV-04). Trims whitespace first.
 */
export function hardSliceSummary(raw: string): string {
  return raw.trim().slice(0, 200);
}
