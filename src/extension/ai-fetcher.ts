/**
 * md2Lark Chrome Extension - AI Page Markdown Fetcher
 *
 * Extracts Markdown/text content from Claude and ChatGPT conversation pages.
 * Injected into the active tab via chrome.scripting.executeScript.
 */

/**
 * Detect the AI service based on the current page URL.
 */
export type AiService = 'claude' | 'chatgpt' | 'unknown';

export function detectAiService(url: string): AiService {
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('chatgpt.com') || url.includes('chat.openai.com'))
    return 'chatgpt';
  return 'unknown';
}

/**
 * Extract the latest assistant message content from the current page.
 * This function is designed to be injected into the page via executeScript.
 * It returns the text content of the last assistant message.
 */
export function extractLatestAssistantMessage(): string {
  const url = window.location.href;

  // Claude.ai selectors
  if (url.includes('claude.ai')) {
    // Claude uses div[data-is-streaming] for active, and the last .font-claude-message
    // Try multiple selectors for robustness
    const selectors = [
      '[data-testid="chat-message-content"]:last-of-type',
      '.font-claude-message:last-of-type',
      // Claude wraps assistant messages; get the last one
      '[class*="Message"]:last-child [class*="markdown"]',
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const lastEl = elements[elements.length - 1];
        return lastEl.textContent?.trim() ?? '';
      }
    }

    // Fallback: get all message containers and pick the last assistant one
    const allMessages = document.querySelectorAll('[class*="message"]');
    if (allMessages.length > 0) {
      const last = allMessages[allMessages.length - 1];
      return last.textContent?.trim() ?? '';
    }
  }

  // ChatGPT selectors
  if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
    const selectors = [
      '[data-message-author-role="assistant"]:last-of-type .markdown',
      '[data-message-author-role="assistant"]:last-of-type',
      '.agent-turn:last-of-type .markdown',
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const lastEl = elements[elements.length - 1];
        return lastEl.textContent?.trim() ?? '';
      }
    }
  }

  return '';
}
