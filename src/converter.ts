import type { ConvertOptions, ConvertResult, LarkDocument } from './types';
import { parseMarkdown } from './core/parser';
import { renderToLarkHtml } from './core/renderer';
import { sanitizeHtml } from './core/sanitizer';

/**
 * Strip HTML tags from a string to produce plain text.
 *
 * @param html - HTML string to strip.
 * @returns Plain text with tags removed and consecutive whitespace collapsed.
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Count words in a plain text string.
 *
 * Handles both Latin/ASCII words (split on whitespace) and CJK characters
 * (each CJK character counts as one word).
 *
 * @param text - Plain text string.
 * @returns Approximate word count.
 */
function countWords(text: string): number {
  if (!text.trim()) {
    return 0;
  }

  // CJK Unicode ranges: CJK Unified Ideographs, Hiragana, Katakana, etc.
  const cjkRegex = /[\u3000-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]/gu;
  const cjkMatches = text.match(cjkRegex);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;

  // Remove CJK characters, then count Latin words by splitting on whitespace.
  const withoutCjk = text.replace(cjkRegex, ' ');
  const latinWords = withoutCjk.split(/\s+/).filter((w) => w.length > 0);

  return latinWords.length + cjkCount;
}

/**
 * Extract the first heading text from markdown source.
 *
 * Looks for a level-1 or level-2 ATX heading (`# ...` or `## ...`).
 *
 * @param markdown - Raw markdown source.
 * @returns The heading text, or `undefined` if none was found.
 */
function extractTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#{1,2}\s+(.+)$/m);
  return match ? match[1].trim() : undefined;
}

/**
 * Convert markdown to Lark-optimised HTML.
 *
 * This is the primary conversion API. It runs the full pipeline:
 * 1. Parse markdown into tokens (via `marked` lexer)
 * 2. Render tokens to Lark-optimised HTML
 * 3. Sanitize HTML (strip scripts, event handlers, javascript: URLs)
 * 4. Generate plain-text fallback
 * 5. Collect document metadata
 *
 * @param options - Conversion options (markdown source and optional title).
 * @returns A {@link ConvertResult} with the HTML, plain text, and metadata.
 *
 * @example
 * ```ts
 * const result = convertToHtml({ markdown: '# Hello\n\nWorld' });
 * console.log(result.html);      // '<h1>Hello</h1>\n<p>World</p>\n'
 * console.log(result.plainText); // 'Hello\nWorld'
 * ```
 */
export function convertToHtml(options: ConvertOptions): ConvertResult {
  const { markdown, title } = options;

  // Step 1: Parse
  const parseResult = parseMarkdown(markdown);

  // Step 2: Render
  const rawHtml = renderToLarkHtml(parseResult.tokens);

  // Step 3: Sanitize
  const html = sanitizeHtml(rawHtml);

  // Step 4: Plain text
  const plainText = stripHtmlTags(html);

  // Step 5: Metadata
  const resolvedTitle = title ?? extractTitle(markdown) ?? 'Untitled';
  const wordCount = countWords(plainText);

  return {
    html,
    plainText,
    metadata: {
      title: resolvedTitle,
      wordCount,
      hasCodeBlocks: parseResult.metadata.hasCodeBlocks,
      languages: parseResult.metadata.languages,
      hasTables: parseResult.metadata.hasTables,
      hasImages: parseResult.metadata.hasImages,
    },
  };
}

/**
 * Convert markdown to Lark document format.
 *
 * This is the legacy API kept for backward compatibility. It returns a
 * {@link LarkDocument} augmented with an `html` field from the new pipeline.
 *
 * @param options - Conversion options.
 * @returns A LarkDocument with an additional `html` property.
 */
export function convert(options: ConvertOptions): LarkDocument & { html: string } {
  const { markdown, title = 'Untitled' } = options;
  const result = convertToHtml(options);

  return {
    title,
    content: [
      {
        blockType: 'paragraph',
        body: { text: markdown },
      },
    ],
    html: result.html,
  };
}
