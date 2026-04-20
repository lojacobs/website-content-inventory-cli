/**
 * html-to-text.ts
 * Convert sanitized HTML to clean plain text.
 * Uses turndown for Markdown-like conversion then strips Markdown syntax
 * to produce clean prose text for inventory and AI summarization.
 */

import TurndownService from 'turndown';

export interface HtmlToTextOptions {
  /** Keep link URLs in output (default: false) */
  keepLinks?: boolean;
  /** Keep image alt text (default: true) */
  keepImageAlt?: boolean;
  /** Heading style: 'atx' (#) or 'setext' (underline) — default 'atx' */
  headingStyle?: 'atx' | 'setext';
  /** Preserve line breaks (default: false) */
  preserveLineBreaks?: boolean;
}

/**
 * Convert HTML to clean plain text.
 * Strips all markup but preserves logical structure (paragraphs, headings).
 */
export function htmlToText(html: string, options: HtmlToTextOptions = {}): string {
  const {
    keepLinks = false,
    keepImageAlt = true,
    headingStyle = 'atx',
    preserveLineBreaks = false,
  } = options;

  const td = new TurndownService({
    headingStyle,
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    br: preserveLineBreaks ? '\n' : ' ',
  });

  // Handle images: keep alt text or remove entirely
  td.addRule('images', {
    filter: 'img',
    replacement: (_content, node) => {
      if (!keepImageAlt) return '';
      const img = node as any;
      const alt = img.getAttribute ? img.getAttribute('alt') : '';
      return alt ? `[Image: ${alt}]` : '';
    },
  });

  // Discard links if not keeping them (just keep link text)
  if (!keepLinks) {
    td.addRule('links', {
      filter: 'a',
      replacement: (content) => content,
    });
  }

  // Convert to markdown-ish text
  let text = td.turndown(html);

  // Post-process: normalize whitespace
  text = text
    // Collapse 3+ blank lines into 2
    .replace(/\n{3,}/g, '\n\n')
    // Remove markdown heading markers if we want pure text
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic markers
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove code fence markers
    .replace(/^```\w*\n?/gm, '')
    // Remove list markers
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // Trim lines
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();

  return text;
}

/**
 * Count words in plain text
 */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0).length;
}
