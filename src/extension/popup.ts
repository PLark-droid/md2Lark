/**
 * md2Lark Chrome Extension - Popup entry point.
 *
 * Handles user interaction: reads Markdown from the textarea, converts it
 * to Lark-optimised HTML via the core renderer, sanitizes the output, and
 * copies both HTML and plain-text representations to the clipboard.
 */

import { markdownToLarkHtml } from '../core/renderer.js';
import { sanitizeHtml } from '../core/sanitizer.js';
import { copyHtmlToClipboard } from './clipboard.js';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const input = document.getElementById(
  'markdown-input',
) as HTMLTextAreaElement | null;
const convertBtn = document.getElementById(
  'convert-btn',
) as HTMLButtonElement | null;
const statusEl = document.getElementById('status') as HTMLDivElement | null;

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

/**
 * Show a status message for a limited duration.
 */
function showStatus(
  message: string,
  kind: 'success' | 'error',
  durationMs = 2000,
): void {
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = `status status--${kind}`;

  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'status';
  }, durationMs);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handleConvert(): Promise<void> {
  if (!input) return;

  const markdown = input.value.trim();
  if (markdown.length === 0) {
    showStatus('Please enter some Markdown first.', 'error');
    return;
  }

  // Disable the button while processing to prevent double-clicks.
  if (convertBtn) convertBtn.disabled = true;

  try {
    // 1. Convert Markdown to Lark-optimised HTML.
    const rawHtml = markdownToLarkHtml(markdown);

    // 2. Sanitize the output to remove XSS vectors.
    const safeHtml = sanitizeHtml(rawHtml);

    // 3. Derive a plain-text fallback.
    const plainText = htmlToPlainText(safeHtml);

    // 4. Write both representations to the clipboard.
    await copyHtmlToClipboard(safeHtml, plainText);

    showStatus('Copied!', 'success');
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'An unknown error occurred.';
    showStatus(message, 'error', 4000);
  } finally {
    if (convertBtn) convertBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

if (convertBtn) {
  convertBtn.addEventListener('click', () => {
    void handleConvert();
  });
}

// Allow Ctrl+Enter / Cmd+Enter as a keyboard shortcut within the textarea.
if (input) {
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void handleConvert();
    }
  });
}
