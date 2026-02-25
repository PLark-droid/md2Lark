/**
 * md2Lark Chrome Extension - Popup entry point.
 *
 * Handles user interaction: reads Markdown from the textarea, converts it
 * to Lark-optimised HTML via the core renderer, sanitizes the output, and
 * copies both HTML and plain-text representations to the clipboard.
 *
 * Provides real-time preview with debounced rendering, tab switching
 * between a rendered preview and raw HTML source view.
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
const previewFrame = document.getElementById(
  'preview-frame',
) as HTMLIFrameElement | null;
const htmlSourceCode = document.querySelector(
  '#html-source code',
) as HTMLElement | null;
const previewTab = document.getElementById(
  'preview-tab',
) as HTMLDivElement | null;
const sourceTab = document.getElementById(
  'source-tab',
) as HTMLDivElement | null;
const tabButtons = document.querySelectorAll<HTMLButtonElement>(
  '.preview-tabs .tab',
);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>): void => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      fn(...args);
    }, ms);
  };
}

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
// Preview rendering
// ---------------------------------------------------------------------------

/**
 * Update the preview iframe with rendered HTML content.
 *
 * Wraps the HTML in a minimal document with body styles for readability.
 * The iframe's `sandbox` attribute restricts script execution.
 */
function updatePreview(html: string): void {
  if (previewFrame) {
    previewFrame.srcdoc = `<!DOCTYPE html>
<html><head><style>
  body { font-family: system-ui, sans-serif; padding: 12px; font-size: 14px; line-height: 1.6; margin: 0; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
  code { font-family: monospace; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #d9d9d9; padding: 8px; }
  blockquote { border-left: 4px solid #d9d9d9; padding-left: 16px; color: #666; margin: 8px 0; }
  img { max-width: 100%; }
  h1, h2, h3, h4, h5, h6 { margin: 0.5em 0 0.25em; }
  p { margin: 0.25em 0; }
  ul, ol { padding-left: 1.5em; }
</style></head><body>${html}</body></html>`;
  }
}

/**
 * Update the HTML source code view with the raw HTML string.
 *
 * Escapes the HTML so it displays as source rather than being rendered.
 */
function updateSourceView(html: string): void {
  if (htmlSourceCode) {
    htmlSourceCode.textContent = html;
  }
}

/**
 * Process the current Markdown input and update both preview and source views.
 */
function renderPreview(): void {
  if (!input) return;

  const markdown = input.value;
  if (markdown.trim().length === 0) {
    updatePreview('');
    updateSourceView('');
    return;
  }

  const rawHtml = markdownToLarkHtml(markdown);
  const safeHtml = sanitizeHtml(rawHtml);

  updatePreview(safeHtml);
  updateSourceView(safeHtml);
}

/**
 * Debounced preview update -- fires 300ms after the user stops typing.
 */
const debouncedRenderPreview = debounce(renderPreview, 300);

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

/**
 * Switch the active tab in the preview pane.
 *
 * @param targetTab - The `data-tab` value of the tab to activate.
 */
function switchTab(targetTab: string): void {
  // Update button states.
  tabButtons.forEach((btn) => {
    if (btn.dataset['tab'] === targetTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle content visibility.
  if (targetTab === 'preview') {
    previewTab?.classList.remove('hidden');
    sourceTab?.classList.add('hidden');
  } else if (targetTab === 'source') {
    sourceTab?.classList.remove('hidden');
    previewTab?.classList.add('hidden');
  }
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

// Convert & Copy button.
if (convertBtn) {
  convertBtn.addEventListener('click', () => {
    void handleConvert();
  });
}

// Real-time preview on input with debounce.
if (input) {
  input.addEventListener('input', () => {
    debouncedRenderPreview();
  });

  // Allow Ctrl+Enter / Cmd+Enter as a keyboard shortcut within the textarea.
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void handleConvert();
    }
  });
}

// Tab switching.
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset['tab'];
    if (targetTab) {
      switchTab(targetTab);
    }
  });
});
