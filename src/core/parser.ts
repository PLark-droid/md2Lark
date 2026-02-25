/**
 * Markdown parser module.
 *
 * Tokenizes Markdown source into a structured token tree using the `marked`
 * lexer and extracts document-level metadata (code blocks, languages, tables,
 * images) in a single pass over the token tree.
 *
 * @module core/parser
 */
import { marked } from 'marked';
import type { Token, Tokens } from 'marked';
import type { ParserOptions, ParseResult, ParseMetadata } from './types.js';

/**
 * Walk a token tree depth-first, invoking `visitor` on every token.
 *
 * The function handles the various child-token shapes that `marked` uses
 * (`tokens`, `items`, `rows`, `header`) so callers do not need to know
 * about the internal structure of each token type.
 */
function walkTokens(
  tokens: Token[],
  visitor: (token: Token) => void,
): void {
  for (const token of tokens) {
    visitor(token);

    // Recurse into child tokens depending on the token shape.
    if ('tokens' in token && Array.isArray(token.tokens)) {
      walkTokens(token.tokens, visitor);
    }

    if ('items' in token && Array.isArray(token.items)) {
      // List -> ListItem[]
      walkTokens(token.items as Token[], visitor);
    }

    if (token.type === 'table') {
      const table = token as Tokens.Table;
      // Walk header cells
      for (const cell of table.header) {
        if (cell.tokens) {
          walkTokens(cell.tokens, visitor);
        }
      }
      // Walk body row cells
      for (const row of table.rows) {
        for (const cell of row) {
          if (cell.tokens) {
            walkTokens(cell.tokens, visitor);
          }
        }
      }
    }
  }
}

/**
 * Extract metadata from a token tree.
 *
 * Performs a single depth-first walk, collecting:
 * - Whether code blocks exist and what languages they declare
 * - Whether tables exist
 * - Whether images exist
 */
function extractMetadata(tokens: Token[]): ParseMetadata {
  let hasCodeBlocks = false;
  const languageSet = new Set<string>();
  let hasTables = false;
  let hasImages = false;

  walkTokens(tokens, (token) => {
    switch (token.type) {
      case 'code': {
        hasCodeBlocks = true;
        const lang = (token as Tokens.Code).lang;
        if (lang) {
          languageSet.add(lang);
        }
        break;
      }
      case 'table':
        hasTables = true;
        break;
      case 'image':
        hasImages = true;
        break;
      default:
        break;
    }
  });

  return {
    hasCodeBlocks,
    languages: Array.from(languageSet),
    hasTables,
    hasImages,
  };
}

/**
 * Parse a Markdown string into a structured token tree with metadata.
 *
 * Uses the `marked` lexer under the hood. GFM is enabled by default so
 * that tables, strikethrough, and other GitHub-flavored extensions are
 * recognized out of the box.
 *
 * @param markdown - The Markdown source to parse. Empty / whitespace-only
 *   strings are handled gracefully and produce an empty token list with
 *   all metadata flags set to `false`.
 * @param options  - Optional parser configuration.
 * @returns A {@link ParseResult} containing the token tree and extracted
 *   metadata.
 *
 * @example
 * ```ts
 * const result = parseMarkdown('# Hello\n\nWorld');
 * console.log(result.tokens[0].type); // 'heading'
 * ```
 */
export function parseMarkdown(
  markdown: string,
  options?: ParserOptions,
): ParseResult {
  // Normalise falsy / non-string inputs to the empty string so the lexer
  // never receives `undefined` or `null`.
  const source: string =
    typeof markdown === 'string' ? markdown : '';

  // When the input is empty or whitespace-only, short-circuit to avoid
  // running the lexer on content that would only produce space tokens.
  if (source.trim().length === 0) {
    return {
      tokens: [],
      metadata: {
        hasCodeBlocks: false,
        languages: [],
        hasTables: false,
        hasImages: false,
      },
    };
  }

  const gfm = options?.gfm ?? true;
  const breaks = options?.breaks ?? false;

  const tokens = marked.lexer(source, { gfm, breaks });
  const metadata = extractMetadata(tokens as Token[]);

  return {
    tokens: tokens as Token[],
    metadata,
  };
}
