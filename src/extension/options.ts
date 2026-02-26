/**
 * md2Lark Chrome Extension - Options page entry point.
 *
 * Loads saved settings, populates the form, and auto-saves
 * changes to chrome.storage.sync on any input event.
 */

import { loadSettings, saveSettings } from './storage.js';
import type { Md2LarkSettings } from './storage.js';
import { debounce } from './utils.js';

// DOM references
const gfmEnabledEl = document.getElementById('gfm-enabled') as HTMLInputElement | null;
const defaultCodeLangEl = document.getElementById('default-code-lang') as HTMLInputElement | null;
const styleTemplateEl = document.getElementById('style-template') as HTMLSelectElement | null;
const tableBorderStyleEl = document.getElementById(
  'table-border-style',
) as HTMLSelectElement | null;
const customCssEl = document.getElementById('custom-css') as HTMLTextAreaElement | null;
const saveStatusEl = document.getElementById('save-status') as HTMLSpanElement | null;

/**
 * Populate form fields with current settings.
 */
function populateForm(settings: Md2LarkSettings): void {
  if (gfmEnabledEl) gfmEnabledEl.checked = settings.gfmEnabled;
  if (defaultCodeLangEl) defaultCodeLangEl.value = settings.defaultCodeLanguage;
  if (styleTemplateEl) styleTemplateEl.value = settings.styleTemplate;
  if (tableBorderStyleEl) tableBorderStyleEl.value = settings.tableBorderStyle;
  if (customCssEl) customCssEl.value = settings.customCss;
}

/**
 * Type guard for valid style template values.
 */
function isValidStyleTemplate(v: string): v is Md2LarkSettings['styleTemplate'] {
  return ['minimal', 'enhanced', 'document'].includes(v);
}

/**
 * Type guard for valid border style values.
 */
function isValidBorderStyle(v: string): v is Md2LarkSettings['tableBorderStyle'] {
  return ['solid', 'dashed', 'none'].includes(v);
}

/**
 * Gather current form values into a settings object.
 */
function gatherFormValues(): Partial<Md2LarkSettings> {
  const rawTemplate = styleTemplateEl?.value ?? '';
  const rawBorder = tableBorderStyleEl?.value ?? '';

  return {
    gfmEnabled: gfmEnabledEl?.checked ?? true,
    defaultCodeLanguage: defaultCodeLangEl?.value ?? '',
    styleTemplate: isValidStyleTemplate(rawTemplate) ? rawTemplate : 'minimal',
    tableBorderStyle: isValidBorderStyle(rawBorder) ? rawBorder : 'solid',
    customCss: customCssEl?.value ?? '',
  };
}

/**
 * Flash a brief "Saved" status indicator.
 */
function showSaved(): void {
  if (!saveStatusEl) return;
  saveStatusEl.textContent = 'Settings saved';
  setTimeout(() => {
    if (saveStatusEl) saveStatusEl.textContent = '';
  }, 1500);
}

/**
 * Auto-save handler: gather values, persist, and show indicator.
 */
async function handleAutoSave(): Promise<void> {
  const values = gatherFormValues();
  await saveSettings(values);
  showSaved();
}

// Initialize
async function init(): Promise<void> {
  const settings = await loadSettings();
  populateForm(settings);

  // Auto-save on any input change.
  const inputs = [
    gfmEnabledEl,
    defaultCodeLangEl,
    styleTemplateEl,
    tableBorderStyleEl,
    customCssEl,
  ];
  for (const el of inputs) {
    if (el) {
      el.addEventListener('change', () => {
        void handleAutoSave();
      });
    }
  }

  // Also auto-save on text input (for textarea and text fields with debounce).
  const debouncedAutoSave = debounce(() => {
    void handleAutoSave();
  }, 500);
  const textInputs = [defaultCodeLangEl, customCssEl];
  for (const el of textInputs) {
    if (el) {
      el.addEventListener('input', debouncedAutoSave);
    }
  }
}

void init();
