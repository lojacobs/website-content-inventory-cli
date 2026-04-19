import { htmlToText } from '../html-to-text.js';

describe('htmlToText', () => {
  // 1. h1 becomes UPPERCASE
  it('converts h1 to uppercase text', () => {
    const result = htmlToText('<h1>Hello World</h1>');
    expect(result).toContain('HELLO WORLD');
  });

  // 2. h2-h6 also become UPPERCASE
  it('converts h2 through h6 to uppercase text', () => {
    const result = htmlToText('<h2>Section</h2><h3>Sub</h3><h4>Sub Sub</h4>');
    expect(result).toContain('SECTION');
    expect(result).toContain('SUB');
    expect(result).toContain('SUB SUB');
  });

  // 3. img becomes [IMAGE: alt | src] marker
  it('converts img to [IMAGE: alt | src] marker', () => {
    const result = htmlToText('<img alt="A cat" src="cat.jpg" />');
    expect(result).toBe('[IMAGE: A cat | cat.jpg]');
  });

  // 4. img with no alt still produces marker
  it('converts img with no alt to [IMAGE:  | src] marker', () => {
    const result = htmlToText('<img src="photo.png" />');
    expect(result).toBe('[IMAGE:  | photo.png]');
  });

  // 5. link becomes "text (url)"
  it('converts links to text (url) format', () => {
    const result = htmlToText('<a href="https://example.com">Visit us</a>');
    expect(result).toContain('Visit us (https://example.com)');
  });

  // 6. anchor-only links are stripped (just text)
  it('strips anchor-only href links, keeping link text', () => {
    const result = htmlToText('<a href="#section-1">Jump to section</a>');
    expect(result).toContain('Jump to section');
    expect(result).not.toContain('#section-1');
    expect(result).not.toContain('(');
  });

  // 7. javascript: links are stripped
  it('strips javascript: href links, keeping link text', () => {
    const result = htmlToText('<a href="javascript:void(0)">Click</a>');
    expect(result).toContain('Click');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('(javascript');
  });

  // 8. multiple blank lines collapsed
  it('collapses multiple blank lines to at most two newlines', () => {
    const result = htmlToText('<p>First</p><p>Second</p><p>Third</p>');
    expect(result).not.toMatch(/\n{3,}/);
  });

  // 9. li elements get bullet prefix
  it('converts li elements to bullet points', () => {
    const result = htmlToText('<ul><li>Item one</li><li>Item two</li></ul>');
    expect(result).toContain('• Item one');
    expect(result).toContain('• Item two');
  });

  // 10. br becomes newline
  it('converts br to newline', () => {
    const result = htmlToText('<p>Line one<br/>Line two</p>');
    expect(result).toContain('Line one\nLine two');
  });

  // 11. paragraphs separated by double newline
  it('separates paragraphs with double newlines', () => {
    const result = htmlToText('<p>First paragraph</p><p>Second paragraph</p>');
    expect(result).toMatch(/First paragraph\n\nSecond paragraph/);
  });

  // 12. trims leading and trailing whitespace
  it('trims the result', () => {
    const result = htmlToText('  <p>Content</p>  ');
    expect(result).toBe('Content');
  });

  // 13. complex document
  it('handles a complex document with multiple element types', () => {
    const html = `
      <h1>Report Title</h1>
      <p>Introduction with a <a href="https://example.com">link</a>.</p>
      <img alt="Chart" src="chart.png" />
      <ul>
        <li>Point one</li>
        <li>Point two</li>
      </ul>
    `;
    const result = htmlToText(html);
    expect(result).toContain('REPORT TITLE');
    expect(result).toContain('link (https://example.com)');
    expect(result).toContain('[IMAGE: Chart | chart.png]');
    expect(result).toContain('• Point one');
    expect(result).toContain('• Point two');
  });
});
