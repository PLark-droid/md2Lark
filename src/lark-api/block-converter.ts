/**
 * Markdown to Lark DocX Block converter.
 *
 * Uses the `marked` lexer to tokenise Markdown and converts each token
 * into one or more Lark DocX blocks suitable for the Block API.
 *
 * @module block-converter
 */

import { Lexer, type Token, type Tokens } from 'marked';
import type { LarkBlock, LarkBlockType, TextElement, TextStyle } from './types.js';
import { buildTableStructure, type TableStructure } from './table-builder.js';

// ---------------------------------------------------------------------------
// Language ID mapping
// ---------------------------------------------------------------------------

const LANGUAGE_MAP: Record<string, number> = {
  plaintext: 1,
  bash: 3,
  shell: 3,
  sh: 3,
  c: 6,
  cpp: 7,
  'c++': 7,
  csharp: 8,
  'c#': 8,
  cs: 8,
  css: 10,
  go: 14,
  golang: 14,
  html: 16,
  java: 18,
  javascript: 19,
  js: 19,
  json: 21,
  kotlin: 24,
  kt: 24,
  markdown: 35,
  md: 35,
  php: 48,
  python: 49,
  py: 49,
  ruby: 54,
  rb: 54,
  rust: 55,
  rs: 55,
  sql: 62,
  swift: 65,
  typescript: 69,
  ts: 69,
  yaml: 80,
  yml: 80,
};

/**
 * Map a language name to the Lark code-block language identifier.
 *
 * @param lang - Language name (case-insensitive).
 * @returns Numeric language ID recognised by Lark. Defaults to 1 (plaintext).
 */
export function getCodeLanguageId(lang: string): number {
  if (!lang) return 1;
  return LANGUAGE_MAP[lang.toLowerCase()] ?? 1;
}

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
        // Use the link text content directly rather than recursing into child
        // tokens, since the link itself is the styled unit.
        const linkText = t.tokens
          ? flattenInlineText(t.tokens)
          : t.text;
        elements.push(makeTextElement(linkText, style));
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
// Token conversion
// ---------------------------------------------------------------------------

/** Heading depth to LarkBlockType mapping. */
const HEADING_BLOCK_TYPE: Record<number, LarkBlockType> = {
  1: 3,
  2: 4,
  3: 5,
  4: 6,
  5: 7,
  6: 8,
};

/** Heading depth to block property name mapping. */
const HEADING_PROP: Record<number, string> = {
  1: 'heading1',
  2: 'heading2',
  3: 'heading3',
  4: 'heading4',
  5: 'heading5',
  6: 'heading6',
};

/**
 * Result that may include ancillary table structure data alongside the blocks.
 */
export interface ConvertedBlock {
  blocks: LarkBlock[];
  tableStructures?: TableStructure[];
}

/**
 * Convert a single `marked` token to one or more {@link LarkBlock}s.
 *
 * @param token - A top-level token from `marked.Lexer.lex()`.
 * @returns A {@link ConvertedBlock} containing blocks and optional table data,
 *          or `null` if the token should be skipped.
 */
