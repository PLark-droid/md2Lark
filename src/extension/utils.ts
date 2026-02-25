/**
 * md2Lark Chrome Extension - Shared utility functions.
 */

/**
 * Strip HTML tags to produce a plain-text representation.
 *
 * Uses the browser's built-in DOMParser so that entities are decoded
 * correctly and nested structures are flattened to text content.
 */
export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}
