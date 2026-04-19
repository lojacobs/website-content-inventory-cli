import { describe, it, expect } from '@jest/globals';
import { extractMetadata, metadataToInventoryRow } from '../metadata.js';

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Test Page</title>
  <meta name="description" content="A test page description">
  <link rel="canonical" href="https://example.com/test">
  <meta name="robots" content="noindex, follow">
  <meta property="article:modified_time" content="2024-01-15T10:00:00Z">
</head>
<body>
  <h1>Test Page</h1>
  <p>Some content here.</p>
  <img src="photo.jpg" alt="Photo">
  <img src="graph.png" alt="Graph">
</body>
</html>`;

describe('extractMetadata', () => {
  const meta = extractMetadata(SAMPLE_HTML, {
    url: 'https://example.com/test',
    httpStatus: 200,
  });

  it('extracts title', () => {
    expect(meta.title).toBe('Test Page');
  });

  it('extracts description', () => {
    expect(meta.description).toBe('A test page description');
  });

  it('extracts language', () => {
    expect(meta.language).toBe('en');
  });

  it('extracts canonical URL', () => {
    expect(meta.canonical).toBe('https://example.com/test');
  });

  it('detects noindex', () => {
    expect(meta.noindex).toBe(true);
  });

  it('extracts date modified', () => {
    expect(meta.dateModified).toBe('2024-01-15T10:00:00Z');
  });

  it('counts images', () => {
    expect(meta.imageCount).toBe(2);
  });

  it('calculates URL depth', () => {
    expect(meta.urlDepth).toBe(1);
  });
});

describe('metadataToInventoryRow', () => {
  it('maps to CSV columns correctly', () => {
    const meta = extractMetadata(SAMPLE_HTML, {
      url: 'https://example.com/test',
      httpStatus: 200,
    });

    const fullMeta = { ...meta, wordCount: 42, linkedFiles: ['file.pdf'] };
    const row = metadataToInventoryRow(fullMeta, 'Short preview text of the page content.');

    expect(row['URL']).toBe('https://example.com/test');
    expect(row['Titre']).toBe('Test Page');
    expect(row['Noindex']).toBe('oui');
    expect(row['Statut_HTTP']).toBe('200');
    expect(row['Nb_mots']).toBe('42');
    expect(row['Fichiers_liés']).toBe('file.pdf');
    expect(row['Lien_Google_Doc']).toBe('');
  });
});
