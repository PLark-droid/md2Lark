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
import { loadHistory, addHistoryEntry, deleteHistoryEntry, clearHistory } from './history.js';
import type { HistoryEntry } from './history.js';
import { loadSettings } from './storage.js';
import { debounce, htmlToPlainText } from './utils.js';

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
const fetchAiBtn = document.getElementById(
  'fetch-ai-btn',
) as HTMLButtonElement | null;
const historyBtn = document.getElementById(
  'history-btn',
) as HTMLButtonElement | null;
const historyPanel = document.getElementById(
  'history-panel',
) as HTMLDivElement | null;
const historyList = document.getElementById(
  'history-list',
) as HTMLDivElement | null;
const historyEmpty = document.getElementById(
  'history-empty',
) as HTMLDivElement | null;
const clearHistoryBtn = document.getElementById(
  'clear-history-btn',
) as HTMLButtonElement | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  // Animate the convert button on success.
  if (kind === 'success' && convertBtn) {
    convertBtn.classList.add('copied');
    convertBtn.textContent = 'Copied!';
    setTimeout(() => {
      convertBtn.classList.remove('copied');
      convertBtn.textContent = 'Convert & Copy';
    }, durationMs);
  }

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
 *
 * Security layers:
 * 1. Input is sanitized via sanitizeHtml() before reaching this function
 * 2. iframe has sandbox="" (all capabilities disabled, including scripts)
 * 3. srcdoc CSP meta tag: default-src 'none' blocks all resource loading
 */
