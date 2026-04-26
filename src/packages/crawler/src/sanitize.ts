import * as cheerio from 'cheerio';

/**
 * Keywords to match against element class and id attributes.
 * Elements with class/id containing any of these keywords are removed.
 */
const REMOVAL_KEYWORDS = [
  'nav',
  'menu',
  'btn',
  'button',
  'cta',
  'footer',
  'header',
  'sidebar',
  'breadcrumb',
  'pagination',
  'cookie',
  'banner',
  'popup',
  'modal',
  'overlay',
  'skip-link',
  'toolbar',
];

/**
 * Tags that are removed entirely along with their content.
 */
const REMOVE_TAGS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'header',
  'footer',
  'nav',
  'aside',
];

/**
 * Sanitize HTML by removing potentially unwanted elements.
 *
 * Removes:
 * - Entirely removes: script, style, noscript, iframe, header, footer, nav, aside
 * - Removes elements whose class or id contains any of:
 *   nav, menu, btn, button, cta, footer, header, sidebar, breadcrumb,
 *   pagination, cookie, banner, popup, modal, overlay, skip-link, toolbar
 *
 * @param html - Raw HTML string to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(html: string): string {
  const $ = cheerio.load(html);

  // Remove tags that should be stripped entirely
  for (const tag of REMOVE_TAGS) {
    $(tag).remove();
  }

  // Remove elements whose class or id contains any of the removal keywords
  // We iterate until no more matches are found to handle nested elements
  let changed = true;
  while (changed) {
    changed = false;
    for (const keyword of REMOVAL_KEYWORDS) {
      // Match case-insensitively using regex
      // Exclude structural container tags to prevent entire page content removal
      // (e.g., <body class="x-navbar-fixed-top-active"> would match "nav" in "navbar")
      const selector = `:not(body):not(html):not(main)[class*="${keyword}" i], :not(body):not(html):not(main)[id*="${keyword}" i]`;
      const elements = $(selector);
      if (elements.length > 0) {
        elements.remove();
        changed = true;
      }
    }
  }

  return $.html();
}
