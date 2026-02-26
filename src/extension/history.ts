/**
 * md2Lark Chrome Extension - Conversion History Manager
 *
 * Manages conversion history using chrome.storage.local.
 * Stores up to MAX_HISTORY entries with auto-pruning of oldest entries.
 */

export interface HistoryEntry {
  id: string;
  markdown: string;
  html: string;
  timestamp: number;
  title: string;
}

const MAX_HISTORY = 50;
const STORAGE_KEY = 'md2lark_history';

/**
 * Generate a unique ID for a history entry.
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Extract a title from the first line of markdown.
 * Strips heading markers and truncates to 60 chars.
 */
export function extractTitle(markdown: string): string {
  const firstLine = markdown.split('\n').find((line) => line.trim().length > 0) ?? '';
  const cleaned = firstLine.replace(/^#+\s*/, '').trim();
  return cleaned.length > 60 ? cleaned.substring(0, 57) + '...' : cleaned;
}

/**
 * Load all history entries from chrome.storage.local.
 */
export async function loadHistory(): Promise<HistoryEntry[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve((result[STORAGE_KEY] as HistoryEntry[]) ?? []);
    });
  });
}

/**
 * Save the full history array to chrome.storage.local.
 */
async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: entries }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/**
 * Add a new entry to the history. Auto-prunes if over MAX_HISTORY.
 */
export async function addHistoryEntry(markdown: string, html: string): Promise<HistoryEntry> {
  const entries = await loadHistory();

  const entry: HistoryEntry = {
    id: generateId(),
    markdown,
    html,
    timestamp: Date.now(),
    title: extractTitle(markdown),
  };

  // Prepend new entry (newest first).
  entries.unshift(entry);

  // Prune oldest entries if over limit.
  if (entries.length > MAX_HISTORY) {
    entries.splice(MAX_HISTORY);
  }

  await saveHistory(entries);
  return entry;
}

/**
 * Delete a single history entry by ID.
 */
export async function deleteHistoryEntry(id: string): Promise<void> {
  const entries = await loadHistory();
  const filtered = entries.filter((e) => e.id !== id);
  await saveHistory(filtered);
}

/**
 * Delete all history entries.
 */
export async function clearHistory(): Promise<void> {
  await saveHistory([]);
}
