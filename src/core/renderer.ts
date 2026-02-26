/**
 * Lark-optimized HTML renderer for marked.
 *
 * Produces clean HTML suitable for pasting into the Lark (Feishu) rich text
 * editor. Key design decisions:
 *
 * - Inline styles instead of CSS classes (Lark strips class attributes)
 * - Table borders via inline style (clipboard paste loses stylesheet rules)
 * - No `<p>` wrappers inside `<li>` (Lark renders them as extra blank lines)
 * - `target="_blank"` on links (Lark opens links in a new tab by default)
 */

import {
  Marked,
  Parser,
  Renderer,
  type Token,
  type TokensList,
  type Tokens,
  type RendererObject,
} from 'marked';

import { getStyleTemplate, STYLE_TEMPLATES } from './styles.js';
import type { StyleTemplate } from './styles.js';

// ---------------------------------------------------------------------------
// HTML entity escaping
// ---------------------------------------------------------------------------

const ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape HTML special characters so that arbitrary text can be safely
 * embedded inside an HTML document.
 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ENTITY_MAP[ch] ?? ch);
}

// ---------------------------------------------------------------------------
// Table column width helpers
// ---------------------------------------------------------------------------

/**
 * Estimate the visual width of text content for column sizing.
 * CJK characters count as ~2 units, ASCII as ~1, to approximate proportional width.
 */
function measureTextWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK Unified Ideographs, Hiragana, Katakana, Fullwidth forms
    if (
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * Convert raw character-width estimates into percentage column widths.
 *
 * Applies minimum/maximum constraints and normalizes so columns sum to 100%.
 * Ensures narrow columns (like "ID") get enough space to be readable, while
 * wide columns (like "Description") expand proportionally.
 */
function computeColumnWidths(colMaxLen: number[]): number[] {
  const colCount = colMaxLen.length;
  if (colCount === 0) return [];
  if (colCount === 1) return [100];

  const MIN_COL_WIDTH = 8; // minimum % per column
  const MAX_COL_WIDTH = 60; // maximum % per column

  // Ensure at least 1 unit per column to avoid division by zero.
  const adjusted = colMaxLen.map((w) => Math.max(w, 2));
  const total = adjusted.reduce((a, b) => a + b, 0);

  // Proportional allocation with clamping.
  let widths = adjusted.map((w) => {
    const pct = (w / total) * 100;
    return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, pct));
  });

  // Normalize to sum to 100%.
  const sum = widths.reduce((a, b) => a + b, 0);
  widths = widths.map((w) => Math.round((w / sum) * 100 * 10) / 10);

  // Fix rounding drift so total is exactly 100.
  const drift = 100 - widths.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    const maxIdx = widths.indexOf(Math.max(...widths));
    widths[maxIdx] = Math.round((widths[maxIdx] + drift) * 10) / 10;
  }

  return widths;
}

// ---------------------------------------------------------------------------
// Inline style constants (derived from the minimal style template)
// ---------------------------------------------------------------------------

const DEFAULT_STYLES = STYLE_TEMPLATES.minimal.styles;

const TABLE_STYLE = DEFAULT_STYLES.table;
const CELL_STYLE = DEFAULT_STYLES['th,td'];
const BLOCKQUOTE_STYLE = DEFAULT_STYLES.blockquote;

/**
 * Render a table cell with an explicit width style.
 * Standalone function (not on RendererObject) to avoid extending the marked API.
 */
function renderCellWithWidth(
  parser: Parser,
  cell: Tokens.TableCell,
  widthPercent: number,
): string {
  const tag = cell.header ? 'th' : 'td';
  const alignAttr = cell.align ? ` align="${cell.align}"` : '';
  const content = parser.parseInline(cell.tokens);
  const widthStyle = `width: ${widthPercent}%; min-width: ${Math.max(60, widthPercent * 3)}px;`;
  return `<${tag} style="${CELL_STYLE} ${widthStyle}"${alignAttr}>${content}</${tag}>`;
}

// ---------------------------------------------------------------------------
// LarkRenderer class
// ---------------------------------------------------------------------------

/**
 * Wrapper class around the Lark-optimised renderer configuration.
 *
 * Internally creates a `Marked` instance configured with Lark-specific
 * renderer overrides. This class provides a clean API for consumers who
 * prefer a class-based interface.
 *
 * @example
 * ```ts
 * const renderer = new LarkRenderer();
 * const html = renderer.render('# Hello **world**');
 * ```
 */
