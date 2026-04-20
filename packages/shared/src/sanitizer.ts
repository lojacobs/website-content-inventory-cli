/**
 * sanitizer.ts
 * Shared HTML sanitizer using Cheerio.
 * Removes navigation, ads, UI chrome, and scripts/styles.
 * Preserves content-bearing elements (main, article, p, headings, etc.).
 */

import * as cheerio from 'cheerio';
import type { Element, AnyNode } from 'domhandler';

/**
 * Tag-level selectors to remove entirely (including their children).
 * Also exported so callers can audit/extend the removal list.
 */
export const REMOVE_SELECTORS: string[] = [
  // Scripting / styling
  'script',
  'style',
  'noscript',
  // Embedded content
  'iframe',
  'svg',
  'object',
  'embed',
  // Document metadata
  'head',
  // Structural UI chrome (semantic tags)
  'nav',
  'header',
  'footer',
  'aside',
  // Form controls
  'form',
  'input',
  'button',
  'select',
  'textarea',
  // Media (non-image)
  'video',
  'audio',
  'canvas',
];

/**
 * Class / ID fragment patterns that mark an element as UI chrome.
 * Matched as whole words (hyphen/underscore/space delimited).
 */
const UI_PATTERNS: string[] = [
  'nav',
  'menu',
  'navigation',
  'navbar',
  'sidebar',
  'breadcrumb',
  'pagination',
  'btn',
  'cta',
  'footer',
  'header',
  'banner',
  'ad',
  'ads',
  'advert',
  'promo',
  'sponsored',
  'related',
  'social',
  'share',
  'cookie',
  'popup',
  'modal',
  'overlay',
  'widget',
  'comment',
];

function matchesUiPattern(classAttr: string, idAttr: string): boolean {
  const combined = `${classAttr} ${idAttr}`.toLowerCase();
  return UI_PATTERNS.some(pattern => {
    const re = new RegExp(`(?:^|[\\s_-])${pattern}(?:[\\s_-]|$)`, 'i');
    return re.test(combined);
  });
}

/**
 * Sanitize raw HTML, removing non-content elements and returning clean HTML.
 *
 * Content elements preserved: main, article, section, p, h1-h6, ul, ol, li,
 * table, blockquote, pre, code, figure, figcaption, img (src/alt only), a (href).
 *
 * @param html - Raw HTML string
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(html: string): string {
  const $ = cheerio.load(html);

  // 1. Remove tag-level elements unconditionally
  $(REMOVE_SELECTORS.join(', ')).remove();

  // 2. Remove elements whose class or id signals UI chrome
  $('*').each((_i, el) => {
    if (el.type !== 'tag') return;
    // Never remove structural root elements regardless of their class names
    const tag = (el as Element).tagName?.toLowerCase();
    if (tag === 'body' || tag === 'html') return;
    const classAttr = $(el).attr('class') ?? '';
    const idAttr = $(el).attr('id') ?? '';
    if (matchesUiPattern(classAttr, idAttr)) {
      $(el).remove();
    }
  });

  // 3. Remove HTML comments
  $('*').contents().each((_i, node) => {
    if (node.type === 'comment') {
      $(node as AnyNode).remove();
    }
  });

  // 4. Sanitize img — keep only src and alt
  $('img').each((_i, el) => {
    const src = $(el).attr('src');
    const alt = $(el).attr('alt');
    const attrs = Object.keys((el as Element & { attribs: Record<string, string> }).attribs ?? {});
    attrs.forEach(attr => $(el).removeAttr(attr));
    if (src) $(el).attr('src', src);
    if (alt !== undefined) $(el).attr('alt', alt);
  });

  // 5. Sanitize <a> — keep only href, strip JS links
  $('a').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    const attrs = Object.keys((el as Element & { attribs: Record<string, string> }).attribs ?? {});
    attrs.forEach(attr => $(el).removeAttr(attr));
    if (href && !/^\s*(javascript:|data:)/i.test(href)) {
      $(el).attr('href', href);
    }
  });

  // 6. Strip all attributes from remaining elements
  $('*').each((_i, el) => {
    if (el.type !== 'tag') return;
    const tag = (el as Element).tagName?.toLowerCase();
    if (tag === 'img' || tag === 'a') return; // already handled
    const attrs = Object.keys((el as Element & { attribs: Record<string, string> }).attribs ?? {});
    attrs.forEach(attr => $(el).removeAttr(attr));
  });

  const body = $('body');
  return body.length ? (body.html() ?? '') : $.html();
}
