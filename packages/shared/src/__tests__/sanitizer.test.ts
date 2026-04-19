import { sanitizeHtml, REMOVE_SELECTORS } from '../sanitizer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function containsTag(html: string, tag: string): boolean {
  return new RegExp(`<${tag}[\\s>]`, 'i').test(html);
}

function containsText(html: string, text: string): boolean {
  return html.includes(text);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sanitizeHtml', () => {
  // 1. Scripts are removed
  test('removes <script> tags and their content', () => {
    const input = '<html><body><p>Hello</p><script>alert("xss")</script></body></html>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert("xss")');
    expect(containsText(result, 'Hello')).toBe(true);
  });

  // 2. Styles are removed
  test('removes <style> tags and their content', () => {
    const input = '<html><body><style>body { color: red; }</style><p>Content</p></body></html>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<style');
    expect(result).not.toContain('color: red');
    expect(containsText(result, 'Content')).toBe(true);
  });

  // 3. <nav> tag removed
  test('removes <nav> elements by tag', () => {
    const input = '<html><body><nav><a href="/">Home</a></nav><main><p>Article</p></main></body></html>';
    const result = sanitizeHtml(input);
    expect(containsTag(result, 'nav')).toBe(false);
    expect(containsText(result, 'Article')).toBe(true);
  });

  // 4. <header> and <footer> removed by tag
  test('removes <header> and <footer> elements by tag', () => {
    const input = '<html><body><header>Site Title</header><article><p>Body</p></article><footer>Copyright</footer></body></html>';
    const result = sanitizeHtml(input);
    expect(containsTag(result, 'header')).toBe(false);
    expect(containsTag(result, 'footer')).toBe(false);
    expect(containsText(result, 'Body')).toBe(true);
  });

  // 5. Elements with class "nav" removed
  test('removes elements with class matching "nav" pattern', () => {
    const input = '<html><body><div class="nav">Navigation</div><p>Main content</p></body></html>';
    const result = sanitizeHtml(input);
    expect(containsText(result, 'Navigation')).toBe(false);
    expect(containsText(result, 'Main content')).toBe(true);
  });

  // 6. Elements with class "sidebar" removed
  test('removes elements with class matching "sidebar" pattern', () => {
    const input = '<html><body><aside class="sidebar"><p>Sidebar stuff</p></aside><article><p>Real content</p></article></body></html>';
    const result = sanitizeHtml(input);
    expect(containsText(result, 'Sidebar stuff')).toBe(false);
    expect(containsText(result, 'Real content')).toBe(true);
  });

  // 7. Elements with class "menu-item" removed (hyphenated)
  test('removes elements with hyphenated menu class', () => {
    const input = '<html><body><ul class="menu-item"><li>Item</li></ul><p>Article content</p></body></html>';
    const result = sanitizeHtml(input);
    expect(containsText(result, 'Item')).toBe(false);
    expect(containsText(result, 'Article content')).toBe(true);
  });

  // 8. Content in <main> and <article> is preserved
  test('preserves content within <main> and <article>', () => {
    const input = `
      <html><body>
        <main>
          <article>
            <h1>Title</h1>
            <p>First paragraph.</p>
            <ul><li>List item</li></ul>
          </article>
        </main>
      </body></html>
    `;
    const result = sanitizeHtml(input);
    expect(containsText(result, 'Title')).toBe(true);
    expect(containsText(result, 'First paragraph.')).toBe(true);
    expect(containsText(result, 'List item')).toBe(true);
  });

  // 9. Images keep src and alt only
  test('preserves img src and alt, strips other attributes', () => {
    const input = '<html><body><img src="/img.png" alt="desc" class="hero-image" style="width:100%"/></body></html>';
    const result = sanitizeHtml(input);
    expect(result).toContain('src="/img.png"');
    expect(result).toContain('alt="desc"');
    expect(result).not.toContain('class=');
    expect(result).not.toContain('style=');
  });

  // 10. Ads/modal/cookie elements removed by class
  test('removes elements with ad, modal, and cookie class patterns', () => {
    const input = `
      <html><body>
        <div class="ad-banner">Buy now!</div>
        <div class="modal">Subscribe</div>
        <div class="cookie-notice">We use cookies</div>
        <p>Good content</p>
      </body></html>
    `;
    const result = sanitizeHtml(input);
    expect(containsText(result, 'Buy now!')).toBe(false);
    expect(containsText(result, 'Subscribe')).toBe(false);
    expect(containsText(result, 'We use cookies')).toBe(false);
    expect(containsText(result, 'Good content')).toBe(true);
  });

  // 11. ID matching UI pattern
  test('removes elements whose id matches a UI pattern', () => {
    const input = '<html><body><div id="sidebar-left">Sidebar</div><p>Content</p></body></html>';
    const result = sanitizeHtml(input);
    expect(containsText(result, 'Sidebar')).toBe(false);
    expect(containsText(result, 'Content')).toBe(true);
  });

  // 12. noscript and iframe removed
  test('removes noscript and iframe elements', () => {
    const input = '<html><body><noscript>Enable JS</noscript><iframe src="x.html"></iframe><p>Text</p></body></html>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('Enable JS');
    expect(containsTag(result, 'iframe')).toBe(false);
    expect(containsText(result, 'Text')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// REMOVE_SELECTORS export
// ---------------------------------------------------------------------------

describe('REMOVE_SELECTORS', () => {
  test('is a non-empty array of strings', () => {
    expect(Array.isArray(REMOVE_SELECTORS)).toBe(true);
    expect(REMOVE_SELECTORS.length).toBeGreaterThan(0);
    REMOVE_SELECTORS.forEach(s => expect(typeof s).toBe('string'));
  });

  test('includes core removal tags', () => {
    expect(REMOVE_SELECTORS).toContain('script');
    expect(REMOVE_SELECTORS).toContain('style');
    expect(REMOVE_SELECTORS).toContain('nav');
    expect(REMOVE_SELECTORS).toContain('header');
    expect(REMOVE_SELECTORS).toContain('footer');
    expect(REMOVE_SELECTORS).toContain('iframe');
    expect(REMOVE_SELECTORS).toContain('svg');
    expect(REMOVE_SELECTORS).toContain('head');
  });
});
