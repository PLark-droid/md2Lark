import { convert, convertToHtml } from '../src/converter';

// ---------------------------------------------------------------------------
// Legacy convert() API  (backward compatibility)
// ---------------------------------------------------------------------------

describe('convert', () => {
  it('should return a LarkDocument with title', () => {
    const result = convert({ markdown: '# Hello', title: 'Test' });
    expect(result.title).toBe('Test');
  });

  it('should use "Untitled" as default title', () => {
    const result = convert({ markdown: 'Hello world' });
    expect(result.title).toBe('Untitled');
  });

  it('should return content blocks', () => {
    const result = convert({ markdown: 'Some text' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].blockType).toBe('paragraph');
  });

  it('should include html property from the new pipeline', () => {
    const result = convert({ markdown: '**bold**' });
    expect(result.html).toContain('<strong>bold</strong>');
  });
});

// ---------------------------------------------------------------------------
// convertToHtml() API
// ---------------------------------------------------------------------------

describe('convertToHtml', () => {
  // -- Basic usage ----------------------------------------------------------

  it('should return html, plainText, and metadata', () => {
    const result = convertToHtml({ markdown: 'Hello' });
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('plainText');
    expect(result).toHaveProperty('metadata');
  });

  it('should convert simple paragraph', () => {
    const result = convertToHtml({ markdown: 'Hello world' });
    expect(result.html).toContain('<p>Hello world</p>');
    expect(result.plainText).toContain('Hello world');
  });

  // -- Empty input ----------------------------------------------------------

  it('should handle empty input gracefully', () => {
    const result = convertToHtml({ markdown: '' });
    expect(result.html).toBe('');
    expect(result.plainText).toBe('');
    expect(result.metadata.wordCount).toBe(0);
    expect(result.metadata.title).toBe('Untitled');
  });

  it('should handle whitespace-only input', () => {
    const result = convertToHtml({ markdown: '   \n\n   ' });
    expect(result.html).toBe('');
    expect(result.plainText).toBe('');
    expect(result.metadata.wordCount).toBe(0);
  });

  // -- Headings -------------------------------------------------------------

  it('should render headings with correct tags', () => {
    const result = convertToHtml({ markdown: '# Heading 1\n\n## Heading 2\n\n### Heading 3' });
    expect(result.html).toContain('<h1>Heading 1</h1>');
    expect(result.html).toContain('<h2>Heading 2</h2>');
    expect(result.html).toContain('<h3>Heading 3</h3>');
  });

  // -- Inline formatting ----------------------------------------------------

  it('should render bold text', () => {
    const result = convertToHtml({ markdown: 'This is **bold** text' });
    expect(result.html).toContain('<strong>bold</strong>');
  });

  it('should render italic text', () => {
    const result = convertToHtml({ markdown: 'This is *italic* text' });
    expect(result.html).toContain('<em>italic</em>');
  });

  it('should render inline code', () => {
    const result = convertToHtml({ markdown: 'Use `console.log`' });
    expect(result.html).toContain('<code>console.log</code>');
  });

  it('should render combined bold and italic', () => {
    const result = convertToHtml({ markdown: '***bold italic***' });
    expect(result.html).toContain('<strong>');
    expect(result.html).toContain('<em>');
  });

  // -- Code blocks ----------------------------------------------------------

  it('should render fenced code blocks', () => {
    const md = '```typescript\nconst x = 1;\n```';
    const result = convertToHtml({ markdown: md });
    expect(result.html).toContain('<pre><code');
    expect(result.html).toContain('const x = 1;');
    expect(result.html).toContain('language-typescript');
  });

  it('should render code blocks without language', () => {
    const md = '```\nhello\n```';
    const result = convertToHtml({ markdown: md });
    expect(result.html).toContain('<pre><code>hello</code></pre>');
  });

  // -- Lists ----------------------------------------------------------------

  it('should render unordered lists', () => {
    const md = '- Item 1\n- Item 2\n- Item 3';
    const result = convertToHtml({ markdown: md });
    expect(result.html).toContain('<ul>');
    expect(result.html).toContain('<li>Item 1</li>');
    expect(result.html).toContain('<li>Item 2</li>');
    expect(result.html).toContain('<li>Item 3</li>');
    expect(result.html).toContain('</ul>');
  });

  it('should render ordered lists', () => {
    const md = '1. First\n2. Second\n3. Third';
    const result = convertToHtml({ markdown: md });
    expect(result.html).toContain('<ol>');
    expect(result.html).toContain('<li>First</li>');
    expect(result.html).toContain('<li>Second</li>');
    expect(result.html).toContain('</ol>');
  });

  it('should render nested lists', () => {
    const md = '- Parent\n  - Child\n    - Grandchild';
    const result = convertToHtml({ markdown: md });
    expect(result.html).toContain('<ul>');
    // Should contain nested <ul> inside <li>
    const ulCount = (result.html.match(/<ul>/g) || []).length;
    expect(ulCount).toBeGreaterThanOrEqual(2);
  });

  // -- Tables ---------------------------------------------------------------

  it('should render tables with inline styles', () => {
    const md = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1 | Cell 2 |';
    const result = convertToHtml({ markdown: md });
    expect(result.html).toContain('<table');
    expect(result.html).toContain('border-collapse: collapse');
    expect(result.html).toContain('<th');
    expect(result.html).toContain('Header 1');
    expect(result.html).toContain('<td');
    expect(result.html).toContain('Cell 1');
  });

  // -- Links and images -----------------------------------------------------

  it('should render links with target="_blank"', () => {
    const md = '[Click here](https://example.com)';
    const result = convertToHtml({ markdown: md });
    expect(result.html).toContain('href="https://example.com"');
    expect(result.html).toContain('target="_blank"');
    expect(result.html).toContain('>Click here</a>');
  });

  it('should render images', () => {
    const md = '![Alt text](https://example.com/img.png)';
    const result = convertToHtml({ markdown: md });
    expect(result.html).toContain('<img');
    expect(result.html).toContain('src="https://example.com/img.png"');
    expect(result.html).toContain('alt="Alt text"');
  });

  // -- Blockquotes ----------------------------------------------------------

  it('should render blockquotes with inline styles', () => {
    const md = '> This is a quote';
    const result = convertToHtml({ markdown: md });
    expect(result.html).toContain('<blockquote');
    expect(result.html).toContain('border-left');
    expect(result.html).toContain('This is a quote');
  });

  // -- Horizontal rules -----------------------------------------------------

  it('should render horizontal rules', () => {
    const md = 'Before\n\n---\n\nAfter';
    const result = convertToHtml({ markdown: md });
    expect(result.html).toContain('<hr');
  });

  // -- Complex mixed markdown -----------------------------------------------

  it('should handle complex mixed markdown (like Claude output)', () => {
    const md = [
      '# Analysis Results',
      '',
      'Here are the findings:',
      '',
      '## Code Quality',
      '',
      'The code is **well-structured** with *proper* typing.',
      '',
      '```typescript',
      'function greet(name: string): string {',
      '  return `Hello, ${name}!`;',
      '}',
      '```',
      '',
      '### Issues Found',
      '',
      '1. Missing error handling',
      '2. No unit tests',
      '3. Unused imports',
      '',
      '| Severity | Count |',
      '|----------|-------|',
      '| High     | 2     |',
      '| Low      | 5     |',
      '',
      '> Note: These findings are auto-generated.',
      '',
      'See [documentation](https://docs.example.com) for more details.',
    ].join('\n');

    const result = convertToHtml({ markdown: md });

    // Verify various elements are present
    expect(result.html).toContain('<h1>Analysis Results</h1>');
    expect(result.html).toContain('<h2>Code Quality</h2>');
    expect(result.html).toContain('<strong>well-structured</strong>');
    expect(result.html).toContain('<em>proper</em>');
    expect(result.html).toContain('<pre><code');
    expect(result.html).toContain('language-typescript');
    expect(result.html).toContain('<ol>');
    expect(result.html).toContain('<table');
    expect(result.html).toContain('<blockquote');
    expect(result.html).toContain('href="https://docs.example.com"');

    // Verify metadata
    expect(result.metadata.hasCodeBlocks).toBe(true);
    expect(result.metadata.languages).toContain('typescript');
    expect(result.metadata.hasTables).toBe(true);
    expect(result.metadata.wordCount).toBeGreaterThan(0);
  });

  // -- Japanese text --------------------------------------------------------

  it('should handle Japanese text correctly', () => {
    const md = '# 日本語テスト\n\nこれは日本語のテストです。**太字**と*斜体*を含みます。';
    const result = convertToHtml({ markdown: md });
    expect(result.html).toContain('<h1>日本語テスト</h1>');
    expect(result.html).toContain('<strong>太字</strong>');
    expect(result.html).toContain('<em>斜体</em>');
    expect(result.plainText).toContain('日本語テスト');
    expect(result.metadata.wordCount).toBeGreaterThan(0);
  });

  // -- Metadata correctness ------------------------------------------------

  describe('metadata', () => {
    it('should use provided title over extracted heading', () => {
      const result = convertToHtml({
        markdown: '# Heading Title',
        title: 'Custom Title',
      });
      expect(result.metadata.title).toBe('Custom Title');
    });

    it('should extract title from first heading when no title provided', () => {
      const result = convertToHtml({ markdown: '# My Document\n\nSome text' });
      expect(result.metadata.title).toBe('My Document');
    });

    it('should use "Untitled" when no title and no heading', () => {
      const result = convertToHtml({ markdown: 'Just plain text' });
      expect(result.metadata.title).toBe('Untitled');
    });

    it('should report correct wordCount', () => {
      const result = convertToHtml({ markdown: 'one two three four five' });
      expect(result.metadata.wordCount).toBe(5);
    });

    it('should detect code blocks and languages', () => {
      const md = '```python\nprint("hello")\n```\n\n```javascript\nconsole.log("hi")\n```';
      const result = convertToHtml({ markdown: md });
      expect(result.metadata.hasCodeBlocks).toBe(true);
      expect(result.metadata.languages).toContain('python');
      expect(result.metadata.languages).toContain('javascript');
    });

    it('should detect tables', () => {
      const md = '| A | B |\n|---|---|\n| 1 | 2 |';
      const result = convertToHtml({ markdown: md });
      expect(result.metadata.hasTables).toBe(true);
    });

    it('should detect images', () => {
      const md = '![photo](https://example.com/photo.jpg)';
      const result = convertToHtml({ markdown: md });
      expect(result.metadata.hasImages).toBe(true);
    });

    it('should report no code blocks when none exist', () => {
      const result = convertToHtml({ markdown: 'No code here' });
      expect(result.metadata.hasCodeBlocks).toBe(false);
      expect(result.metadata.languages).toEqual([]);
    });

    it('should report no tables when none exist', () => {
      const result = convertToHtml({ markdown: 'No tables here' });
      expect(result.metadata.hasTables).toBe(false);
    });

    it('should report no images when none exist', () => {
      const result = convertToHtml({ markdown: 'No images here' });
      expect(result.metadata.hasImages).toBe(false);
    });
  });

  // -- HTML sanitization ----------------------------------------------------

  describe('sanitization', () => {
    it('should strip script tags', () => {
      const md = 'Hello <script>alert("xss")</script> world';
      const result = convertToHtml({ markdown: md });
      expect(result.html).not.toContain('<script');
      expect(result.html).not.toContain('alert');
    });

    it('should strip inline event handlers', () => {
      const md = '<div onclick="alert(1)">click me</div>';
      const result = convertToHtml({ markdown: md });
      expect(result.html).not.toContain('onclick');
    });

    it('should strip javascript: URLs', () => {
      const md = '[click](javascript:alert(1))';
      const result = convertToHtml({ markdown: md });
      expect(result.html).not.toMatch(/javascript\s*:/i);
    });
  });

  // -- Plain text generation ------------------------------------------------

  describe('plainText', () => {
    it('should strip HTML tags from plain text output', () => {
      const result = convertToHtml({ markdown: '# Hello\n\n**bold** and *italic*' });
      expect(result.plainText).not.toContain('<');
      expect(result.plainText).not.toContain('>');
      expect(result.plainText).toContain('Hello');
      expect(result.plainText).toContain('bold');
      expect(result.plainText).toContain('italic');
    });

    it('should produce readable plain text from complex markdown', () => {
      const md = '## Title\n\n- Item 1\n- Item 2\n\nA paragraph.';
      const result = convertToHtml({ markdown: md });
      expect(result.plainText).toContain('Title');
      expect(result.plainText).toContain('Item 1');
      expect(result.plainText).toContain('Item 2');
      expect(result.plainText).toContain('A paragraph.');
    });

    it('should decode HTML entities in plain text', () => {
      const result = convertToHtml({ markdown: 'A & B < C > D "E" \'F\'' });
      // The plain text should have decoded entities
      expect(result.plainText).toContain('&');
    });

    it('should decode hex HTML entities in plain text', () => {
      // &#x2665; is the hex entity for a heart symbol.
      // Inside backtick code, marked will preserve the raw entity in the HTML,
      // so stripHtmlTags must decode &#x...; to produce the actual character.
      const md = '`&#x2665;`';
      const result = convertToHtml({ markdown: md });
      expect(result.plainText).toContain('\u2665');
    });
  });

  // -- Strikethrough (GFM) --------------------------------------------------

  it('should render strikethrough text', () => {
    const result = convertToHtml({ markdown: '~~deleted~~' });
    expect(result.html).toContain('<del>deleted</del>');
  });

  // -- Task lists (GFM) ----------------------------------------------------

  it('should render task list items', () => {
    const md = '- [x] Done\n- [ ] Todo';
    const result = convertToHtml({ markdown: md });
    // The preprocessor converts checkboxes to emoji before the renderer sees them
    expect(result.html).toContain('\u2705');
    expect(result.html).toContain('\u2B1C');
  });

  // -- Security boundary tests (#47) ----------------------------------------

  describe('security', () => {
    it('should sanitize XSS in html output', () => {
      const result = convertToHtml({ markdown: '<img src=x onerror=alert(1)>' });
      expect(result.html).not.toContain('onerror');
    });

    it('should not contain script tags in html output', () => {
      const result = convertToHtml({ markdown: '<script>alert(1)</script>' });
      expect(result.html).not.toContain('<script');
    });

    it('legacy convert() should not expose raw markdown in body', () => {
      const result = convert({ markdown: '<script>alert(1)</script>' });
      expect(result.content[0].body.text).not.toContain('<script');
    });
  });
});
