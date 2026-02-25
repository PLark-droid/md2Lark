/**
 * md2Lark Chrome Extension - Content script.
 *
 * This script is injected into the active tab by the background service worker
 * when the user presses the keyboard shortcut (Ctrl+Shift+L / Cmd+Shift+L).
 *
 * It listens for a `convert-and-copy` message from the background script,
 * converts the supplied Markdown to Lark-optimised HTML, and writes both the
 * rich HTML and a plain-text fallback to the clipboard.
 *
 * Because this file is bundled by esbuild with `bundle: true`, the core
 * renderer, sanitizer, and clipboard helper are all inlined -- no external
 * imports are needed at runtime.
 */

import { markdownToLarkHtml } from '../core/renderer.js';
import { sanitizeHtml } from '../core/sanitizer.js';
import { copyHtmlToClipboard } from './clipboard.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags to produce a plain-text representation.
 *
 * Uses the browser's built-in DOMParser so that entities are decoded
 * correctly and nested structures are flattened to text content.
 */
function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

/**
 * Convert a Markdown string to Lark HTML and copy it to the clipboard.
 *
 * @param markdown - Raw Markdown source text selected by the user.
 */
async function handleConvertAndCopy(markdown: string): Promise<void> {
  // 1. Convert Markdown to Lark-optimised HTML.
  const rawHtml = markdownToLarkHtml(markdown);

  // 2. Sanitize the output to remove XSS vectors.
  const safeHtml = sanitizeHtml(rawHtml);

  // 3. Derive a plain-text fallback.
  const plainText = htmlToPlainText(safeHtml);

  // 4. Write both representations to the clipboard.
  await copyHtmlToClipboard(safeHtml, plainText);
}

/**
 * Listen for messages from the background service worker.
 *
 * Expected message shape:
 * ```json
 * { "type": "convert-and-copy", "markdown": "..." }
 * ```
 *
 * Responds with `{ success: true }` on success or
 * `{ success: false, error: "..." }` on failure.
 */
chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: { success: boolean; error?: string }) => void,
  ) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      (message as { type?: string }).type !== 'convert-and-copy'
    ) {
      return;
    }

    const markdown = (message as { markdown?: string }).markdown ?? '';

    handleConvertAndCopy(markdown)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err: unknown) => {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error during conversion';
        sendResponse({ success: false, error: errorMessage });
      });

    // Return true to indicate we will respond asynchronously.
    return true;
  },
);
