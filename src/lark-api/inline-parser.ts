/**
 * Inline token parser for Lark DocX blocks.
 *
 * Extracted from `block-converter.ts` to break the circular dependency
 * between `block-converter.ts` and `table-builder.ts`. Both modules now
 * import from this shared module instead of from each other.
 *
 * Dependency graph (no cycles):
 *   block-converter.ts  -->  inline-parser.ts  <--  table-builder.ts
 *
 * @module inline-parser
 */

import type { Token, Tokens } from 'marked';
import type { TextElement, TextStyle } from './types.js';

// ---------------------------------------------------------------------------
// Inline token parsing
// ---------------------------------------------------------------------------

/**
 * Convert an array of inline `marked` tokens into Lark {@link TextElement}s.
 *
 * Handles nested styles (e.g. bold wrapping italic) by merging the parent
 * style into each child element.
 *
 * @param tokens - Inline tokens produced by the marked lexer.
 * @param parentStyle - Style inherited from a parent inline token.
 * @returns Array of TextElement objects.
 */
export function parseInlineTokens(
  tokens: Token[],
  parentStyle: TextStyle = {},
): TextElement[] {
  const elements: TextElement[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text;
        // Some `text` tokens have nested `tokens` (e.g. inside list items).
        if (t.tokens && t.tokens.length > 0) {
          elements.push(...parseInlineTokens(t.tokens, parentStyle));
        } else {
          elements.push(makeTextElement(t.text, parentStyle));
        }
        break;
      }

      case 'strong': {
        const t = token as Tokens.Strong;
        const style: TextStyle = { ...parentStyle, bold: true };
        elements.push(...parseInlineTokens(t.tokens, style));
        break;
      }

      case 'em': {
        const t = token as Tokens.Em;
        const style: TextStyle = { ...parentStyle, italic: true };
        elements.push(...parseInlineTokens(t.tokens, style));
        break;
      }

      case 'del': {
        const t = token as Tokens.Del;
        const style: TextStyle = { ...parentStyle, strikethrough: true };
        elements.push(...parseInlineTokens(t.tokens, style));
        break;
      }

      case 'codespan': {
        const t = token as Tokens.Codespan;
        const style: TextStyle = { ...parentStyle, code_inline: true };
        elements.push(makeTextElement(t.text, style));
        break;
      }

      case 'link': {
        const t = token as Tokens.Link;
        const style: TextStyle = { ...parentStyle, link: { url: t.href } };
        // Recurse into child tokens so nested styles (bold, italic, etc.)
        // are preserved, with the link style applied to each child element.
        if (t.tokens && t.tokens.length > 0) {
          elements.push(...parseInlineTokens(t.tokens, style));
        } else {
          elements.push(makeTextElement(t.text, style));
        }
        break;
      }

      case 'br': {
        elements.push(makeTextElement('\n', parentStyle));
        break;
      }

      case 'escape': {
        const t = token as Tokens.Escape;
        elements.push(makeTextElement(t.text, parentStyle));
        break;
      }

      default: {
        // Fallback: render as plain text using `raw`.
        const raw = (token as { raw?: string }).raw ?? '';
        if (raw) {
          elements.push(makeTextElement(raw, parentStyle));
        }
        break;
      }
    }
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a single {@link TextElement} with the given content and style.
 */
export function makeTextElement(content: string, style: TextStyle): TextElement {
  const element: TextElement = {
    text_run: {
      content,
    },
  };

  const appliedStyle = buildAppliedStyle(style);
  if (appliedStyle && Object.keys(appliedStyle).length > 0) {
    element.text_run!.text_element_style = appliedStyle;
  }

  return element;
}

/**
 * Build a TextStyle object, omitting falsy / empty values.
 */
function buildAppliedStyle(style: TextStyle): TextStyle | undefined {
  const result: TextStyle = {};
  let hasAny = false;

  if (style.bold) {
    result.bold = true;
    hasAny = true;
  }
  if (style.italic) {
    result.italic = true;
    hasAny = true;
  }
  if (style.strikethrough) {
    result.strikethrough = true;
    hasAny = true;
  }
  if (style.underline) {
    result.underline = true;
    hasAny = true;
  }
  if (style.code_inline) {
    result.code_inline = true;
    hasAny = true;
  }
  if (style.link) {
    result.link = { url: style.link.url };
    hasAny = true;
  }

  return hasAny ? result : undefined;
}

/**
 * Flatten inline tokens into a single plain-text string.
 */
export function flattenInlineText(tokens: Token[]): string {
  let text = '';
  for (const t of tokens) {
    if (t.type === 'text') {
      text += (t as Tokens.Text).text;
    } else if ('tokens' in t && Array.isArray((t as { tokens: Token[] }).tokens)) {
      text += flattenInlineText((t as { tokens: Token[] }).tokens);
    } else if ('text' in t) {
      text += (t as { text: string }).text;
    }
  }
  return text;
}
