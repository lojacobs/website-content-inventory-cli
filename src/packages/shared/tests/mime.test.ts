import { describe, it, expect } from 'vitest';
import { isBinaryAsset, EXT_TO_MIME } from '../src/mime.js';

describe('isBinaryAsset', () => {
  it('returns isBinary=true for PDF', () => {
    const result = isBinaryAsset('https://example.com/docs/report.pdf');
    expect(result.isBinary).toBe(true);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.extension).toBe('.pdf');
  });

  it('returns isBinary=true for JPEG (both .jpg and .jpeg)', () => {
    expect(isBinaryAsset('https://example.com/img/photo.jpg')).toEqual({
      isBinary: true,
      mimeType: 'image/jpeg',
      extension: '.jpg',
    });
    expect(isBinaryAsset('https://example.com/img/photo.jpeg')).toEqual({
      isBinary: true,
      mimeType: 'image/jpeg',
      extension: '.jpeg',
    });
  });

  it('returns isBinary=true for PNG, GIF, WebP, SVG', () => {
    expect(isBinaryAsset('https://example.com/img/logo.png').isBinary).toBe(true);
    expect(isBinaryAsset('https://example.com/img/anim.gif').isBinary).toBe(true);
    expect(isBinaryAsset('https://example.com/img/pic.webp').isBinary).toBe(true);
    expect(isBinaryAsset('https://example.com/img/icon.svg').isBinary).toBe(true);
  });

  it('returns isBinary=true for video and audio', () => {
    expect(isBinaryAsset('https://example.com/media/video.mp4').isBinary).toBe(true);
    expect(isBinaryAsset('https://example.com/media/video.webm').isBinary).toBe(true);
    expect(isBinaryAsset('https://example.com/media/audio.mp3').isBinary).toBe(true);
  });

  it('returns isBinary=true for Office documents', () => {
    expect(isBinaryAsset('https://example.com/file.doc').isBinary).toBe(true);
    expect(isBinaryAsset('https://example.com/file.docx').isBinary).toBe(true);
    expect(isBinaryAsset('https://example.com/file.xls').isBinary).toBe(true);
    expect(isBinaryAsset('https://example.com/file.xlsx').isBinary).toBe(true);
    expect(isBinaryAsset('https://example.com/file.ppt').isBinary).toBe(true);
    expect(isBinaryAsset('https://example.com/file.pptx').isBinary).toBe(true);
  });

  it('returns isBinary=true for zip and csv', () => {
    expect(isBinaryAsset('https://example.com/archive.zip').isBinary).toBe(true);
    expect(isBinaryAsset('https://example.com/data.csv').isBinary).toBe(true);
  });

  it('returns isBinary=true for plain text', () => {
    expect(isBinaryAsset('https://example.com/notes.txt').isBinary).toBe(true);
  });

  it('returns isBinary=false for HTML variants', () => {
    expect(isBinaryAsset('https://example.com/page.html')).toEqual({ isBinary: false });
    expect(isBinaryAsset('https://example.com/page.htm')).toEqual({ isBinary: false });
    expect(isBinaryAsset('https://example.com/page.php')).toEqual({ isBinary: false });
    expect(isBinaryAsset('https://example.com/page.aspx')).toEqual({ isBinary: false });
  });

  it('returns isBinary=false for URLs with no extension', () => {
    expect(isBinaryAsset('https://example.com/')).toEqual({ isBinary: false });
    expect(isBinaryAsset('https://example.com/blog/post')).toEqual({ isBinary: false });
    expect(isBinaryAsset('https://example.com/blog/post/')).toEqual({ isBinary: false });
  });

  it('returns isBinary=false for unknown extensions', () => {
    expect(isBinaryAsset('https://example.com/page.xyz')).toEqual({ isBinary: false });
    expect(isBinaryAsset('https://example.com/data.json')).toEqual({ isBinary: false });
  });

  it('is case-insensitive for extensions', () => {
    expect(isBinaryAsset('https://example.com/file.PDF')).toEqual({
      isBinary: true,
      mimeType: 'application/pdf',
      extension: '.pdf',
    });
    expect(isBinaryAsset('https://example.com/file.JpG')).toEqual({
      isBinary: true,
      mimeType: 'image/jpeg',
      extension: '.jpg',
    });
  });

  it('returns isBinary=false for invalid URLs', () => {
    expect(isBinaryAsset('not-a-url')).toEqual({ isBinary: false });
  });

  it('handles query strings and fragments', () => {
    expect(isBinaryAsset('https://example.com/doc.pdf?version=2')).toEqual({
      isBinary: true,
      mimeType: 'application/pdf',
      extension: '.pdf',
    });
    expect(isBinaryAsset('https://example.com/page.html#section')).toEqual({
      isBinary: false,
    });
  });
});

describe('EXT_TO_MIME', () => {
  it('contains the expected canonical mappings', () => {
    expect(EXT_TO_MIME['.pdf']).toBe('application/pdf');
    expect(EXT_TO_MIME['.png']).toBe('image/png');
    expect(EXT_TO_MIME['.mp4']).toBe('video/mp4');
    expect(EXT_TO_MIME['.docx']).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });
});
