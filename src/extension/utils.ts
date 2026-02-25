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

/**
 * Create a debounced version of a function.
 *
 * The returned function delays invoking `fn` until after `ms` milliseconds
 * have elapsed since the last time the debounced function was called.
 *
 * @param fn - The function to debounce.
 * @param ms - The debounce delay in milliseconds.
 * @returns A debounced wrapper around `fn`.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  return (...args: A): void => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      fn(...args);
    }, ms);
  };
}
