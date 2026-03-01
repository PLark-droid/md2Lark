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

import { LarkClient } from '../lark-api/client.js';
import { loadTokens, isTokenExpired, clearTokens } from '../lark-api/auth.js';

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
  } catch (err) {
    // Scripting may fail on restricted pages (chrome://, chrome-extension://, etc.)
    console.debug('[md2Lark]', err);
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
  } catch (err) {
    console.debug('[md2Lark]', err);
    flashBadge('!', '#ff4444');
    return;
  }

  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: 'convert-and-copy',
      markdown: selectedText,
    })) as { success: boolean; error?: string };

    if (response?.success) {
      flashBadge('OK', '#44bb44');
    } else {
      flashBadge('!', '#ff4444');
    }
  } catch (err) {
    console.debug('[md2Lark]', err);
    flashBadge('!', '#ff4444');
  }
}

// ---------------------------------------------------------------------------
// Lark configuration helper
// ---------------------------------------------------------------------------

interface LarkSettings {
  larkRegion: 'feishu' | 'larksuite';
  larkAppId: string;
}

async function loadLarkSettings(): Promise<LarkSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { larkRegion: 'larksuite', larkAppId: '' },
      (items) => {
        resolve(items as unknown as LarkSettings);
      },
    );
  });
}

function createLarkClient(settings: LarkSettings): LarkClient {
  const extensionId = chrome.runtime.id;
  return new LarkClient({
    region: settings.larkRegion,
    appId: settings.larkAppId,
    redirectUri: `https://${extensionId}.chromiumapp.org/`,
  });
}

// ---------------------------------------------------------------------------
// Lark OAuth message handler
// ---------------------------------------------------------------------------

/**
 * Handle messages from popup/options for Lark OAuth flow.
 * The actual OAuth logic is in src/lark-api/auth.ts.
 * This handler coordinates the chrome.identity.launchWebAuthFlow.
 */
chrome.runtime.onMessage.addListener(
  (message: { type: string; [key: string]: unknown }, _sender, sendResponse) => {
    if (message.type === 'lark-auth-start') {
      void handleLarkAuth(message).then(sendResponse);
      return true; // Keep message channel open for async response
    }

    if (message.type === 'lark-auth-logout') {
      void handleLarkLogout().then(sendResponse);
      return true;
    }

    if (message.type === 'lark-auth-check') {
      void handleLarkAuthCheck().then(sendResponse);
      return true;
    }

    return false;
  },
);

async function handleLarkAuth(
  _message: { type: string; [key: string]: unknown },
): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = await loadLarkSettings();
    if (!settings.larkAppId) {
      return { success: false, error: 'Lark App ID not configured. Go to Settings.' };
    }

    const client = createLarkClient(settings);
    await client.authenticate();
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Authentication failed';
    return { success: false, error: msg };
  }
}

async function handleLarkLogout(): Promise<{ success: boolean }> {
  try {
    await clearTokens();
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function handleLarkAuthCheck(): Promise<{ authenticated: boolean }> {
  try {
    const tokens = await loadTokens();
    const authenticated = tokens !== null && !isTokenExpired(tokens);
    return { authenticated };
  } catch {
    return { authenticated: false };
  }
}