function updatePreview(html: string): void {
  if (previewFrame) {
    previewFrame.srcdoc = `<!DOCTYPE html>
<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:;"><style>
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

/** Cached style template name from settings. */
let currentTemplateName = 'minimal';

/** Load the current template name from settings. */
async function refreshSettings(): Promise<void> {
  try {
    const settings = await loadSettings();
    currentTemplateName = settings.styleTemplate;
  } catch {
    // Fallback to default if storage is unavailable.
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

  const rawHtml = markdownToLarkHtml(markdown, currentTemplateName);
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
      btn.setAttribute('aria-selected', 'true');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
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
// Fetch from AI page
// ---------------------------------------------------------------------------

/**
 * Fetch Markdown content from the current AI chat page (Claude/ChatGPT).
 *
 * Uses chrome.scripting.executeScript to run a DOM query in the active tab
 * and extract the latest assistant message content.
 */
async function handleFetchFromAi(): Promise<void> {
  if (!fetchAiBtn || !input) return;

  fetchAiBtn.disabled = true;
  fetchAiBtn.classList.add('fetching');
  fetchAiBtn.textContent = 'Fetching...';

  try {
    // 1. Get the active tab.
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id || !tab.url) {
      showStatus('No active tab found.', 'error');
      return;
    }

    // 2. Check if the tab is a supported AI page.
    const url = tab.url;
    const isClaude = url.includes('claude.ai');
    const isChatGPT =
      url.includes('chatgpt.com') || url.includes('chat.openai.com');

    if (!isClaude && !isChatGPT) {
      showStatus('Not on a Claude or ChatGPT page.', 'error', 3000);
      return;
    }

    // 3. Execute script in the active tab to extract content.
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const pageUrl = window.location.href;

        // Claude.ai extraction
        if (pageUrl.includes('claude.ai')) {
          // Try multiple selectors for robustness against UI changes
          const claudeSelectors = [
            '[data-testid="chat-message-content"]',
            '.font-claude-message',
            '.prose',
          ];

          for (const selector of claudeSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              const lastEl = elements[elements.length - 1];
              return lastEl.textContent?.trim() ?? '';
            }
          }
        }

        // ChatGPT extraction
        if (
          pageUrl.includes('chatgpt.com') ||
          pageUrl.includes('chat.openai.com')
        ) {
          const chatgptSelectors = [
            '[data-message-author-role="assistant"] .markdown',
            '[data-message-author-role="assistant"]',
            '.agent-turn .markdown',
          ];

          for (const selector of chatgptSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              const lastEl = elements[elements.length - 1];
              return lastEl.textContent?.trim() ?? '';
            }
          }
        }

        return '';
      },
    });

    const raw = results?.[0]?.result;
    const extractedText = typeof raw === 'string' ? raw : '';

    if (!extractedText) {
      showStatus('No AI message found on this page.', 'error', 3000);
      return;
    }

    // 4. Insert the extracted text into the textarea.
    input.value = extractedText;

    // 5. Trigger preview update.
    renderPreview();

    const serviceName = isClaude ? 'Claude' : 'ChatGPT';
    showStatus(`Fetched from ${serviceName}!`, 'success');
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch from AI page.';
    showStatus(message, 'error', 4000);
  } finally {
    fetchAiBtn.disabled = false;
    fetchAiBtn.classList.remove('fetching');
    fetchAiBtn.textContent = 'Fetch from AI';
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/**
 * Format a timestamp to a relative time string.
 */
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Current entries backing the history list (used by the delegated handler). */
let currentHistoryEntries: HistoryEntry[] = [];

/**
 * Render the history list UI using DOM APIs (no innerHTML).
 */
function renderHistoryList(entries: HistoryEntry[]): void {
  if (!historyList || !historyEmpty) return;

  currentHistoryEntries = entries;

  // Clear existing children in a single DOM operation.
  historyList.replaceChildren();

  if (entries.length === 0) {
    historyEmpty.style.display = 'block';
    return;
  }

  historyEmpty.style.display = 'none';

  const fragment = document.createDocumentFragment();

  for (const entry of entries) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset['id'] = entry.id;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');

    const info = document.createElement('div');
    info.className = 'history-item-info';

    const title = document.createElement('div');
    title.className = 'history-item-title';
    title.textContent = entry.title || 'Untitled';

    const time = document.createElement('div');
    time.className = 'history-item-time';
    time.textContent = formatRelativeTime(entry.timestamp);

    info.appendChild(title);
    info.appendChild(time);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'history-item-delete';
    deleteBtn.dataset['deleteId'] = entry.id;
    deleteBtn.setAttribute('title', 'Delete');
    deleteBtn.setAttribute('aria-label', 'Delete');
    deleteBtn.textContent = '\u00D7';

    item.appendChild(info);
    item.appendChild(deleteBtn);
    fragment.appendChild(item);
  }

  historyList.appendChild(fragment);
}

// Event delegation: single click listener on historyList.
if (historyList) {
  historyList.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // Delete button clicked.
    const deleteBtn = target.closest('.history-item-delete') as HTMLElement | null;
    if (deleteBtn) {
      e.stopPropagation();
      const id = deleteBtn.dataset['deleteId'];
      if (id) {
        void (async () => {
          await deleteHistoryEntry(id);
          const updated = await loadHistory();
          renderHistoryList(updated);
        })();
      }
      return;
    }

    // History item clicked (load into editor).
    const item = target.closest('.history-item') as HTMLElement | null;
    if (item) {
      const id = item.dataset['id'];
      const entry = currentHistoryEntries.find(en => en.id === id);
      if (entry && input) {
        input.value = entry.markdown;
        renderPreview();
        showStatus('Loaded from history', 'success');
      }
    }
  });

  // Keyboard activation for history items (WAI-ARIA button pattern).
  historyList.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;

    const target = e.target as HTMLElement;
    const item = target.closest('.history-item') as HTMLElement | null;
    if (item) {
      e.preventDefault();
      item.click();
    }
  });
}

/**
 * Refresh the history panel with current data.
 */
async function refreshHistoryPanel(): Promise<void> {
  const entries = await loadHistory();
  renderHistoryList(entries);
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
    const rawHtml = markdownToLarkHtml(markdown, currentTemplateName);

    // 2. Sanitize the output to remove XSS vectors.
    const safeHtml = sanitizeHtml(rawHtml);

    // 3. Derive a plain-text fallback.
    const plainText = htmlToPlainText(safeHtml);

    // 4. Write both representations to the clipboard.
    await copyHtmlToClipboard(safeHtml, plainText);

    // 5. Save to conversion history.
    await addHistoryEntry(markdown, safeHtml);

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

// Fetch from AI page button.
if (fetchAiBtn) {
  fetchAiBtn.addEventListener('click', () => {
    void handleFetchFromAi();
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

// Arrow key navigation for tabs (WAI-ARIA Tabs Pattern).
tabButtons.forEach((btn, index) => {
  btn.addEventListener('keydown', (e: KeyboardEvent) => {
    const tabs = Array.from(tabButtons);
    let nextIndex: number | undefined;

    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    }

    if (nextIndex !== undefined) {
      e.preventDefault();
      const nextBtn = tabs[nextIndex];
      nextBtn.focus();
      const targetTab = nextBtn.dataset['tab'];
      if (targetTab) {
        switchTab(targetTab);
      }
    }
  });
});

// History toggle button.
if (historyBtn) {
  historyBtn.addEventListener('click', () => {
    if (historyPanel) {
      const isVisible = !historyPanel.classList.contains('hidden');
      historyPanel.classList.toggle('hidden');
      historyBtn.classList.toggle('active', !isVisible);
      if (!isVisible) {
        void refreshHistoryPanel();
      }
    }
  });
}

// Clear history button.
if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', () => {
    void (async () => {
      await clearHistory();
      renderHistoryList([]);
    })();
  });
}

// Load settings on startup.
void refreshSettings();

// Reload settings when storage changes (e.g., from options page).
chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === 'sync') {
    void refreshSettings();
    // Re-render preview with new settings.
    debouncedRenderPreview();
  }
});
