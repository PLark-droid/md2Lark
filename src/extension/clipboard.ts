/**
 * Clipboard helper for writing HTML + plain text to the system clipboard.
 *
 * Uses the async Clipboard API (`navigator.clipboard.write`) to place both
 * `text/html` and `text/plain` representations on the clipboard. This allows
 * Lark (Feishu) to pick up the rich HTML version when pasting while other
 * applications can fall back to the plain text version.
 */

/**
 * Write HTML and plain-text representations to the clipboard simultaneously.
 *
 * @param html      - The HTML string to place on the clipboard.
 * @param plainText - The plain-text fallback string.
 * @throws {Error} If the Clipboard API is not available or the write fails.
 *
 * @example
 * ```ts
 * await copyHtmlToClipboard('<h1>Hello</h1>', 'Hello');
 * ```
 */
export async function copyHtmlToClipboard(
  html: string,
  plainText: string,
): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== 'function'
  ) {
    throw new Error(
      'Clipboard API is not available. Ensure you are running in a secure (HTTPS) browser context.',
    );
  }

  const htmlBlob = new Blob([html], { type: 'text/html' });
  const textBlob = new Blob([plainText], { type: 'text/plain' });

  const clipboardItem = new ClipboardItem({
    'text/html': htmlBlob,
    'text/plain': textBlob,
  });

  await navigator.clipboard.write([clipboardItem]);
}
