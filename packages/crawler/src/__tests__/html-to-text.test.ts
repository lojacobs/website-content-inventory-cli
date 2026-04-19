import { describe, it, expect } from '@jest/globals';
import { htmlToText, countWords } from '../html-to-text.js';

describe('htmlToText', () => {
  it('converts basic HTML to plain text', () => {
    const html = '<p>Hello <strong>world</strong>!</p>';
    const text = htmlToText(html);
    expect(text).toContain('Hello world!');
    expect(text).not.toContain('<');
  });

  it('preserves heading text without markdown markers', () => {
    const html = '<h1>Page Title</h1><p>Content here.</p>';
    const text = htmlToText(html);
    expect(text).toContain('Page Title');
    expect(text).toContain('Content here.');
    expect(text).not.toContain('#');
  });

  it('strips link URLs by default', () => {
    const html = '<p>Visit <a href="https://example.com">example</a>.</p>';
    const text = htmlToText(html, { keepLinks: false });
    expect(text).not.toContain('https://');
    expect(text).toContain('example');
  });

  it('keeps image alt text by default', () => {
    const html = '<img src="photo.jpg" alt="A sunset photo">';
    const text = htmlToText(html, { keepImageAlt: true });
    expect(text).toContain('A sunset photo');
  });

  it('removes image alt text when disabled', () => {
    const html = '<img src="photo.jpg" alt="A sunset photo">';
    const text = htmlToText(html, { keepImageAlt: false });
    expect(text).not.toContain('A sunset photo');
  });

  it('normalizes multiple blank lines to at most two', () => {
    const html = '<p>Para 1</p><p>Para 2</p><p>Para 3</p>';
    const text = htmlToText(html);
    expect(text).not.toMatch(/\n{3,}/);
  });
});

describe('countWords', () => {
  it('counts words correctly', () => {
    expect(countWords('Hello world foo bar')).toBe(4);
  });

  it('handles empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('handles multiple spaces', () => {
    expect(countWords('  word1   word2  ')).toBe(2);
  });
});