export function convertToken(token: Token): ConvertedBlock | null {
  switch (token.type) {
    case 'heading': {
      const t = token as Tokens.Heading;
      const depth = Math.min(Math.max(t.depth, 1), 6);
      const blockType = HEADING_BLOCK_TYPE[depth];
      const prop = HEADING_PROP[depth];
      const elements = parseInlineTokens(t.tokens);
      const block: LarkBlock = {
        block_type: blockType,
        [prop]: { elements },
      } as LarkBlock;
      return { blocks: [block] };
    }

    case 'paragraph': {
      const t = token as Tokens.Paragraph;
      const elements = parseInlineTokens(t.tokens);
      return {
        blocks: [{
          block_type: 2,
          text: { elements },
        }],
      };
    }

    case 'code': {
      const t = token as Tokens.Code;
      const languageId = getCodeLanguageId(t.lang ?? '');
      const elements: TextElement[] = [
        makeTextElement(t.text, {}),
      ];
      return {
        blocks: [{
          block_type: 15,
          code: { elements, language: languageId },
        }],
      };
    }

    case 'blockquote': {
      const t = token as Tokens.Blockquote;
      // Extract inline content from blockquote children.
      const elements = extractBlockquoteElements(t.tokens);
      return {
        blocks: [{
          block_type: 14,
          quote: { elements },
        }],
      };
    }

    case 'list': {
      const t = token as Tokens.List;
      const blockType: LarkBlockType = t.ordered ? 13 : 12;
      const prop = t.ordered ? 'ordered' : 'bullet';
      const blocks: LarkBlock[] = t.items.map((item) => {
        const elements = extractListItemElements(item);
        return {
          block_type: blockType,
          [prop]: { elements },
        } as LarkBlock;
      });
      return { blocks };
    }

    case 'hr': {
      return {
        blocks: [{
          block_type: 22,
          divider: {},
        }],
      };
    }

    case 'table': {
      const t = token as Tokens.Table;
      const structure = buildTableStructure(t);
      return {
        blocks: [structure.tableBlock],
        tableStructures: [structure],
      };
    }

    case 'space': {
      return null;
    }

    default: {
      // Unknown token type -- skip.
      return null;
    }
  }
}

/**
 * Convert an array of `marked` tokens into an array of Lark blocks.
 *
 * @param tokens - Top-level tokens from `marked.Lexer.lex()`.
 * @returns Object containing all converted blocks and any table structures.
 */
export function convertTokens(tokens: Token[]): ConvertedBlock {
  const allBlocks: LarkBlock[] = [];
  const allTableStructures: TableStructure[] = [];

  for (const token of tokens) {
    const result = convertToken(token);
    if (result) {
      allBlocks.push(...result.blocks);
      if (result.tableStructures) {
        allTableStructures.push(...result.tableStructures);
      }
    }
  }

  return {
    blocks: allBlocks,
    tableStructures: allTableStructures.length > 0 ? allTableStructures : undefined,
  };
}

/**
 * Convert a Markdown string into an array of Lark DocX blocks.
 *
 * This is the primary entry point for the block converter.
 *
 * @param markdown - Raw markdown source string.
 * @returns Array of {@link LarkBlock} objects.
 */
export function markdownToLarkBlocks(markdown: string): LarkBlock[] {
  const tokens = Lexer.lex(markdown);
  return convertTokens(tokens).blocks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a single {@link TextElement} with the given content and style.
 */
function makeTextElement(content: string, style: TextStyle): TextElement {
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
function flattenInlineText(tokens: Token[]): string {
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

/**
 * Extract TextElements from blockquote child tokens.
 *
 * Blockquotes contain paragraph tokens as children; we extract their
 * inline elements.
 */
function extractBlockquoteElements(tokens: Token[]): TextElement[] {
  const elements: TextElement[] = [];
  for (const child of tokens) {
    if (child.type === 'paragraph') {
      const p = child as Tokens.Paragraph;
      elements.push(...parseInlineTokens(p.tokens));
    } else if (child.type === 'text') {
      const t = child as Tokens.Text;
      if (t.tokens && t.tokens.length > 0) {
        elements.push(...parseInlineTokens(t.tokens));
      } else {
        elements.push(makeTextElement(t.text, {}));
      }
    }
  }
  return elements;
}

/**
 * Extract TextElements from a list item token.
 *
 * List items may contain nested text tokens with their own inline children.
 */
function extractListItemElements(item: Tokens.ListItem): TextElement[] {
  const elements: TextElement[] = [];
  for (const child of item.tokens) {
    if (child.type === 'text') {
      const t = child as Tokens.Text;
      if (t.tokens && t.tokens.length > 0) {
        elements.push(...parseInlineTokens(t.tokens));
      } else {
        elements.push(makeTextElement(t.text, {}));
      }
    } else if (child.type === 'paragraph') {
      const p = child as Tokens.Paragraph;
      elements.push(...parseInlineTokens(p.tokens));
    }
  }
  return elements;
}
