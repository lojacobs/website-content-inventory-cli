/**
 * sanitizer.ts
 * HTML sanitization: strips scripts, styles, navigation, ads,
 * and UI-only elements to keep only meaningful content.
 * Spec §4-5: keep img, p, h1-h6, br, div, a, etc.;
 * remove elements with nav/menu/btn/cta CSS classes or IDs.
 */

import * as cheerio from 'cheerio';

export interface SanitizeOptions {
  /** Keep image elements (default: true) */
  keepImages?: boolean;
  /** Keep link elements (default: true) */
  keepLinks?: boolean;
}

/** CSS class/ID fragments that indicate UI-chrome, not content */
const UI_PATTERNS = [
  // Navigation
  'nav', 'menu', 'navigation', 'navbar', 'topbar', 'sidebar', 'breadcrumb', 'breadcrumbs',
  // Calls to action / buttons
  'btn', 'button', 'cta', 'call-to-action',
  // Ads / tracking
  'ad', 'ads', 'advert', 'advertisement', 'banner', 'promo', 'sponsored',
  // Footers / headers (structural chrome)
  'footer', 'header', 'masthead', 'colophon',
  // Modals / overlays
  'modal', 'overlay', 'popup', 'cookie', 'gdpr', 'consent',
  // Social sharing
  'social', 'share', 'sharing',
  // Skip-links / accessibility helpers that aren't content
  'skip-link', 'skip-nav',
  // Search UI
  'search-form', 'searchbar',
  // Pagination
  'pagination', 'pager',
];

/** Tags to strip entirely (including children) */
const STRIP_TAGS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'link',    // CSS/JS link tags in <head>
  'meta',
  'head',
  'svg',
  'canvas',
  'video',
  'audio',
  'source',
  'track',
  'template',
];

/** Tags to unwrap (keep children but remove the tag wrapper) */
const UNWRAP_TAGS = [
  'span',
  'font',
  'center',
  'small',
  'big',
  'tt',
  'u',
  's',
  'strike',
  'bdo',
];

/**
 * Sanitize raw HTML, retaining only meaningful content elements.
 * Returns cleaned HTML string ready for text extraction.
 */
export function sanitizeHtml(rawHtml: string, options: SanitizeOptions = {}): string {
  const { keepImages = true, keepLinks = true } = options;

  const $ = cheerio.load(rawHtml);

  // 1. Remove entirely unwanted tags (scripts, styles, etc.)
  $(STRIP_TAGS.join(', ')).remove();

  // 2. Remove elements whose class or id matches UI chrome patterns
  $('*').each((_i, el) => {
    if (el.type !== 'tag') return;
    // Never remove structural root elements regardless of their class names
    const tag = (el as any).tagName?.toLowerCase();
    if (tag === 'body' || tag === 'html') return;

    const classAttr = $(el).attr('class') || '';
    const idAttr = $(el).attr('id') || '';
    const combined = `${classAttr} ${idAttr}`.toLowerCase();

    // Check if any UI pattern matches
    const isUiChrome = UI_PATTERNS.some(pattern => {
      // Match whole-word or hyphenated forms
      const re = new RegExp(`(?:^|[\\s_-])${pattern}(?:[\\s_-]|$)`, 'i');
      return re.test(combined);
    });

    if (isUiChrome) {
      $(el).remove();
    }
  });

  // 3. Remove HTML comments (can carry injection payloads)
  $('*').contents().each((_i, node) => {
    if (node.type === 'comment') {
      $(node).remove();
    }
  });

  // 4. Strip images if not wanted
  if (!keepImages) {
    $('img').remove();
  } else {
    // Keep only src and alt attributes on images for safety
    $('img').each((_i, el) => {
      const src = $(el).attr('src');
      const alt = $(el).attr('alt');
      $(el).removeAttr('class').removeAttr('id').removeAttr('style');
      if (src) $(el).attr('src', src);
      if (alt) $(el).attr('alt', alt);
    });
  }

  // 5. Strip all attributes from links except href; remove JS links
  if (keepLinks) {
    $('a').each((_i, el) => {
      const href = $(el).attr('href') || '';
      // Remove javascript: links
      if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href)) {
        $(el).removeAttr('href');
      }
      $(el).removeAttr('class').removeAttr('id').removeAttr('style')
           .removeAttr('onclick').removeAttr('onmouseover');
    });
  } else {
    $('a').each((_i, el) => { $(el).replaceWith($(el).contents()); });
  }

  // 6. Strip style/on* attributes from all remaining elements
  $('*').each((_i, el) => {
    if (el.type !== 'tag') return;
    $(el).removeAttr('style').removeAttr('class').removeAttr('id');
    // Remove all event handlers
    const attrs = Object.keys((el as any).attribs || {});
    attrs.forEach(attr => {
      if (attr.startsWith('on')) $(el).removeAttr(attr);
    });
  });

  // 7. Unwrap cosmetic-only tags (keep content, drop wrapper)
  $(UNWRAP_TAGS.join(', ')).each((_i, el) => {
    $(el).replaceWith($(el).contents());
  });

  // 8. Extract the body content only
  const body = $('body');
  return body.length ? body.html() || '' : $.html();
}

/**
 * Count images remaining in sanitized HTML
 */
export function countImages(html: string): number {
  const $ = cheerio.load(html);
  return $('img').length;
}

/**
 * Extract all href links from sanitized HTML
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const absolute = new URL(href, baseUrl).toString();
      links.push(absolute);
    } catch {
      // Ignore invalid URLs
    }
  });

  return [...new Set(links)];
}
