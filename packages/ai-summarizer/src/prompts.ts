export const PAGE_TYPE_SYSTEM_PROMPT =
  "You are a web page classifier. Classify the given page content into exactly one of the following types and respond with ONLY the label, nothing else:\n" +
  "homepage, about, blog-post, news, product, service, pricing, contact, faq, documentation, landing-page, legal, portfolio, other";

export const SUMMARY_SYSTEM_PROMPT =
  "You are a concise content summarizer. Write a summary of the given page content in at most 200 characters. " +
  "Respond in the same language as the page content. Output only the summary text with no additional commentary.";

function truncateToWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
}

export function buildSummaryUserContent(pageText: string): string {
  return truncateToWordBoundary(pageText.trim(), 2000);
}

export function buildPageTypeUserContent(pageText: string): string {
  return truncateToWordBoundary(pageText.trim(), 2000);
}
