import { urlToTxtPath, urlToDownloadDir } from '../paths.js';
import * as nodePath from 'path';

const OUT = '/output';

// ---------------------------------------------------------------------------
// urlToTxtPath
// ---------------------------------------------------------------------------

describe('urlToTxtPath', () => {
  // standredekamouraska.ca examples
  test('standredekamouraska.ca homepage (no trailing slash)', () => {
    expect(urlToTxtPath('https://standredekamouraska.ca', OUT)).toBe(
      nodePath.join(OUT, 'standredekamouraska.ca', 'index.txt')
    );
  });

  test('standredekamouraska.ca homepage (trailing slash)', () => {
    expect(urlToTxtPath('https://standredekamouraska.ca/', OUT)).toBe(
      nodePath.join(OUT, 'standredekamouraska.ca', 'index.txt')
    );
  });

  test('standredekamouraska.ca/about (no trailing slash)', () => {
    expect(urlToTxtPath('https://standredekamouraska.ca/about', OUT)).toBe(
      nodePath.join(OUT, 'standredekamouraska.ca', 'about.txt')
    );
  });

  test('standredekamouraska.ca/about/ (trailing slash)', () => {
    expect(urlToTxtPath('https://standredekamouraska.ca/about/', OUT)).toBe(
      nodePath.join(OUT, 'standredekamouraska.ca', 'about', 'index.txt')
    );
  });

  test('standredekamouraska.ca/blog/post-title (nested, no trailing slash)', () => {
    expect(urlToTxtPath('https://standredekamouraska.ca/blog/post-title', OUT)).toBe(
      nodePath.join(OUT, 'standredekamouraska.ca', 'blog', 'post-title.txt')
    );
  });

  // Generic spec examples
  test('root domain → index.txt', () => {
    expect(urlToTxtPath('https://example.com/', OUT)).toBe(
      nodePath.join(OUT, 'example.com', 'index.txt')
    );
  });

  test('trailing slash on section → index.txt inside section dir', () => {
    expect(urlToTxtPath('https://example.com/about/', OUT)).toBe(
      nodePath.join(OUT, 'example.com', 'about', 'index.txt')
    );
  });

  test('page without trailing slash → .txt extension', () => {
    expect(urlToTxtPath('https://example.com/blog/post', OUT)).toBe(
      nodePath.join(OUT, 'example.com', 'blog', 'post.txt')
    );
  });

  test('query strings are stripped', () => {
    expect(urlToTxtPath('https://example.com/search?q=hello&page=2', OUT)).toBe(
      nodePath.join(OUT, 'example.com', 'search.txt')
    );
  });

  test('query string on root is stripped', () => {
    expect(urlToTxtPath('https://example.com/?utm_source=email', OUT)).toBe(
      nodePath.join(OUT, 'example.com', 'index.txt')
    );
  });

  test('deeply nested page', () => {
    expect(urlToTxtPath('https://example.com/a/b/c/page', OUT)).toBe(
      nodePath.join(OUT, 'example.com', 'a', 'b', 'c', 'page.txt')
    );
  });
});

// ---------------------------------------------------------------------------
// urlToDownloadDir
// ---------------------------------------------------------------------------

describe('urlToDownloadDir', () => {
  test('root domain → domain dir', () => {
    expect(urlToDownloadDir('https://example.com/', OUT)).toBe(
      nodePath.join(OUT, 'example.com')
    );
  });

  test('section with trailing slash → section dir', () => {
    expect(urlToDownloadDir('https://example.com/about/', OUT)).toBe(
      nodePath.join(OUT, 'example.com', 'about')
    );
  });

  test('file-like URL (no trailing slash) → parent dir', () => {
    expect(urlToDownloadDir('https://example.com/blog/post', OUT)).toBe(
      nodePath.join(OUT, 'example.com', 'blog')
    );
  });

  test('top-level file (no trailing slash) → domain dir', () => {
    expect(urlToDownloadDir('https://example.com/about', OUT)).toBe(
      nodePath.join(OUT, 'example.com')
    );
  });

  test('standredekamouraska.ca homepage', () => {
    expect(urlToDownloadDir('https://standredekamouraska.ca/', OUT)).toBe(
      nodePath.join(OUT, 'standredekamouraska.ca')
    );
  });

  test('standredekamouraska.ca/blog/post-title', () => {
    expect(urlToDownloadDir('https://standredekamouraska.ca/blog/post-title', OUT)).toBe(
      nodePath.join(OUT, 'standredekamouraska.ca', 'blog')
    );
  });
});
