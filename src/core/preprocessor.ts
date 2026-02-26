/**
 * md2Lark - Markdown Preprocessor
 *
 * Normalizes Markdown input before parsing to handle edge cases
 * common in AI-generated output.
 *
 * @module core/preprocessor
 */

/**
 * Normalize consecutive blank lines (3+ newlines to 2).
 *
 * AI-generated markdown often contains excessive blank lines that create
 * unwanted whitespace in the rendered output.
 *
 * @param markdown - Raw markdown string.
 * @returns Markdown with consecutive blank lines reduced.
 */
function normalizeBlankLines(markdown: string): string {
  return markdown.replace(/\n{3,}/g, '\n\n');
}

/**
 * Convert LaTeX math expressions to code-styled fallback.
 *
 * Lark does not natively render LaTeX math, so we convert:
 * - Display math `$$...$$` to fenced code block with "math" language tag
 * - Inline math `$...$` to inline code
 *
 * Must run before the Markdown parser sees the content since `$` is not
 * standard Markdown syntax.
 *
 * @param markdown - Raw markdown string.
 * @returns Markdown with math expressions converted to code.
 */
function convertLatexToCodeFallback(markdown: string): string {
  // Display math: $$...$$ -> ```math\n...\n```
  let result = markdown.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_match, expr: string) => `\`\`\`math\n${expr.trim()}\n\`\`\``,
  );

  // Inline math: $...$ -> `...`
  // Be careful not to match monetary values like "$10" or "$5.00".
  // Only match when there is non-numeric, non-space content.
  result = result.replace(
    /(?<![\\$])\$([^\s$](?:[^$]*?[^\s$])?)\$(?!\d)/g,
    (_match, expr: string) => `\`${expr}\``,
  );

  return result;
}

/**
 * Convert checkbox syntax to Unicode check marks.
 *
 * - `- [x]` or `- [X]` becomes `- checkmark-emoji`
 * - `- [ ]` becomes `- empty-box-emoji`
 *
 * This ensures the check state is visually clear in Lark, which does not
 * natively support Markdown checkboxes.
 *
 * @param markdown - Raw markdown string.
 * @returns Markdown with checkbox syntax replaced by emoji.
 */
function convertCheckboxes(markdown: string): string {
  let result = markdown.replace(/^(\s*[-*+]\s)\[x\]/gim, '$1\u2705');
  result = result.replace(/^(\s*[-*+]\s)\[ \]/gm, '$1\u2B1C');
  return result;
}

/**
 * Convert footnote references to inline parenthetical notes.
 *
 * Finds footnote definitions like `[^1]: Some text` and replaces
 * references `[^1]` with `(*Some text*)` inline.
 *
 * This is a best-effort transformation since Lark does not support footnotes.
 *
 * @param markdown - Raw markdown string.
 * @returns Markdown with footnotes expanded inline.
 */
function expandFootnotes(markdown: string): string {
  // 1. Extract footnote definitions.
  const footnotes = new Map<string, string>();
  const withoutDefs = markdown.replace(
    /^\[\^(\w+)\]:\s*(.+)$/gm,
    (_match, id: string, text: string) => {
      footnotes.set(id, text.trim());
      return '';
    },
  );

  if (footnotes.size === 0) return markdown;

  // 2. Replace references with inline notes.
  let result = withoutDefs;
  for (const [id, text] of footnotes) {
    const refPattern = new RegExp(`\\[\\^${id}\\]`, 'g');
    result = result.replace(refPattern, `(*${text}*)`);
  }

  return result;
}

/**
 * Apply all preprocessor transformations in sequence.
 *
 * The order matters:
 * 1. Normalize blank lines (reduces noise)
 * 2. Convert LaTeX math (before parser misinterprets `$`)
 * 3. Convert checkboxes (visual representation for Lark)
 * 4. Expand footnotes (inline them before parsing)
 *
 * @param markdown - Raw markdown input.
 * @returns Preprocessed markdown ready for the parser.
 */
export function preprocessMarkdown(markdown: string): string {
  // Protect fenced code blocks from modification.
  const codeBlocks: string[] = [];
  let result = markdown.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `\x00CODEBLOCK${codeBlocks.length - 1}\x00`;
  });

  // Protect inline code (single backtick) from modification.
  result = result.replace(/`[^`]+`/g, (match) => {
    codeBlocks.push(match);
    return `\x00CODEBLOCK${codeBlocks.length - 1}\x00`;
  });

  // Apply transformations on unprotected text.
  result = normalizeBlankLines(result);
  result = convertLatexToCodeFallback(result);
  result = convertCheckboxes(result);
  result = expandFootnotes(result);

  // Restore code blocks.
  result = result.replace(/\x00CODEBLOCK(\d+)\x00/g, (_match, idx: string) => {
    return codeBlocks[parseInt(idx, 10)];
  });

  return result;
}
