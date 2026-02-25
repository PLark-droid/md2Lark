/**
 * md2Lark Chrome Extension - Background service worker.
 *
 * Listens for the "convert-selection" keyboard shortcut command
 * (Ctrl+Shift+L / Cmd+Shift+L) and coordinates the conversion flow:
 *
 * 1. Query the active tab for selected text via `chrome.scripting.executeScript`.
 * 2. If no text is selected, show a brief badge indicator.
 * 3. Otherwise, inject the content script and send it the selected markdown
 *    for conversion and clipboard write.
 */

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const BADGE_CLEAR_DELAY_MS = 2_000;

/**
 * Flash a coloured badge on the extension icon to communicate status.
 *
 * @param text  - Short badge label (1-4 characters).
 * @param color - Badge background colour.
 */
function flashBadge(text: string, color: string): void {
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color });
  // NOTE: setTimeout may not fire if the service worker is terminated by Chrome.
  // For a 2-second delay this is acceptable; use chrome.alarms for longer delays.
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: '' });
  }, BADGE_CLEAR_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

chrome.commands.onCommand.addListener((command: string) => {
  if (command !== 'convert-selection') return;
  void handleConvertSelection();
});

/**
 * Orchestrate the full convert-selection flow.
 *
 * The work is split across two `chrome.scripting.executeScript` calls:
 *
 * 1. Retrieve the selected text from the active tab.
 * 2. Inject the content script (which bundles the renderer, sanitizer, and
 *    clipboard helper) and send it a message with the markdown to convert.
 */
async function handleConvertSelection(): Promise<void> {
  // 1. Identify the active tab.
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) return;

  const tabId = tab.id;

  // 2. Retrieve the user's text selection.
  let selectedText: string;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection()?.toString() ?? '',
    });
    selectedText = (results?.[0]?.result as string) ?? '';
  } catch {
    // Scripting may fail on restricted pages (chrome://, chrome-extension://, etc.)
    flashBadge('!', '#ff4444');
    return;
  }

  if (!selectedText.trim()) {
    // Nothing selected -- show a warning badge.
    flashBadge('!', '#ff4444');
    return;
  }

  // 3. Inject the content script and ask it to convert + copy.
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  } catch {
    flashBadge('!', '#ff4444');
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'convert-and-copy',
      markdown: selectedText,
    }) as { success: boolean; error?: string };

    if (response?.success) {
      flashBadge('OK', '#44bb44');
    } else {
      flashBadge('!', '#ff4444');
    }
  } catch {
    flashBadge('!', '#ff4444');
  }
}