export class LarkRenderer {
  private readonly marked: Marked;

  constructor() {
    this.marked = new Marked({ renderer: larkRendererOverrides });
  }

  /**
   * Convert raw Markdown to Lark-optimised HTML.
   */
  render(markdown: string): string {
    return this.marked.parse(markdown, { async: false }) as string;
  }

  /**
   * Render a pre-lexed token list into Lark-optimised HTML.
   */
  renderTokens(tokens: Token[] | TokensList): string {
    return this.marked.parser(tokens) as string;
  }
}

// ---------------------------------------------------------------------------
// Lark renderer overrides (RendererObject pattern)
// ---------------------------------------------------------------------------

/**
 * Renderer overrides for Lark-optimised HTML output.
 *
 * In marked v17, renderer customisation is done via a plain object whose
 * methods are bound to the internal `Renderer` instance at runtime. Each
 * method receives the full token and has access to `this.parser` for
 * recursive rendering.
 */
const larkRendererOverrides: RendererObject = {
  // ------------------------------------------------------------------
  // Block-level overrides
  // ------------------------------------------------------------------

  heading(this: Renderer, { tokens, depth }: Tokens.Heading): string {
    const text = this.parser.parseInline(tokens);
    return `<h${depth}>${text}</h${depth}>\n`;
  },

  code(this: Renderer, { text, lang }: Tokens.Code): string {
    const escaped = escapeHtml(text);
    if (lang) {
      return `<pre><code class="language-${escapeHtml(lang)}">${escaped}</code></pre>\n`;
    }
    return `<pre><code>${escaped}</code></pre>\n`;
  },

  blockquote(this: Renderer, { tokens }: Tokens.Blockquote): string {
    const body = this.parser.parse(tokens);
    return `<blockquote style="${BLOCKQUOTE_STYLE}">${body}</blockquote>\n`;
  },

  hr(): string {
    return '<hr />\n';
  },

  list(this: Renderer, token: Tokens.List): string {
    const tag = token.ordered ? 'ol' : 'ul';
    const startAttr =
      token.ordered && typeof token.start === 'number' && token.start !== 1
        ? ` start="${String(token.start)}"`
        : '';

    let body = '';
    for (const item of token.items) {
      body += this.listitem(item);
    }
    return `<${tag}${startAttr}>\n${body}</${tag}>\n`;
  },

  listitem(this: Renderer, item: Tokens.ListItem): string {
    // Lark renders better when <li> content is NOT wrapped in <p> tags.
    // For loose lists, marked produces paragraph tokens inside the list
    // item. We walk through the tokens and render paragraphs as inline
    // text (stripping the <p> wrapper) while preserving nested lists.
    let content = '';
    for (const tok of item.tokens) {
      if (tok.type === 'paragraph') {
        content += this.parser.parseInline((tok as Tokens.Paragraph).tokens);
      } else if (tok.type === 'list') {
        content += this.list(tok as Tokens.List);
      } else {
        content += this.parser.parse([tok]);
      }
    }

    // NOTE: The preprocessor converts checkbox syntax to emoji before parsing,
    // so this branch is only reached when the renderer is used directly without
    // the preprocessor (e.g., via LarkRenderer.render() or markdownToLarkHtml()).
    if (item.task) {
      const checkbox = item.checked ? '&#9745; ' : '&#9744; ';
      content = checkbox + content;
    }

    return `<li>${content}</li>\n`;
  },

  paragraph(this: Renderer, { tokens }: Tokens.Paragraph): string {
    return `<p>${this.parser.parseInline(tokens)}</p>\n`;
  },

  table(this: Renderer, token: Tokens.Table): string {
    const colCount = token.header.length;

    // Estimate each column's content width by scanning header + all body rows.
    const colMaxLen: number[] = new Array(colCount).fill(0);
    for (let i = 0; i < colCount; i++) {
      const headerText = token.header[i].text ?? '';
      colMaxLen[i] = measureTextWidth(headerText);
    }
    for (const row of token.rows) {
      for (let i = 0; i < row.length && i < colCount; i++) {
        const cellText = row[i].text ?? '';
        colMaxLen[i] = Math.max(colMaxLen[i], measureTextWidth(cellText));
      }
    }

    // Convert character widths to percentage-based column widths.
    const colWidths = computeColumnWidths(colMaxLen);

    // Build header row
    let headerCells = '';
    for (let i = 0; i < colCount; i++) {
      headerCells += renderCellWithWidth(this.parser, token.header[i], colWidths[i]);
    }

    // Build body rows
    let bodyRows = '';
    for (const row of token.rows) {
      let rowCells = '';
      for (let i = 0; i < row.length && i < colCount; i++) {
        rowCells += renderCellWithWidth(this.parser, row[i], colWidths[i]);
      }
      bodyRows += `<tr>${rowCells}</tr>\n`;
    }

    let tbody = '';
    if (bodyRows) {
      tbody = `<tbody>\n${bodyRows}</tbody>\n`;
    }

    return (
      `<table style="${TABLE_STYLE} width: 100%;">\n` +
      `<thead>\n<tr>${headerCells}</tr>\n</thead>\n` +
      tbody +
      `</table>\n`
    );
  },

  tablecell(this: Renderer, cell: Tokens.TableCell): string {
    const tag = cell.header ? 'th' : 'td';
    const alignAttr = cell.align ? ` align="${cell.align}"` : '';
    const content = this.parser.parseInline(cell.tokens);
    return `<${tag} style="${CELL_STYLE}"${alignAttr}>${content}</${tag}>`;
  },

  // ------------------------------------------------------------------
  // Inline-level overrides
  // ------------------------------------------------------------------

  strong(this: Renderer, { tokens }: Tokens.Strong): string {
    return `<strong>${this.parser.parseInline(tokens)}</strong>`;
  },

  em(this: Renderer, { tokens }: Tokens.Em): string {
    return `<em>${this.parser.parseInline(tokens)}</em>`;
  },

  codespan({ text }: Tokens.Codespan): string {
    return `<code>${text}</code>`;
  },

  del(this: Renderer, { tokens }: Tokens.Del): string {
    return `<del>${this.parser.parseInline(tokens)}</del>`;
  },

  link(this: Renderer, { href, title, tokens }: Tokens.Link): string {
    const text = this.parser.parseInline(tokens);
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    // Sanitize dangerous URI schemes before rendering.
    const safeHref = /^\s*(?:javascript|vbscript|data)\s*:/i.test(href) ? '' : escapeHtml(href);
    return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  },

  image({ href, title, text }: Tokens.Image): string {
    const altAttr = text ? ` alt="${escapeHtml(text)}"` : '';
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img src="${escapeHtml(href)}"${altAttr}${titleAttr} />`;
  },

  br(): string {
    return '<br />';
  },

  space(): string {
    return '';
  },

  html({ text }: Tokens.HTML | Tokens.Tag): string {
    // SECURITY: Raw HTML passes through here. sanitizeHtml() MUST run on final output.
    return text;
  },
};

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Pre-configured `Marked` instance that uses the Lark renderer overrides.
 */
const larkMarked = new Marked({ renderer: larkRendererOverrides });

/**
 * Render a pre-lexed token list into Lark-optimised HTML.
 *
 * @param tokens - Token array produced by `marked.lexer()` or `Lexer.lex()`.
 * @returns HTML string suitable for pasting into Lark.
 *
 * @example
 * ```ts
 * import { Lexer } from 'marked';
 * import { renderToLarkHtml } from './renderer';
 *
 * const tokens = Lexer.lex('# Hello **world**');
 * const html = renderToLarkHtml(tokens);
 * // => '<h1>Hello <strong>world</strong></h1>\n'
 * ```
 */
export function renderToLarkHtml(tokens: Token[] | TokensList): string {
  return larkMarked.parser(tokens) as string;
}

// ---------------------------------------------------------------------------
// Pre-compiled regex cache for applyStyleTemplate
// ---------------------------------------------------------------------------

/** Static regex patterns used in applyStyleTemplate for special selectors. */
const INLINE_CODE_RE = /(?<!<pre[^>]*>\s*)<code(?![^>]*class="language-)(?![^>]*style=")>/g;
const CODE_BARE_RE = /<code(?![^>]*style=")>/g;
const CODE_WITH_ATTRS_RE = /<code((?![^>]*style=")[^>]*)>/g;

/**
 * Per-tag compiled regex patterns for style injection.
 *
 * Keyed by tag name; each value is a triple of RegExp objects:
 *   [0] matches `<tag style="..."`   (replace existing style)
 *   [1] matches `<tag ...>` without style  (add style to tags with other attrs)
 *   [2] matches `<tag>`              (add style to bare tags)
 */
const tagRegexCache = new Map<string, readonly [RegExp, RegExp, RegExp]>();

/**
 * Get (or create and cache) the regex triple for a given HTML tag name.
 */
function getTagRegexes(tag: string): readonly [RegExp, RegExp, RegExp] {
  let cached = tagRegexCache.get(tag);
  if (!cached) {
    cached = [
      new RegExp(`<${tag}\\s+style="[^"]*"`, 'g'),
      new RegExp(`<${tag}((?![^>]*style=)[^>]*)>`, 'g'),
      new RegExp(`<${tag}>`, 'g'),
    ] as const;
    tagRegexCache.set(tag, cached);
  }
  return cached;
}

