import { describe, it, expect } from 'vitest';
import {
  PAGE_TYPES,
  CLASSIFY_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserContent,
  hardSliceSummary,
} from '../src/prompts.js';

describe('PAGE_TYPES', () => {
  it('contains exactly the 14 spec labels', () => {
    expect(PAGE_TYPES).toEqual([
      'homepage', 'service', 'about', 'contact', 'blog-post',
      'news', 'faq', 'landing-page', 'resource', 'product',
      'category', 'legal', 'form', 'other',
    ]);
  });
});

describe('CLASSIFY_SYSTEM_PROMPT / SUMMARY_SYSTEM_PROMPT', () => {
  it('classify prompt enumerates every label', () => {
    for (const label of PAGE_TYPES) {
      expect(CLASSIFY_SYSTEM_PROMPT).toContain(label);
    }
  });

  it('summary prompt requires 200-character cap and same-language', () => {
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/200 char/i);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/same language/i);
  });
});

describe('buildSummaryUserContent', () => {
  it('truncates body to 2000 chars before composing the prompt', () => {
    const long = 'a'.repeat(5000);
    const out = buildSummaryUserContent('Title', long);
    // Title + framing add ~30 chars; total must be <= 2000 + framing budget
    expect(out.length).toBeLessThanOrEqual(2000 + 64);
  });

  it('keeps ≤2000-char body intact and includes the title', () => {
    const out = buildSummaryUserContent('My Page', 'short body');
    expect(out).toContain('My Page');
    expect(out).toContain('short body');
  });
});

describe('hardSliceSummary', () => {
  it('passes through ≤200-char strings unchanged', () => {
    expect(hardSliceSummary('a'.repeat(200))).toHaveLength(200);
    expect(hardSliceSummary('hello')).toBe('hello');
  });

  it('hard-slices >200-char strings to exactly 200', () => {
    expect(hardSliceSummary('a'.repeat(500))).toHaveLength(200);
  });

  it('trims whitespace before slicing', () => {
    expect(hardSliceSummary('  hi  ')).toBe('hi');
  });
});
