/**
 * md2Lark Chrome Extension - Storage utilities.
 *
 * Manages extension settings via chrome.storage.sync for cross-device sync.
 */

export interface Md2LarkSettings {
  /** Enable GitHub Flavored Markdown extensions. */
  gfmEnabled: boolean;
  /** Table border style. */
  tableBorderStyle: 'solid' | 'dashed' | 'none';
  /** Default language for code blocks without a specified language. */
  defaultCodeLanguage: string;
  /** Custom CSS to inject into rendered output. */
  customCss: string;
  /** Style template preset. */
  styleTemplate: 'minimal' | 'enhanced' | 'document';
}

export const DEFAULT_SETTINGS: Md2LarkSettings = {
  gfmEnabled: true,
  tableBorderStyle: 'solid',
  defaultCodeLanguage: '',
  customCss: '',
  styleTemplate: 'minimal',
};

/**
 * Load settings from chrome.storage.sync.
 * Returns defaults merged with any saved values.
 */
export async function loadSettings(): Promise<Md2LarkSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      (items) => {
        resolve(items as unknown as Md2LarkSettings);
      },
    );
  });
}

/**
 * Save settings to chrome.storage.sync.
 */
export async function saveSettings(settings: Partial<Md2LarkSettings>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      resolve();
    });
  });
}