/**
 * Apply a style template to rendered HTML by injecting/replacing
 * inline style attributes on matching elements.
 */
function applyStyleTemplate(html: string, template: StyleTemplate): string {
  let result = html;

  // Process selectors in a controlled order: 'inline-code' must be handled
  // before the generic 'code' selector so that the inline-code style is
  // applied to standalone <code> elements before the 'code' rule would
  // overwrite them.
  const entries = Object.entries(template.styles);
  const inlineCodeEntry = entries.find(([s]) => s === 'inline-code');
  const codeEntry = entries.find(([s]) => s === 'code');
  const otherEntries = entries.filter(([s]) => s !== 'inline-code' && s !== 'code');

  // Build ordered list: inline-code first, then code, then the rest.
  const ordered: Array<[string, string]> = [];
  if (inlineCodeEntry) ordered.push(inlineCodeEntry);
  if (codeEntry) ordered.push(codeEntry);
  ordered.push(...otherEntries);

  for (const [selector, style] of ordered) {
    if (selector === 'inline-code') {
      // Special case: inline <code> elements that are NOT inside a <pre> block.
      INLINE_CODE_RE.lastIndex = 0;
      result = result.replace(INLINE_CODE_RE, `<code style="${style}">`);
      continue;
    }

    if (selector === 'code') {
      // Apply to <code> tags that do NOT already have a style attribute.
      CODE_BARE_RE.lastIndex = 0;
      result = result.replace(CODE_BARE_RE, `<code style="${style}">`);
      // Also handle <code> with a class but no style (e.g., language-tagged).
      CODE_WITH_ATTRS_RE.lastIndex = 0;
      result = result.replace(CODE_WITH_ATTRS_RE, `<code style="${style}"$1>`);
      continue;
    }

    if (selector === 'th,td') {
      // Apply to both th and td.
      for (const tag of ['th', 'td']) {
        const [replaceStyleRe, , bareTagRe] = getTagRegexes(tag);
        replaceStyleRe.lastIndex = 0;
        bareTagRe.lastIndex = 0;
        result = result.replace(replaceStyleRe, `<${tag} style="${style}"`);
        result = result.replace(bareTagRe, `<${tag} style="${style}">`);
      }
      continue;
    }

    // General case: add/replace style on matching tags.
    const tags = selector.split(',').map((s) => s.trim());
    for (const tag of tags) {
      const [replaceStyleRe, addStyleRe, bareTagRe] = getTagRegexes(tag);
      replaceStyleRe.lastIndex = 0;
      addStyleRe.lastIndex = 0;
      bareTagRe.lastIndex = 0;

      result = result.replace(replaceStyleRe, `<${tag} style="${style}"`);
      result = result.replace(addStyleRe, `<${tag} style="${style}"$1>`);
      result = result.replace(bareTagRe, `<${tag} style="${style}">`);
    }
  }

  return result;
}

/**
 * Convert raw Markdown to Lark-optimised HTML in a single call.
 *
 * This is a convenience wrapper around `Lexer.lex` + {@link renderToLarkHtml}.
 *
 * @param markdown - Raw Markdown source string.
 * @param templateName - Optional style template name ('minimal', 'enhanced',
 *   or 'document'). When provided, inline styles from the template are
 *   applied as a post-processing step.
 * @returns HTML string suitable for pasting into Lark.
 *
 * @example
 * ```ts
 * import { markdownToLarkHtml } from './renderer';
 *
 * const html = markdownToLarkHtml('# Hello **world**');
 * // => '<h1>Hello <strong>world</strong></h1>\n'
 *
 * const styled = markdownToLarkHtml('# Hello', 'enhanced');
 * // => heading with enhanced inline styles
 * ```
 */
export function markdownToLarkHtml(markdown: string, templateName?: string): string {
  let html = larkMarked.parse(markdown, { async: false }) as string;

  // Apply style template overrides if specified.
  if (templateName) {
    const template = getStyleTemplate(templateName);
    html = applyStyleTemplate(html, template);
  }

  return html;
}
