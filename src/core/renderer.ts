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
  Renderer,
  type Token,
  type TokensList,
  type Tokens,
  type RendererObject,
} from 'marked';

import { getStyleTemplate } from './styles.js';
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
// Inline style constants
// ---------------------------------------------------------------------------

const TABLE_STYLE = 'border-collapse: collapse;';
const CELL_STYLE = 'border: 1px solid #d9d9d9; padding: 8px;';
const BLOCKQUOTE_STYLE =
  'border-left: 4px solid #d9d9d9; padding-left: 16px; color: #666;';

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
      token.ordered && token.start !== 1 && token.start !== ''
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
        content += this.parser.parseInline(
          (tok as Tokens.Paragraph).tokens,
        );
      } else if (tok.type === 'list') {
        content += this.list(tok as Tokens.List);
      } else {
        content += this.parser.parse([tok]);
      }
    }

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
    // Build header row
    let headerCells = '';
    for (const cell of token.header) {
      headerCells += this.tablecell(cell);
    }

    // Build body rows
    let bodyRows = '';
    for (const row of token.rows) {
      let rowCells = '';
      for (const cell of row) {
        rowCells += this.tablecell(cell);
      }
      bodyRows += `<tr>${rowCells}</tr>\n`;
    }

    let tbody = '';
    if (bodyRows) {
      tbody = `<tbody>\n${bodyRows}</tbody>\n`;
    }

    return (
      `<table style="${TABLE_STYLE}">\n` +
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
    return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank">${text}</a>`;
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
  const otherEntries = entries.filter(
    ([s]) => s !== 'inline-code' && s !== 'code',
  );

  // Build ordered list: inline-code first, then code, then the rest.
  const ordered: Array<[string, string]> = [];
  if (inlineCodeEntry) ordered.push(inlineCodeEntry);
  if (codeEntry) ordered.push(codeEntry);
  ordered.push(...otherEntries);

  for (const [selector, style] of ordered) {
    if (selector === 'inline-code') {
      // Special case: inline <code> elements that are NOT inside a <pre> block.
      // We match bare <code> tags (without an existing style or language class).
      result = result.replace(
        /(?<!<pre[^>]*>\s*)<code(?![^>]*class="language-)(?![^>]*style=")>/g,
        `<code style="${style}">`,
      );
      continue;
    }

    if (selector === 'code') {
      // Apply to <code> tags that do NOT already have a style attribute
      // (i.e., those not already styled by the inline-code rule).
      // This targets <code> inside <pre> blocks and any others missed.
      result = result.replace(
        /<code(?![^>]*style=")>/g,
        `<code style="${style}">`,
      );
      // Also handle <code> with a class but no style (e.g., language-tagged).
      result = result.replace(
        /<code((?![^>]*style=")[^>]*)>/g,
        `<code style="${style}"$1>`,
      );
      continue;
    }

    if (selector === 'th,td') {
      // Apply to both th and td.
      for (const tag of ['th', 'td']) {
        // Replace existing style attribute.
        result = result.replace(
          new RegExp(`<${tag}\\s+style="[^"]*"`, 'g'),
          `<${tag} style="${style}"`,
        );
        // Add style to bare tags.
        result = result.replace(
          new RegExp(`<${tag}>`, 'g'),
          `<${tag} style="${style}">`,
        );
      }
      continue;
    }

    // General case: add/replace style on matching tags.
    const tags = selector.split(',').map((s) => s.trim());
    for (const tag of tags) {
      // Replace existing style attribute.
      result = result.replace(
        new RegExp(`<${tag}\\s+style="[^"]*"`, 'g'),
        `<${tag} style="${style}"`,
      );
      // Add style to tags without one (but with other attributes).
      result = result.replace(
        new RegExp(`<${tag}(\\s+(?!style)[^>]*)>`, 'g'),
        `<${tag} style="${style}"$1>`,
      );
      // Add style to bare tags.
      result = result.replace(
        new RegExp(`<${tag}>`, 'g'),
        `<${tag} style="${style}">`,
      );
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
export function markdownToLarkHtml(
  markdown: string,
  templateName?: string,
): string {
  let html = larkMarked.parse(markdown, { async: false }) as string;

  // Apply style template overrides if specified.
  if (templateName) {
    const template = getStyleTemplate(templateName);
    html = applyStyleTemplate(html, template);
  }

  return html;
}
