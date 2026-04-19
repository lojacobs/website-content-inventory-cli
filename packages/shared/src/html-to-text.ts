/**
 * html-to-text.ts
 * Convert sanitized HTML to plain text using cheerio.
 * - h1-h6 → UPPERCASE text + surrounding newlines
 * - p, div, section, article → text content + double newline
 * - img → [IMAGE: {alt} | {src}]
 * - a → {link text} ({href}), stripped if href is #anchor or javascript:
 * - li → • {text}
 * - br → newline
 * - Collapses multiple blank lines to max 2
 */

import * as cheerio from 'cheerio';

/**
 * Convert HTML to plain text with structured markers.
 */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);

  function processNode(node: cheerio.AnyNode): string {
    if (node.type === 'text') {
      return (node as cheerio.Text).data ?? '';
    }

    if (node.type !== 'tag') {
      return '';
    }

    const el = node as cheerio.Element;
    const tag = el.name.toLowerCase();
    const children = el.children ?? [];

    // Images: return marker, no recursion needed
    if (tag === 'img') {
      const alt = $(el).attr('alt') ?? '';
      const src = $(el).attr('src') ?? '';
      return `[IMAGE: ${alt} | ${src}]`;
    }

    // Links: render as "text (url)" or just text if anchor/javascript
    if (tag === 'a') {
      const href = ($(el).attr('href') ?? '').trim();
      const inner = children.map(processNode).join('');
      if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) {
        return inner;
      }
      return `${inner} (${href})`;
    }

    // Line break
    if (tag === 'br') {
      return '\n';
    }

    // List items
    if (tag === 'li') {
      const inner = children.map(processNode).join('').trim();
      return `• ${inner}\n`;
    }

    // Headings
    if (/^h[1-6]$/.test(tag)) {
      const inner = children.map(processNode).join('').trim().toUpperCase();
      return `\n${inner}\n\n`;
    }

    // Block-level containers
    if (['p', 'div', 'section', 'article'].includes(tag)) {
      const inner = children.map(processNode).join('');
      const trimmed = inner.trim();
      if (!trimmed) return '';
      return `${trimmed}\n\n`;
    }

    // Default: recurse
    return children.map(processNode).join('');
  }

  const bodyChildren = $('body').contents().toArray();
  let text = bodyChildren.map(processNode).join('');

  // Collapse 3+ consecutive blank lines to at most 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
