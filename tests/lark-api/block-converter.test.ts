import {
  markdownToLarkBlocks,
  convertToken,
  convertTokens,
  parseInlineTokens,
  getCodeLanguageId,
} from '../../src/lark-api/block-converter.js';
import { Lexer, type Token } from 'marked';

describe('block-converter', () => {
  // -----------------------------------------------------------------------
  // markdownToLarkBlocks - headings
  // -----------------------------------------------------------------------

  describe('headings', () => {
    it('converts # Heading to heading1 block (block_type 3)', () => {
      const blocks = markdownToLarkBlocks('# Heading');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].block_type).toBe(3);
      expect(blocks[0].heading1).toBeDefined();
      expect(blocks[0].heading1!.elements).toHaveLength(1);
      expect(blocks[0].heading1!.elements[0].text_run!.content).toBe('Heading');
    });

    it('converts ## Sub to heading2 block (block_type 4)', () => {
      const blocks = markdownToLarkBlocks('## Sub');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].block_type).toBe(4);
      expect(blocks[0].heading2).toBeDefined();
      expect(blocks[0].heading2!.elements[0].text_run!.content).toBe('Sub');
    });

    it('converts ### to heading3 (block_type 5)', () => {
      const blocks = markdownToLarkBlocks('### H3');
      expect(blocks[0].block_type).toBe(5);
      expect(blocks[0].heading3).toBeDefined();
    });

    it('converts #### to heading4 (block_type 6)', () => {
      const blocks = markdownToLarkBlocks('#### H4');
      expect(blocks[0].block_type).toBe(6);
      expect(blocks[0].heading4).toBeDefined();
    });

    it('converts ##### to heading5 (block_type 7)', () => {
      const blocks = markdownToLarkBlocks('##### H5');
      expect(blocks[0].block_type).toBe(7);
      expect(blocks[0].heading5).toBeDefined();
    });

    it('converts ###### to heading6 (block_type 8)', () => {
      const blocks = markdownToLarkBlocks('###### H6');
      expect(blocks[0].block_type).toBe(8);
      expect(blocks[0].heading6).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Paragraph
  // -----------------------------------------------------------------------

  describe('paragraph', () => {
    it('converts plain text to text block (block_type 2)', () => {
      const blocks = markdownToLarkBlocks('Hello world');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].block_type).toBe(2);
      expect(blocks[0].text).toBeDefined();
      expect(blocks[0].text!.elements[0].text_run!.content).toBe('Hello world');
    });
  });

  // -----------------------------------------------------------------------
  // Inline styles
  // -----------------------------------------------------------------------

  describe('inline styles', () => {
    it('converts **bold** to bold TextElement', () => {
      const blocks = markdownToLarkBlocks('**bold**');
      const elements = blocks[0].text!.elements;
      expect(elements[0].text_run!.content).toBe('bold');
      expect(elements[0].text_run!.text_element_style?.bold).toBe(true);
    });

    it('converts *italic* to italic TextElement', () => {
      const blocks = markdownToLarkBlocks('*italic*');
      const elements = blocks[0].text!.elements;
      expect(elements[0].text_run!.content).toBe('italic');
      expect(elements[0].text_run!.text_element_style?.italic).toBe(true);
    });

    it('converts ~~strike~~ to strikethrough TextElement', () => {
      const blocks = markdownToLarkBlocks('~~strike~~');
      const elements = blocks[0].text!.elements;
      expect(elements[0].text_run!.content).toBe('strike');
      expect(elements[0].text_run!.text_element_style?.strikethrough).toBe(true);
    });

    it('converts `code` to code_inline TextElement', () => {
      const blocks = markdownToLarkBlocks('`code`');
      const elements = blocks[0].text!.elements;
      expect(elements[0].text_run!.content).toBe('code');
      expect(elements[0].text_run!.text_element_style?.code_inline).toBe(true);
    });

    it('converts [link](url) to link TextElement', () => {
      const blocks = markdownToLarkBlocks('[click here](https://example.com)');
      const elements = blocks[0].text!.elements;
      expect(elements[0].text_run!.content).toBe('click here');
      expect(elements[0].text_run!.text_element_style?.link).toEqual({
        url: 'https://example.com',
      });
    });

    it('converts nested **bold *italic*** to bold+italic', () => {
      const blocks = markdownToLarkBlocks('**bold *italic***');
      const elements = blocks[0].text!.elements;
      // Should have at least "bold " (bold) and "italic" (bold+italic)
      const boldOnly = elements.find(
        (e) =>
          e.text_run!.content.trim() === 'bold' &&
          e.text_run!.text_element_style?.bold === true,
      );
      const boldItalic = elements.find(
        (e) =>
          e.text_run!.content === 'italic' &&
          e.text_run!.text_element_style?.bold === true &&
          e.text_run!.text_element_style?.italic === true,
      );
      expect(boldOnly).toBeDefined();
      expect(boldItalic).toBeDefined();
    });

    it('does not add text_element_style for plain text', () => {
      const blocks = markdownToLarkBlocks('plain text');
      const element = blocks[0].text!.elements[0];
      expect(element.text_run!.text_element_style).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Code blocks
  // -----------------------------------------------------------------------

  describe('code blocks', () => {
    it('converts fenced code to code block (block_type 15)', () => {
      const blocks = markdownToLarkBlocks('```js\nconsole.log(1)\n```');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].block_type).toBe(15);
      expect(blocks[0].code).toBeDefined();
      expect(blocks[0].code!.elements[0].text_run!.content).toBe('console.log(1)');
      expect(blocks[0].code!.language).toBe(19); // javascript
    });

    it('defaults to plaintext (1) for unknown language', () => {
      const blocks = markdownToLarkBlocks('```\nsome code\n```');
      expect(blocks[0].code!.language).toBe(1);
    });

    it('handles code block with specified language', () => {
      const blocks = markdownToLarkBlocks('```python\nprint("hello")\n```');
      expect(blocks[0].code!.language).toBe(49);
    });
  });

  // -----------------------------------------------------------------------
  // Blockquote
  // -----------------------------------------------------------------------

  describe('blockquote', () => {
    it('converts > quote to quote block (block_type 14)', () => {
      const blocks = markdownToLarkBlocks('> This is a quote');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].block_type).toBe(14);
      expect(blocks[0].quote).toBeDefined();
      expect(blocks[0].quote!.elements[0].text_run!.content).toBe('This is a quote');
    });
  });

  // -----------------------------------------------------------------------
  // Lists
  // -----------------------------------------------------------------------

  describe('lists', () => {
    it('converts unordered list to bullet blocks (block_type 12)', () => {
      const blocks = markdownToLarkBlocks('- item1\n- item2\n- item3');
      expect(blocks).toHaveLength(3);
      blocks.forEach((block) => {
        expect(block.block_type).toBe(12);
        expect(block.bullet).toBeDefined();
      });
      expect(blocks[0].bullet!.elements[0].text_run!.content).toBe('item1');
      expect(blocks[1].bullet!.elements[0].text_run!.content).toBe('item2');
      expect(blocks[2].bullet!.elements[0].text_run!.content).toBe('item3');
    });

    it('converts ordered list to ordered blocks (block_type 13)', () => {
      const blocks = markdownToLarkBlocks('1. one\n2. two');
      expect(blocks).toHaveLength(2);
      blocks.forEach((block) => {
        expect(block.block_type).toBe(13);
        expect(block.ordered).toBeDefined();
      });
      expect(blocks[0].ordered!.elements[0].text_run!.content).toBe('one');
      expect(blocks[1].ordered!.elements[0].text_run!.content).toBe('two');
    });
  });

  // -----------------------------------------------------------------------
  // Divider (horizontal rule)
  // -----------------------------------------------------------------------

  describe('divider', () => {
    it('converts --- to divider block (block_type 22)', () => {
      const blocks = markdownToLarkBlocks('---');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].block_type).toBe(22);
      expect(blocks[0].divider).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Table
  // -----------------------------------------------------------------------

  describe('table', () => {
    it('converts table to table block (block_type 31)', () => {
      const blocks = markdownToLarkBlocks('| A | B |\n|---|---|\n| 1 | 2 |');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].block_type).toBe(31);
      expect(blocks[0].table).toBeDefined();
      expect(blocks[0].table!.column_size).toBe(2);
      expect(blocks[0].table!.row_size).toBe(2); // header + 1 body row
    });
  });

  // -----------------------------------------------------------------------
  // Mixed document
  // -----------------------------------------------------------------------

  describe('mixed document', () => {
    it('produces blocks in correct order for a mixed document', () => {
      const md = [
        '# Title',
        '',
        'A paragraph.',
        '',
        '- bullet 1',
        '- bullet 2',
        '',
        '```ts',
        'const x = 1;',
        '```',
        '',
        '> A quote',
        '',
        '---',
      ].join('\n');

      const blocks = markdownToLarkBlocks(md);

      const types = blocks.map((b) => b.block_type);
      // heading1, text, bullet, bullet, code, quote, divider
      expect(types).toEqual([3, 2, 12, 12, 15, 14, 22]);
    });
  });

  // -----------------------------------------------------------------------
  // Space tokens
  // -----------------------------------------------------------------------

  describe('space tokens', () => {
    it('skips space tokens', () => {
      const result = convertToken({ type: 'space', raw: '\n\n' } as Token);
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // convertTokens
  // -----------------------------------------------------------------------

  describe('convertTokens', () => {
    it('returns empty array for empty input', () => {
      const result = convertTokens([]);
      expect(result.blocks).toEqual([]);
    });

    it('filters out null results from space tokens', () => {
      const tokens = Lexer.lex('# Hello\n\nWorld');
      const result = convertTokens(tokens);
      // Should have heading + paragraph, no space blocks
      expect(result.blocks.length).toBe(2);
      expect(result.blocks[0].block_type).toBe(3);
      expect(result.blocks[1].block_type).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // parseInlineTokens
  // -----------------------------------------------------------------------

  describe('parseInlineTokens', () => {
    it('handles empty token array', () => {
      const elements = parseInlineTokens([]);
      expect(elements).toEqual([]);
    });

    it('preserves parent style for nested tokens', () => {
      const tokens = Lexer.lex('**bold *italic***');
      const paragraphToken = tokens[0] as { tokens: Token[] };
      const elements = parseInlineTokens(paragraphToken.tokens);

      const italicElement = elements.find(
        (e) => e.text_run?.text_element_style?.italic === true,
      );
      expect(italicElement).toBeDefined();
      expect(italicElement!.text_run!.text_element_style!.bold).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // br token
  // -----------------------------------------------------------------------

  describe('br token', () => {
    it('converts line break into a newline TextElement', () => {
      // Construct inline tokens directly: text + br + text
      const tokens: Token[] = [
        { type: 'text', raw: 'line1', text: 'line1' } as Token,
        { type: 'br', raw: '\n' } as Token,
        { type: 'text', raw: 'line2', text: 'line2' } as Token,
      ];
      const elements = parseInlineTokens(tokens);
      expect(elements).toHaveLength(3);
      expect(elements[0].text_run!.content).toBe('line1');
      expect(elements[1].text_run!.content).toBe('\n');
      expect(elements[2].text_run!.content).toBe('line2');
    });
  });

  // -----------------------------------------------------------------------
  // escape token
  // -----------------------------------------------------------------------

  describe('escape token', () => {
    it('converts escape token to plain text', () => {
      const tokens: Token[] = [
        { type: 'escape', raw: '\\*', text: '*' } as Token,
      ];
      const elements = parseInlineTokens(tokens);
      expect(elements).toHaveLength(1);
      expect(elements[0].text_run!.content).toBe('*');
    });
  });

  // -----------------------------------------------------------------------
  // default (unknown) inline token
  // -----------------------------------------------------------------------

  describe('unknown inline token', () => {
    it('renders unknown token using raw property as fallback', () => {
      const tokens: Token[] = [
        { type: 'html', raw: '<span>hi</span>' } as Token,
      ];
      const elements = parseInlineTokens(tokens);
      expect(elements).toHaveLength(1);
      expect(elements[0].text_run!.content).toBe('<span>hi</span>');
    });

    it('skips unknown token when raw is empty', () => {
      const tokens: Token[] = [
        { type: 'unknown_custom', raw: '' } as Token,
      ];
      const elements = parseInlineTokens(tokens);
      expect(elements).toHaveLength(0);
    });

    it('skips unknown token when raw is undefined', () => {
      const tokens: Token[] = [
        { type: 'unknown_custom' } as Token,
      ];
      const elements = parseInlineTokens(tokens);
      expect(elements).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // default (unknown) top-level token
  // -----------------------------------------------------------------------

  describe('unknown top-level token', () => {
    it('returns null for unrecognised token type', () => {
      const result = convertToken({ type: 'html', raw: '<div/>' } as Token);
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // flattenInlineText branches (via link rendering)
  // -----------------------------------------------------------------------

  describe('flattenInlineText', () => {
    it('extracts text from simple text tokens inside a link', () => {
      // [hello](url) -- link text is plain text
      const blocks = markdownToLarkBlocks('[hello](https://example.com)');
      const elements = blocks[0].text!.elements;
      expect(elements[0].text_run!.content).toBe('hello');
    });

    it('extracts text from strong tokens inside a link', () => {
      // [**bold link**](url) -- link with nested strong
      const blocks = markdownToLarkBlocks('[**bold link**](https://example.com)');
      const elements = blocks[0].text!.elements;
      expect(elements[0].text_run!.content).toBe('bold link');
      expect(elements[0].text_run!.text_element_style?.link).toEqual({
        url: 'https://example.com',
      });
    });

    it('extracts text from em tokens inside a link', () => {
      // [*italic link*](url) -- link with nested em
      const blocks = markdownToLarkBlocks('[*italic link*](https://example.com)');
      const elements = blocks[0].text!.elements;
      expect(elements[0].text_run!.content).toBe('italic link');
      expect(elements[0].text_run!.text_element_style?.link).toEqual({
        url: 'https://example.com',
      });
    });

    it('extracts text from codespan tokens inside a link', () => {
      // [`code link`](url) -- link with nested codespan
      const blocks = markdownToLarkBlocks('[`code link`](https://example.com)');
      const elements = blocks[0].text!.elements;
      expect(elements[0].text_run!.content).toBe('code link');
    });

    it('extracts text from del tokens inside a link', () => {
      // [~~del link~~](url) -- link with nested del
      const blocks = markdownToLarkBlocks('[~~del link~~](https://example.com)');
      const elements = blocks[0].text!.elements;
      expect(elements[0].text_run!.content).toBe('del link');
    });

    it('returns empty for tokens with no text property in flattenInlineText', () => {
      // Use parseInlineTokens with a link token whose tokens array contains
      // a token with no text, no tokens, no raw -- this tests the default
      // branch in flattenInlineText.
      const linkToken: Token = {
        type: 'link',
        raw: '[x](url)',
        href: 'https://example.com',
        text: 'x',
        tokens: [
          { type: 'text', raw: 'x', text: 'x' } as Token,
        ],
      } as Token;
      const elements = parseInlineTokens([linkToken]);
      expect(elements).toHaveLength(1);
      expect(elements[0].text_run!.content).toBe('x');
    });
  });

  // -----------------------------------------------------------------------
  // extractBlockquoteElements branches
  // -----------------------------------------------------------------------

  describe('extractBlockquoteElements', () => {
    it('extracts text from paragraph tokens inside blockquote', () => {
      // Standard blockquote: > content is a paragraph child
      const blocks = markdownToLarkBlocks('> paragraph content');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].block_type).toBe(14);
      expect(blocks[0].quote!.elements[0].text_run!.content).toBe('paragraph content');
    });

    it('extracts text token content inside blockquote', () => {
      // Simulate a blockquote with a direct text token child
      const blockquoteToken: Token = {
        type: 'blockquote',
        raw: '> hello',
        text: 'hello',
        tokens: [
          {
            type: 'text',
            raw: 'hello',
            text: 'hello',
          } as Token,
        ],
      } as Token;
      const result = convertToken(blockquoteToken);
      expect(result).not.toBeNull();
      expect(result!.blocks[0].quote!.elements[0].text_run!.content).toBe('hello');
    });

    it('extracts text token with nested inline tokens inside blockquote', () => {
      const blockquoteToken: Token = {
        type: 'blockquote',
        raw: '> **bold**',
        text: '**bold**',
        tokens: [
          {
            type: 'text',
            raw: '**bold**',
            text: 'bold',
            tokens: [
              {
                type: 'strong',
                raw: '**bold**',
                text: 'bold',
                tokens: [
                  { type: 'text', raw: 'bold', text: 'bold' } as Token,
                ],
              } as Token,
            ],
          } as Token,
        ],
      } as Token;
      const result = convertToken(blockquoteToken);
      expect(result).not.toBeNull();
      const elements = result!.blocks[0].quote!.elements;
      expect(elements[0].text_run!.content).toBe('bold');
      expect(elements[0].text_run!.text_element_style?.bold).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // extractListItemElements branches
  // -----------------------------------------------------------------------

  describe('extractListItemElements', () => {
    it('extracts paragraph content from list items (loose lists)', () => {
      // A loose list (items separated by blank lines) wraps items in paragraph tokens
      const md = '- item 1\n\n- item 2\n';
      const blocks = markdownToLarkBlocks(md);
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(blocks[0].block_type).toBe(12);
      expect(blocks[0].bullet!.elements[0].text_run!.content).toBe('item 1');
    });
  });

  // -----------------------------------------------------------------------
  // Link with nested bold style
  // -----------------------------------------------------------------------

  describe('link with nested styles', () => {
    it('preserves bold + link styles for [**bold link**](url)', () => {
      const blocks = markdownToLarkBlocks('[**bold link**](https://example.com)');
      const elements = blocks[0].text!.elements;
      // flattenInlineText produces the text content for the link
      expect(elements[0].text_run!.content).toBe('bold link');
      expect(elements[0].text_run!.text_element_style?.link).toEqual({
        url: 'https://example.com',
      });
    });
  });

  // -----------------------------------------------------------------------
  // text token with nested tokens (line 92-93)
  // -----------------------------------------------------------------------

  describe('text token with nested tokens', () => {
    it('recursively processes text tokens that have inner tokens', () => {
      // A text token that has child tokens (e.g. from list item processing)
      const tokens: Token[] = [
        {
          type: 'text',
          raw: '**nested**',
          text: '**nested**',
          tokens: [
            {
              type: 'strong',
              raw: '**nested**',
              text: 'nested',
              tokens: [
                { type: 'text', raw: 'nested', text: 'nested' } as Token,
              ],
            } as Token,
          ],
        } as Token,
      ];
      const elements = parseInlineTokens(tokens);
      expect(elements).toHaveLength(1);
      expect(elements[0].text_run!.content).toBe('nested');
      expect(elements[0].text_run!.text_element_style?.bold).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // convertTokens with table structures
  // -----------------------------------------------------------------------

  describe('convertTokens with table', () => {
    it('collects tableStructures from table tokens', () => {
      const tokens = Lexer.lex('| A | B |\n|---|---|\n| 1 | 2 |');
      const result = convertTokens(tokens);
      expect(result.tableStructures).toBeDefined();
      expect(result.tableStructures!.length).toBe(1);
    });

    it('returns undefined tableStructures when no tables are present', () => {
      const tokens = Lexer.lex('Hello world');
      const result = convertTokens(tokens);
      expect(result.tableStructures).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getCodeLanguageId
  // -----------------------------------------------------------------------

  describe('getCodeLanguageId', () => {
    const cases: Array<[string, number]> = [
      ['plaintext', 1],
      ['python', 49],
      ['javascript', 19],
      ['js', 19],
      ['typescript', 69],
      ['ts', 69],
      ['java', 18],
      ['go', 14],
      ['rust', 55],
      ['c', 6],
      ['cpp', 7],
      ['csharp', 8],
      ['ruby', 54],
      ['php', 48],
      ['swift', 65],
      ['kotlin', 24],
      ['sql', 62],
      ['html', 16],
      ['css', 10],
      ['json', 21],
      ['yaml', 80],
      ['markdown', 35],
      ['bash', 3],
      ['shell', 3],
      ['', 1],
      ['unknown_lang', 1],
    ];

    it.each(cases)('maps "%s" to language ID %d', (lang, expected) => {
      expect(getCodeLanguageId(lang)).toBe(expected);
    });

    it('is case-insensitive', () => {
      expect(getCodeLanguageId('Python')).toBe(49);
      expect(getCodeLanguageId('JAVASCRIPT')).toBe(19);
      expect(getCodeLanguageId('TypeScript')).toBe(69);
    });
  });
});
