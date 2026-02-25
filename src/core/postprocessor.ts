/**
 * md2Lark - HTML Postprocessor
 *
 * Applies post-conversion transformations to the rendered HTML
 * for better Lark compatibility.
 *
 * @module core/postprocessor
 */

/**
 * Wrap `<table>` elements in a scrollable container div.
 *
 * Very wide tables (common in AI-generated output with many columns) can
 * overflow the Lark editor viewport. Wrapping in `overflow-x: auto` allows
 * horizontal scrolling without breaking the layout.
 *
 * @param html - HTML string potentially containing `<table>` elements.
 * @returns HTML with tables wrapped in overflow containers.
 */
function wrapTablesForOverflow(html: string): string {
  return html
    .replace(
      /<table/g,
      '<div style="overflow-x: auto; max-width: 100%;"><table',
    )
    .replace(/<\/table>/g, '</table></div>');
}

/**
 * Apply all postprocessor transformations in sequence.
 *
 * @param html - HTML string from the renderer/sanitizer.
 * @returns Post-processed HTML optimized for Lark.
 */
export function postprocessHtml(html: string): string {
  let result = html;
  result = wrapTablesForOverflow(result);
  return result;
}
