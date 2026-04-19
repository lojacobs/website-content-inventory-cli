import { extractMetadata } from '../metadata.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <title>Accueil | Ville de Sainte-Anne-de-la-Rochelle</title>
  <meta name="description" content="Bienvenue sur le site officiel.">
  <link rel="canonical" href="https://standredekamouraska.ca/">
  <meta name="robots" content="index, follow">
</head>
<body>
  <h1>Bienvenue</h1>
  <p>Un deux trois quatre cinq six sept huit neuf dix.</p>
  <img src="hero.jpg" alt="Hero">
  <img src="logo.png" alt="Logo">
  <a href="document.pdf">Télécharger PDF</a>
  <a href="rapport.docx">Rapport Word</a>
  <a href="https://example.com">Lien externe</a>
</body>
</html>`;

const NOINDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Private Page</title>
  <meta name="robots" content="noindex, nofollow">
</head>
<body><p>Hidden content.</p></body>
</html>`;

const H1_FALLBACK_HTML = `<!DOCTYPE html>
<html>
<head></head>
<body>
  <h1>Fallback Title from H1</h1>
  <p>Some content here.</p>
</body>
</html>`;

const LINKED_FILES_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Files</title></head>
<body>
  <a href="report.pdf">PDF</a>
  <a href="data.xlsx">Excel</a>
  <a href="archive.zip">Zip</a>
  <a href="notes.doc">Doc</a>
  <a href="presentation.docx">Docx</a>
  <a href="/about">About</a>
  <a href="https://example.com">External</a>
</body>
</html>`;

const NO_META_HTML = `<!DOCTYPE html>
<html>
<head><title>No Meta</title></head>
<body><p>Content without metadata.</p></body>
</html>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractMetadata', () => {
  describe('title extraction', () => {
    it('extracts title from <title> tag', () => {
      const meta = extractMetadata(FULL_HTML, 'https://standredekamouraska.ca/');
      expect(meta.title).toBe('Accueil | Ville de Sainte-Anne-de-la-Rochelle');
    });

    it('falls back to first <h1> when <title> is absent', () => {
      const meta = extractMetadata(H1_FALLBACK_HTML, 'https://standredekamouraska.ca/');
      expect(meta.title).toBe('Fallback Title from H1');
    });

    it('returns empty string when neither <title> nor <h1> is present', () => {
      const html = '<html><head></head><body><p>No title here.</p></body></html>';
      const meta = extractMetadata(html, 'https://standredekamouraska.ca/');
      expect(meta.title).toBe('');
    });
  });

  describe('description extraction', () => {
    it('extracts description from <meta name="description">', () => {
      const meta = extractMetadata(FULL_HTML, 'https://standredekamouraska.ca/');
      expect(meta.description).toBe('Bienvenue sur le site officiel.');
    });

    it('returns empty string when description meta is absent', () => {
      const meta = extractMetadata(NO_META_HTML, 'https://standredekamouraska.ca/');
      expect(meta.description).toBe('');
    });
  });

  describe('language extraction', () => {
    it('extracts lang from <html lang="..."> attribute', () => {
      const meta = extractMetadata(FULL_HTML, 'https://standredekamouraska.ca/');
      expect(meta.language).toBe('fr');
    });

    it('returns empty string when lang attribute is absent', () => {
      const meta = extractMetadata(NO_META_HTML, 'https://standredekamouraska.ca/');
      expect(meta.language).toBe('');
    });
  });

  describe('canonical extraction', () => {
    it('extracts canonical from <link rel="canonical">', () => {
      const meta = extractMetadata(FULL_HTML, 'https://standredekamouraska.ca/');
      expect(meta.canonical).toBe('https://standredekamouraska.ca/');
    });

    it('returns empty string when canonical link is absent', () => {
      const meta = extractMetadata(NO_META_HTML, 'https://standredekamouraska.ca/');
      expect(meta.canonical).toBe('');
    });
  });

  describe('noindex detection', () => {
    it('detects noindex when robots meta contains "noindex"', () => {
      const meta = extractMetadata(NOINDEX_HTML, 'https://standredekamouraska.ca/private');
      expect(meta.noindex).toBe(true);
    });

    it('returns false when robots meta does not contain "noindex"', () => {
      const meta = extractMetadata(FULL_HTML, 'https://standredekamouraska.ca/');
      expect(meta.noindex).toBe(false);
    });

    it('returns false when robots meta is absent', () => {
      const meta = extractMetadata(NO_META_HTML, 'https://standredekamouraska.ca/');
      expect(meta.noindex).toBe(false);
    });
  });

  describe('imageCount', () => {
    it('counts all <img> tags', () => {
      const meta = extractMetadata(FULL_HTML, 'https://standredekamouraska.ca/');
      expect(meta.imageCount).toBe(2);
    });

    it('returns 0 when no images are present', () => {
      const meta = extractMetadata(NO_META_HTML, 'https://standredekamouraska.ca/');
      expect(meta.imageCount).toBe(0);
    });
  });

  describe('linkedFiles', () => {
    it('extracts hrefs ending in .pdf, .doc, .docx, .xls, .xlsx, .zip', () => {
      const meta = extractMetadata(LINKED_FILES_HTML, 'https://standredekamouraska.ca/files');
      expect(meta.linkedFiles).toEqual(
        expect.arrayContaining(['report.pdf', 'data.xlsx', 'archive.zip', 'notes.doc', 'presentation.docx'])
      );
      expect(meta.linkedFiles).toHaveLength(5);
    });

    it('does not include regular page hrefs', () => {
      const meta = extractMetadata(LINKED_FILES_HTML, 'https://standredekamouraska.ca/files');
      expect(meta.linkedFiles).not.toContain('/about');
      expect(meta.linkedFiles).not.toContain('https://example.com');
    });

    it('returns empty array when no linked files exist', () => {
      const meta = extractMetadata(NO_META_HTML, 'https://standredekamouraska.ca/');
      expect(meta.linkedFiles).toEqual([]);
    });
  });

  describe('wordCount', () => {
    it('counts words in text content', () => {
      const meta = extractMetadata(FULL_HTML, 'https://standredekamouraska.ca/');
      // "Bienvenue" from h1 + "Un deux trois quatre cinq six sept huit neuf dix." = 11 words
      // plus link text "Télécharger PDF", "Rapport Word", "Lien externe" = 5 words
      // Total varies with htmlToText, just verify it is > 0
      expect(meta.wordCount).toBeGreaterThan(5);
    });
  });

  describe('urlDepth', () => {
    it('returns 2 for standredekamouraska.ca/about/team', () => {
      const meta = extractMetadata(NO_META_HTML, 'https://standredekamouraska.ca/about/team');
      expect(meta.urlDepth).toBe(2);
    });

    it('returns 0 for root URL', () => {
      const meta = extractMetadata(NO_META_HTML, 'https://standredekamouraska.ca/');
      expect(meta.urlDepth).toBe(0);
    });

    it('returns 1 for single-segment path', () => {
      const meta = extractMetadata(NO_META_HTML, 'https://standredekamouraska.ca/about');
      expect(meta.urlDepth).toBe(1);
    });

    it('does not count index.html as a path segment', () => {
      const meta = extractMetadata(NO_META_HTML, 'https://standredekamouraska.ca/about/index.html');
      expect(meta.urlDepth).toBe(1);
    });
  });
});
