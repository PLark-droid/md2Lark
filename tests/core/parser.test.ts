import { parseMarkdown } from '../../src/core/parser';
import type { Tokens } from 'marked';

describe('parseMarkdown', () => {
  // ---------------------------------------------------------------------------
  // Edge cases: empty / whitespace / falsy inputs
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should return empty result for an empty string', () => {
      const result = parseMarkdown('');
      expect(result.tokens).toEqual([]);
      expect(result.metadata).toEqual({
        hasCodeBlocks: false,
        languages: [],
        hasTables: false,
        hasImages: false,
      });
    });

    it('should return empty result for whitespace-only input', () => {
      const result = parseMarkdown('   \n\n  \t  ');
      expect(result.tokens).toEqual([]);
      expect(result.metadata.hasCodeBlocks).toBe(false);
    });

    it('should handle null-ish input gracefully', () => {
      // TypeScript would flag this, but at runtime someone might pass null
      const result = parseMarkdown(null as unknown as string);
      expect(result.tokens).toEqual([]);
      expect(result.metadata.hasCodeBlocks).toBe(false);
    });

    it('should handle undefined input gracefully', () => {
      const result = parseMarkdown(undefined as unknown as string);
      expect(result.tokens).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Headings
  // ---------------------------------------------------------------------------

  describe('headings', () => {
    it.each([1, 2, 3, 4, 5, 6])('should parse h%i heading', (level) => {
      const prefix = '#'.repeat(level);
      const result = parseMarkdown(`${prefix} Heading ${level}`);
      const heading = result.tokens.find((t): t is Tokens.Heading => t.type === 'heading');
      expect(heading).toBeDefined();
      expect(heading!.depth).toBe(level);
      expect(heading!.text).toBe(`Heading ${level}`);
    });

    it('should parse multiple headings', () => {
      const md = '# First\n\n## Second\n\n### Third';
      const result = parseMarkdown(md);
      const headings = result.tokens.filter((t): t is Tokens.Heading => t.type === 'heading');
      expect(headings).toHaveLength(3);
      expect(headings.map((h) => h.depth)).toEqual([1, 2, 3]);
    });
  });

  // ---------------------------------------------------------------------------
  // Paragraphs with inline formatting
  // ---------------------------------------------------------------------------

  describe('paragraphs and inline formatting', () => {
    it('should parse a plain paragraph', () => {
      const result = parseMarkdown('Hello world');
      const para = result.tokens.find((t): t is Tokens.Paragraph => t.type === 'paragraph');
      expect(para).toBeDefined();
      expect(para!.text).toBe('Hello world');
    });

    it('should parse bold text within a paragraph', () => {
      const result = parseMarkdown('This is **bold** text');
      const para = result.tokens.find((t): t is Tokens.Paragraph => t.type === 'paragraph');
      expect(para).toBeDefined();
      const strong = para!.tokens.find((t): t is Tokens.Strong => t.type === 'strong');
      expect(strong).toBeDefined();
      expect(strong!.text).toBe('bold');
    });

    it('should parse italic text within a paragraph', () => {
      const result = parseMarkdown('This is *italic* text');
      const para = result.tokens.find((t): t is Tokens.Paragraph => t.type === 'paragraph');
      expect(para).toBeDefined();
      const em = para!.tokens.find((t): t is Tokens.Em => t.type === 'em');
      expect(em).toBeDefined();
      expect(em!.text).toBe('italic');
    });

    it('should parse inline code within a paragraph', () => {
      const result = parseMarkdown('Use `console.log()` for debugging');
      const para = result.tokens.find((t): t is Tokens.Paragraph => t.type === 'paragraph');
      expect(para).toBeDefined();
      const codespan = para!.tokens.find((t): t is Tokens.Codespan => t.type === 'codespan');
      expect(codespan).toBeDefined();
      expect(codespan!.text).toBe('console.log()');
    });
  });

  // ---------------------------------------------------------------------------
  // Lists
  // ---------------------------------------------------------------------------

  describe('lists', () => {
    it('should parse an unordered list', () => {
      const md = '- Item 1\n- Item 2\n- Item 3';
      const result = parseMarkdown(md);
      const list = result.tokens.find((t): t is Tokens.List => t.type === 'list');
      expect(list).toBeDefined();
      expect(list!.ordered).toBe(false);
      expect(list!.items).toHaveLength(3);
    });

    it('should parse an ordered list', () => {
      const md = '1. First\n2. Second\n3. Third';
      const result = parseMarkdown(md);
      const list = result.tokens.find((t): t is Tokens.List => t.type === 'list');
      expect(list).toBeDefined();
      expect(list!.ordered).toBe(true);
      expect(list!.items).toHaveLength(3);
    });

    it('should parse nested lists', () => {
      const md = '- Parent\n  - Child 1\n  - Child 2';
      const result = parseMarkdown(md);
      const list = result.tokens.find((t): t is Tokens.List => t.type === 'list');
      expect(list).toBeDefined();
      // The parent list should have at least one item
      expect(list!.items.length).toBeGreaterThanOrEqual(1);
      // The first item's tokens should contain a nested list
      const nestedList = list!.items[0].tokens.find((t): t is Tokens.List => t.type === 'list');
      expect(nestedList).toBeDefined();
      expect(nestedList!.items).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Fenced code blocks
  // ---------------------------------------------------------------------------

  describe('code blocks', () => {
    it('should parse a fenced code block without language', () => {
      const md = '```\nconsole.log("hello");\n```';
      const result = parseMarkdown(md);
      const code = result.tokens.find((t): t is Tokens.Code => t.type === 'code');
      expect(code).toBeDefined();
      expect(code!.text).toBe('console.log("hello");');
      expect(result.metadata.hasCodeBlocks).toBe(true);
    });

    it('should parse a fenced code block with language', () => {
      const md = '```typescript\nconst x: number = 42;\n```';
      const result = parseMarkdown(md);
      const code = result.tokens.find((t): t is Tokens.Code => t.type === 'code');
      expect(code).toBeDefined();
      expect(code!.lang).toBe('typescript');
      expect(code!.text).toBe('const x: number = 42;');
    });

    it('should detect multiple languages in metadata', () => {
      const md = [
        '```javascript',
        'const a = 1;',
        '```',
        '',
        '```python',
        'x = 1',
        '```',
        '',
        '```javascript',
        'const b = 2;',
        '```',
      ].join('\n');
      const result = parseMarkdown(md);
      expect(result.metadata.hasCodeBlocks).toBe(true);
      expect(result.metadata.languages).toContain('javascript');
      expect(result.metadata.languages).toContain('python');
      // Languages should be deduplicated
      expect(result.metadata.languages.filter((l) => l === 'javascript')).toHaveLength(1);
    });

    it('should set hasCodeBlocks false when there are no code blocks', () => {
      const result = parseMarkdown('Just a paragraph');
      expect(result.metadata.hasCodeBlocks).toBe(false);
      expect(result.metadata.languages).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Tables (GFM)
  // ---------------------------------------------------------------------------

  describe('tables', () => {
    const tableMd = [
      '| Header 1 | Header 2 |',
      '| -------- | -------- |',
      '| Cell 1   | Cell 2   |',
      '| Cell 3   | Cell 4   |',
    ].join('\n');

    it('should parse a GFM table', () => {
      const result = parseMarkdown(tableMd);
      const table = result.tokens.find((t): t is Tokens.Table => t.type === 'table');
      expect(table).toBeDefined();
      expect(table!.header).toHaveLength(2);
      expect(table!.rows).toHaveLength(2);
    });

    it('should set hasTables true when tables are present', () => {
      const result = parseMarkdown(tableMd);
      expect(result.metadata.hasTables).toBe(true);
    });

    it('should set hasTables false when no tables are present', () => {
      const result = parseMarkdown('No tables here');
      expect(result.metadata.hasTables).toBe(false);
    });

    it('should not parse tables when gfm is disabled', () => {
      const result = parseMarkdown(tableMd, { gfm: false });
      expect(result.metadata.hasTables).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Links and images
  // ---------------------------------------------------------------------------

  describe('links and images', () => {
    it('should parse inline links', () => {
      const result = parseMarkdown('[Click here](https://example.com)');
      const para = result.tokens.find((t): t is Tokens.Paragraph => t.type === 'paragraph');
      expect(para).toBeDefined();
      const link = para!.tokens.find((t): t is Tokens.Link => t.type === 'link');
      expect(link).toBeDefined();
      expect(link!.href).toBe('https://example.com');
    });

    it('should parse images', () => {
      const result = parseMarkdown('![Alt text](image.png "Title")');
      const para = result.tokens.find((t): t is Tokens.Paragraph => t.type === 'paragraph');
      expect(para).toBeDefined();
      const image = para!.tokens.find((t): t is Tokens.Image => t.type === 'image');
      expect(image).toBeDefined();
      expect(image!.href).toBe('image.png');
      expect(image!.text).toBe('Alt text');
    });

    it('should set hasImages true when images are present', () => {
      const result = parseMarkdown('![photo](photo.jpg)');
      expect(result.metadata.hasImages).toBe(true);
    });

    it('should set hasImages false when no images are present', () => {
      const result = parseMarkdown('[link](url) but no images');
      expect(result.metadata.hasImages).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Blockquotes
  // ---------------------------------------------------------------------------

  describe('blockquotes', () => {
    it('should parse a blockquote', () => {
      const result = parseMarkdown('> This is a quote');
      const bq = result.tokens.find((t): t is Tokens.Blockquote => t.type === 'blockquote');
      expect(bq).toBeDefined();
      expect(bq!.text).toContain('This is a quote');
    });

    it('should parse nested blockquotes', () => {
      const md = '> Outer\n>\n> > Inner';
      const result = parseMarkdown(md);
      const bq = result.tokens.find((t): t is Tokens.Blockquote => t.type === 'blockquote');
      expect(bq).toBeDefined();
      // The outer blockquote's tokens should contain another blockquote
      const innerBq = bq!.tokens.find((t): t is Tokens.Blockquote => t.type === 'blockquote');
      expect(innerBq).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Horizontal rules
  // ---------------------------------------------------------------------------

  describe('horizontal rules', () => {
    it.each(['---', '***', '___'])('should parse horizontal rule: %s', (rule) => {
      const result = parseMarkdown(rule);
      const hr = result.tokens.find((t): t is Tokens.Hr => t.type === 'hr');
      expect(hr).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Parser options
  // ---------------------------------------------------------------------------

  describe('options', () => {
    it('should enable GFM by default', () => {
      const tableMd = '| A | B |\n|---|---|\n| 1 | 2 |';
      const result = parseMarkdown(tableMd);
      expect(result.metadata.hasTables).toBe(true);
    });

    it('should respect gfm: false', () => {
      const tableMd = '| A | B |\n|---|---|\n| 1 | 2 |';
      const result = parseMarkdown(tableMd, { gfm: false });
      expect(result.metadata.hasTables).toBe(false);
    });

    it('should accept breaks option', () => {
      // Primarily verifying it does not throw
      const result = parseMarkdown('Line 1\nLine 2', {
        gfm: true,
        breaks: true,
      });
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Mixed content
  // ---------------------------------------------------------------------------

  describe('mixed content', () => {
    it('should parse a document with headings, lists, code, and tables', () => {
      const md = [
        '# Title',
        '',
        'A paragraph with **bold** and *italic* text.',
        '',
        '- Item A',
        '- Item B',
        '',
        '```python',
        'print("hello")',
        '```',
        '',
        '| Name | Value |',
        '| ---- | ----- |',
        '| foo  | 42    |',
        '',
        '![diagram](arch.png)',
      ].join('\n');

      const result = parseMarkdown(md);

      // Verify token types present
      const types = result.tokens.map((t) => t.type);
      expect(types).toContain('heading');
      expect(types).toContain('paragraph');
      expect(types).toContain('list');
      expect(types).toContain('code');
      expect(types).toContain('table');

      // Verify metadata
      expect(result.metadata.hasCodeBlocks).toBe(true);
      expect(result.metadata.languages).toContain('python');
      expect(result.metadata.hasTables).toBe(true);
      expect(result.metadata.hasImages).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Japanese text content
  // ---------------------------------------------------------------------------

  describe('Japanese text content', () => {
    it('should parse headings with Japanese text', () => {
      const result = parseMarkdown('# はじめに');
      const heading = result.tokens.find((t): t is Tokens.Heading => t.type === 'heading');
      expect(heading).toBeDefined();
      expect(heading!.text).toBe('はじめに');
    });

    it('should parse paragraphs with Japanese text', () => {
      const result = parseMarkdown('これは日本語の段落です。**太字**と*斜体*を含みます。');
      const para = result.tokens.find((t): t is Tokens.Paragraph => t.type === 'paragraph');
      expect(para).toBeDefined();
      // Verify inline formatting within Japanese text
      const strong = para!.tokens.find((t): t is Tokens.Strong => t.type === 'strong');
      expect(strong).toBeDefined();
      expect(strong!.text).toBe('太字');
    });

    it('should parse lists with Japanese content', () => {
      const md = '- リンゴ\n- バナナ\n- みかん';
      const result = parseMarkdown(md);
      const list = result.tokens.find((t): t is Tokens.List => t.type === 'list');
      expect(list).toBeDefined();
      expect(list!.items).toHaveLength(3);
    });

    it('should parse a mixed Japanese document', () => {
      const md = [
        '# プロジェクト概要',
        '',
        'このドキュメントは`md2Lark`の仕様です。',
        '',
        '## 機能一覧',
        '',
        '| 機能名 | 説明 |',
        '| ------ | ---- |',
        '| パース | Markdownを解析 |',
        '| 変換   | Lark形式に変換 |',
      ].join('\n');

      const result = parseMarkdown(md);
      expect(result.metadata.hasTables).toBe(true);

      const headings = result.tokens.filter((t): t is Tokens.Heading => t.type === 'heading');
      expect(headings).toHaveLength(2);
      expect(headings[0].text).toBe('プロジェクト概要');
      expect(headings[1].text).toBe('機能一覧');
    });
  });

  // ---------------------------------------------------------------------------
  // Return structure
  // ---------------------------------------------------------------------------

  describe('return structure', () => {
    it('should always return tokens as an array', () => {
      const result = parseMarkdown('hello');
      expect(Array.isArray(result.tokens)).toBe(true);
    });

    it('should always return metadata with all required fields', () => {
      const result = parseMarkdown('hello');
      expect(result.metadata).toHaveProperty('hasCodeBlocks');
      expect(result.metadata).toHaveProperty('languages');
      expect(result.metadata).toHaveProperty('hasTables');
      expect(result.metadata).toHaveProperty('hasImages');
      expect(Array.isArray(result.metadata.languages)).toBe(true);
    });
  });
});
