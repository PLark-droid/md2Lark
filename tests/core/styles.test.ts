import { getStyleTemplate, getElementStyle, STYLE_TEMPLATES } from '../../src/core/styles';
import type { StyleTemplateName } from '../../src/core/styles';
import { markdownToLarkHtml } from '../../src/core/renderer';

// ---------------------------------------------------------------------------
// STYLE_TEMPLATES registry
// ---------------------------------------------------------------------------

describe('STYLE_TEMPLATES', () => {
  it('contains exactly three templates', () => {
    const names = Object.keys(STYLE_TEMPLATES);
    expect(names).toHaveLength(3);
    expect(names).toEqual(expect.arrayContaining(['minimal', 'enhanced', 'document']));
  });

  it.each(['minimal', 'enhanced', 'document'] as StyleTemplateName[])(
    '%s template has required metadata fields',
    (name) => {
      const t = STYLE_TEMPLATES[name];
      expect(t.name).toBe(name);
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
    },
  );

  it.each(['minimal', 'enhanced', 'document'] as StyleTemplateName[])(
    '%s template defines at least one style rule',
    (name) => {
      const t = STYLE_TEMPLATES[name];
      expect(Object.keys(t.styles).length).toBeGreaterThan(0);
    },
  );
});

// ---------------------------------------------------------------------------
// getStyleTemplate
// ---------------------------------------------------------------------------

describe('getStyleTemplate', () => {
  it('returns the minimal template by name', () => {
    const t = getStyleTemplate('minimal');
    expect(t.name).toBe('minimal');
  });

  it('returns the enhanced template by name', () => {
    const t = getStyleTemplate('enhanced');
    expect(t.name).toBe('enhanced');
  });

  it('returns the document template by name', () => {
    const t = getStyleTemplate('document');
    expect(t.name).toBe('document');
  });

  it('falls back to minimal for an unknown name', () => {
    const t = getStyleTemplate('unknown');
    expect(t.name).toBe('minimal');
  });

  it('falls back to minimal for empty string', () => {
    const t = getStyleTemplate('');
    expect(t.name).toBe('minimal');
  });
});

// ---------------------------------------------------------------------------
// getElementStyle
// ---------------------------------------------------------------------------

describe('getElementStyle', () => {
  it('returns the style string for a known element', () => {
    const t = getStyleTemplate('minimal');
    const style = getElementStyle(t, 'table');
    expect(style).toBe('border-collapse: collapse;');
  });

  it('returns the combined th,td style when using the composite key', () => {
    const t = getStyleTemplate('minimal');
    const style = getElementStyle(t, 'th,td');
    expect(style).toContain('border:');
    expect(style).toContain('padding:');
  });

  it('returns empty string for an undefined element', () => {
    const t = getStyleTemplate('minimal');
    const style = getElementStyle(t, 'video');
    expect(style).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Style template integration with renderer
// ---------------------------------------------------------------------------

describe('markdownToLarkHtml with style templates', () => {
  it('returns default (unstyled) output when no template is given', () => {
    const html = markdownToLarkHtml('# Hello');
    expect(html).toContain('<h1>Hello</h1>');
    // No enhanced heading styles should be present
    expect(html).not.toContain('font-size: 1.6em');
  });

  it('applies enhanced heading styles', () => {
    const html = markdownToLarkHtml('# Title', 'enhanced');
    expect(html).toContain('<h1 style="');
    expect(html).toContain('font-size: 1.6em');
    expect(html).toContain('border-bottom: 2px solid #3370ff');
  });

  it('applies document heading styles', () => {
    const html = markdownToLarkHtml('## Subtitle', 'document');
    expect(html).toContain('<h2 style="');
    expect(html).toContain('font-size: 1.5em');
    expect(html).toContain('line-height: 1.3');
  });

  it('applies table styles from the minimal template', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = markdownToLarkHtml(md, 'minimal');
    expect(html).toContain('<table style="border-collapse: collapse;">');
  });

  it('applies enhanced table styles with width 100%', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = markdownToLarkHtml(md, 'enhanced');
    expect(html).toContain('width: 100%');
  });

  it('applies enhanced th background color', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = markdownToLarkHtml(md, 'enhanced');
    expect(html).toContain('background-color: #f0f4ff');
  });

  it('applies blockquote styles from enhanced template', () => {
    const html = markdownToLarkHtml('> Quote', 'enhanced');
    expect(html).toContain('border-left: 4px solid #3370ff');
    expect(html).toContain('background: #f8f9ff');
  });

  it('applies blockquote styles from document template', () => {
    const html = markdownToLarkHtml('> Quote', 'document');
    expect(html).toContain('font-style: italic');
    expect(html).toContain('border-left: 4px solid #999');
  });

  it('applies link styles from enhanced template', () => {
    const html = markdownToLarkHtml('[Link](https://example.com)', 'enhanced');
    expect(html).toContain('font-weight: 500');
    expect(html).toContain('color: #3370ff');
  });

  it('applies link styles from document template', () => {
    const html = markdownToLarkHtml('[Link](https://example.com)', 'document');
    expect(html).toContain('text-decoration: underline');
    expect(html).toContain('color: #2962ff');
  });

  it('applies pre styles from enhanced template (dark theme)', () => {
    const md = '```\ncode\n```';
    const html = markdownToLarkHtml(md, 'enhanced');
    expect(html).toContain('background: #1e1e1e');
    expect(html).toContain('color: #d4d4d4');
  });

  it('applies paragraph styles from document template', () => {
    const html = markdownToLarkHtml('Hello world', 'document');
    expect(html).toContain('<p style="');
    expect(html).toContain('line-height: 1.8');
  });

  it('applies list item styles from document template', () => {
    const md = '- Item A\n- Item B';
    const html = markdownToLarkHtml(md, 'document');
    expect(html).toContain('<li style="');
    expect(html).toContain('line-height: 1.8');
  });

  it('does not apply styles for an unknown template (falls back to minimal)', () => {
    const html = markdownToLarkHtml('# Title', 'nonexistent');
    // Minimal has no h1 style, so no style should be added to h1
    expect(html).not.toContain('<h1 style=');
  });

  it('falls back to minimal for malicious template name', () => {
    const result = markdownToLarkHtml('# Test', '<script>alert(1)</script>');
    expect(result).not.toContain('<script>alert');
    expect(result).toContain('<h1');
  });

  it('applies inline-code styles without affecting code blocks', () => {
    const md = 'Use `inline` code and:\n\n```\nblock code\n```';
    const html = markdownToLarkHtml(md, 'enhanced');
    // The inline <code> should get the inline-code style (blue text on light bg).
    expect(html).toContain('color: #1967d2');
    expect(html).toContain('background: #e8f0fe');
    // The <pre> block should get the enhanced dark theme.
    expect(html).toContain('background: #1e1e1e');
    // The code inside <pre> should get the general 'code' style, not 'inline-code'.
    expect(html).toMatch(/<pre[^>]*>.*<code/s);
  });
});
