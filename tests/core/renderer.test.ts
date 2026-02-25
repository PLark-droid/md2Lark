import {
  LarkRenderer,
  markdownToLarkHtml,
} from '../../src/core/renderer';

/**
 * Helper: render markdown via the Lark renderer.
 */
function render(md: string): string {
  return markdownToLarkHtml(md);
}

// ---------------------------------------------------------------------------
// Headings
// ---------------------------------------------------------------------------

describe('LarkRenderer - headings', () => {
  it.each([1, 2, 3, 4, 5, 6] as const)(
    'renders h%i correctly',
    (level) => {
      const hashes = '#'.repeat(level);
      const html = render(`${hashes} Heading ${level}`);
      expect(html).toContain(`<h${level}>Heading ${level}</h${level}>`);
    },
  );

  it('renders heading with inline formatting', () => {
    const html = render('## Hello **bold** and *italic*');
    expect(html).toContain('<h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('</h2>');
  });
});

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------

describe('LarkRenderer - inline formatting', () => {
  it('renders bold text', () => {
    const html = render('This is **bold** text');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders italic text', () => {
    const html = render('This is *italic* text');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders strikethrough text', () => {
    const html = render('This is ~~deleted~~ text');
    expect(html).toContain('<del>deleted</del>');
  });

  it('renders inline code', () => {
    const html = render('Use `console.log()` for debugging');
    expect(html).toContain('<code>console.log()</code>');
    // Inline code must NOT be wrapped in <pre>
    expect(html).not.toContain('<pre>');
  });

  it('renders bold + italic combined', () => {
    const html = render('***bold italic***');
    expect(html).toContain('<strong>');
    expect(html).toContain('<em>');
  });
});

// ---------------------------------------------------------------------------
// Code blocks
// ---------------------------------------------------------------------------

describe('LarkRenderer - code blocks', () => {
  it('renders fenced code block with language', () => {
    const md = '```typescript\nconst x: number = 42;\n```';
    const html = render(md);
    expect(html).toContain('<pre><code class="language-typescript">');
    expect(html).toContain('const x: number = 42;');
    expect(html).toContain('</code></pre>');
  });

  it('renders fenced code block without language', () => {
    const md = '```\nhello world\n```';
    const html = render(md);
    expect(html).toContain('<pre><code>');
    expect(html).not.toContain('class="language-');
    expect(html).toContain('hello world');
  });

  it('escapes HTML entities inside code blocks', () => {
    const md = '```html\n<div class="test">&amp;</div>\n```';
    const html = render(md);
    expect(html).toContain('&lt;div class=&quot;test&quot;&gt;');
    expect(html).toContain('&amp;amp;');
    expect(html).toContain('&lt;/div&gt;');
  });

  it('escapes angle brackets in code blocks', () => {
    const md = '```\nif (a < b && c > d) {}\n```';
    const html = render(md);
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
  });
});

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

describe('LarkRenderer - lists', () => {
  it('renders unordered list', () => {
    const md = '- Item A\n- Item B\n- Item C\n';
    const html = render(md);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Item A</li>');
    expect(html).toContain('<li>Item B</li>');
    expect(html).toContain('<li>Item C</li>');
    expect(html).toContain('</ul>');
  });

  it('renders ordered list', () => {
    const md = '1. First\n2. Second\n3. Third\n';
    const html = render(md);
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>First</li>');
    expect(html).toContain('<li>Second</li>');
    expect(html).toContain('</ol>');
  });

  it('does NOT wrap list item content in <p> tags (tight list)', () => {
    const md = '- Alpha\n- Beta\n';
    const html = render(md);
    expect(html).not.toMatch(/<li>\s*<p>/);
  });

  it('does NOT wrap list item content in <p> tags (loose list)', () => {
    // A blank line between items makes the list "loose" in CommonMark.
    const md = '- Alpha\n\n- Beta\n';
    const html = render(md);
    expect(html).not.toMatch(/<li>\s*<p>/);
    expect(html).toContain('<li>Alpha</li>');
    expect(html).toContain('<li>Beta</li>');
  });

  it('renders nested lists', () => {
    const md = '- Parent\n  - Child A\n  - Child B\n- Sibling\n';
    const html = render(md);
    // There should be an inner <ul> inside the first <li>
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Child A</li>');
    expect(html).toContain('<li>Child B</li>');
    // Count <ul> occurrences -- at least 2 (outer + inner)
    const ulCount = (html.match(/<ul>/g) ?? []).length;
    expect(ulCount).toBeGreaterThanOrEqual(2);
  });

  it('renders list with inline formatting', () => {
    const md = '- **Bold item**\n- *Italic item*\n';
    const html = render(md);
    expect(html).toContain('<strong>Bold item</strong>');
    expect(html).toContain('<em>Italic item</em>');
  });
});

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

describe('LarkRenderer - tables', () => {
  const tableMd =
    '| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |\n';

  it('renders table with thead and tbody', () => {
    const html = render(tableMd);
    expect(html).toContain('<thead>');
    expect(html).toContain('</thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('</tbody>');
  });

  it('uses <th> for header cells and <td> for body cells', () => {
    const html = render(tableMd);
    expect(html).toContain('<th');
    expect(html).toContain('Name');
    expect(html).toContain('<td');
    expect(html).toContain('Alice');
  });

  it('adds inline border-collapse style on table', () => {
    const html = render(tableMd);
    expect(html).toContain('style="border-collapse: collapse;"');
  });

  it('adds inline border + padding style on th and td', () => {
    const html = render(tableMd);
    const cellStyle = 'border: 1px solid #d9d9d9; padding: 8px;';
    // Every th and td should have it
    expect(html).toContain(`<th style="${cellStyle}"`);
    expect(html).toContain(`<td style="${cellStyle}"`);
  });

  it('renders table with alignment', () => {
    const md =
      '| Left | Center | Right |\n| :--- | :---: | ---: |\n| L | C | R |\n';
    const html = render(md);
    expect(html).toContain('align="left"');
    expect(html).toContain('align="center"');
    expect(html).toContain('align="right"');
  });
});

// ---------------------------------------------------------------------------
// Links & images
// ---------------------------------------------------------------------------

describe('LarkRenderer - links', () => {
  it('renders link with target="_blank"', () => {
    const html = render('[Google](https://google.com)');
    expect(html).toContain('href="https://google.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('>Google</a>');
  });

  it('renders link with title', () => {
    const html = render('[Link](https://example.com "Example")');
    expect(html).toContain('title="Example"');
  });
});

describe('LarkRenderer - images', () => {
  it('renders image with alt text', () => {
    const html = render('![Alt text](https://example.com/img.png)');
    expect(html).toContain('src="https://example.com/img.png"');
    expect(html).toContain('alt="Alt text"');
    expect(html).toContain('/>');
  });

  it('renders image with title', () => {
    const html = render('![Alt](https://example.com/img.png "Title")');
    expect(html).toContain('title="Title"');
  });
});

// ---------------------------------------------------------------------------
// Blockquotes
// ---------------------------------------------------------------------------

describe('LarkRenderer - blockquotes', () => {
  it('renders blockquote with inline style', () => {
    const html = render('> This is a quote');
    expect(html).toContain('<blockquote');
    expect(html).toContain('border-left: 4px solid #d9d9d9');
    expect(html).toContain('padding-left: 16px');
    expect(html).toContain('color: #666');
    expect(html).toContain('This is a quote');
    expect(html).toContain('</blockquote>');
  });

  it('renders nested blockquote', () => {
    const html = render('> outer\n>> inner');
    const bqCount = (html.match(/<blockquote/g) ?? []).length;
    expect(bqCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Horizontal rules
// ---------------------------------------------------------------------------

describe('LarkRenderer - horizontal rules', () => {
  it('renders <hr /> tag', () => {
    const html = render('---');
    expect(html).toContain('<hr />');
  });
});

// ---------------------------------------------------------------------------
// Paragraphs & line breaks
// ---------------------------------------------------------------------------

describe('LarkRenderer - paragraphs and breaks', () => {
  it('wraps text in <p> tags', () => {
    const html = render('Hello world');
    expect(html).toContain('<p>Hello world</p>');
  });

  it('renders line break as <br />', () => {
    // Two trailing spaces create a hard break in markdown.
    const html = render('Line one  \nLine two');
    expect(html).toContain('<br />');
  });
});

// ---------------------------------------------------------------------------
// Complex / mixed markdown
// ---------------------------------------------------------------------------

describe('LarkRenderer - complex markdown', () => {
  it('renders mixed content (headings, lists, code, tables)', () => {
    const md = [
      '# Project Summary',
      '',
      'Here is some **important** info.',
      '',
      '## Features',
      '',
      '- Feature A with `inline code`',
      '- Feature B',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
      '| Col1 | Col2 |',
      '| ---- | ---- |',
      '| A    | B    |',
      '',
      '> A blockquote with *emphasis*.',
      '',
      '---',
      '',
      '[Link](https://example.com)',
    ].join('\n');

    const html = render(md);

    expect(html).toContain('<h1>Project Summary</h1>');
    expect(html).toContain('<strong>important</strong>');
    expect(html).toContain('<h2>Features</h2>');
    expect(html).toContain('<code>inline code</code>');
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain('<table');
    expect(html).toContain('<blockquote');
    expect(html).toContain('<hr />');
    expect(html).toContain('target="_blank"');
  });
});

// ---------------------------------------------------------------------------
// Japanese content
// ---------------------------------------------------------------------------

describe('LarkRenderer - Japanese text', () => {
  it('renders Japanese headings and paragraphs', () => {
    const md = '# 日本語の見出し\n\nこれは段落です。**太字**と*斜体*を含みます。\n';
    const html = render(md);
    expect(html).toContain('<h1>日本語の見出し</h1>');
    expect(html).toContain('<strong>太字</strong>');
    expect(html).toContain('<em>斜体</em>');
  });

  it('renders Japanese list items', () => {
    const md = '- りんご\n- みかん\n- ぶどう\n';
    const html = render(md);
    expect(html).toContain('<li>りんご</li>');
    expect(html).toContain('<li>みかん</li>');
    expect(html).toContain('<li>ぶどう</li>');
  });

  it('renders Japanese table content', () => {
    const md = '| 名前 | 年齢 |\n| --- | --- |\n| 太郎 | 30 |\n';
    const html = render(md);
    expect(html).toContain('名前');
    expect(html).toContain('太郎');
  });
});

// ---------------------------------------------------------------------------
// LarkRenderer class export
// ---------------------------------------------------------------------------

describe('LarkRenderer - class export', () => {
  it('is exported and can be instantiated', () => {
    const renderer = new LarkRenderer();
    expect(renderer).toBeInstanceOf(LarkRenderer);
  });
});
