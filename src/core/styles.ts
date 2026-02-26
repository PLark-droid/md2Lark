/**
 * md2Lark - Style Templates
 *
 * Predefined CSS-like style templates that control the inline styles
 * applied to rendered HTML elements for Lark compatibility.
 *
 * Since Lark strips CSS classes and only respects inline styles,
 * templates are defined as maps from element selectors to inline style strings.
 */

export type StyleTemplateName = 'minimal' | 'enhanced' | 'document';

export interface StyleTemplate {
  name: StyleTemplateName;
  label: string;
  description: string;
  styles: Record<string, string>;
}

/**
 * Minimal template: relies on Lark's default styling as much as possible.
 * Only adds essential styles for elements Lark doesn't handle well.
 */
const minimal: StyleTemplate = {
  name: 'minimal',
  label: 'Minimal',
  description: 'Clean and simple. Relies on Lark defaults.',
  styles: {
    table: 'border-collapse: collapse;',
    'th,td': 'border: 1px solid #d9d9d9; padding: 8px;',
    blockquote: 'border-left: 4px solid #d9d9d9; padding-left: 16px; color: #666;',
    pre: 'background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto;',
    code: 'font-family: monospace;',
    'inline-code':
      'background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em;',
    a: 'color: #3370ff; text-decoration: none;',
  },
};

/**
 * Enhanced template: stronger visual hierarchy with emphasized headings,
 * colored code blocks, and accented borders.
 */
const enhanced: StyleTemplate = {
  name: 'enhanced',
  label: 'Enhanced',
  description: 'Stronger visual hierarchy with accented borders.',
  styles: {
    h1: 'font-size: 1.6em; font-weight: 700; border-bottom: 2px solid #3370ff; padding-bottom: 4px; margin-bottom: 8px;',
    h2: 'font-size: 1.4em; font-weight: 600; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; margin-bottom: 6px;',
    h3: 'font-size: 1.2em; font-weight: 600; margin-bottom: 4px;',
    table: 'border-collapse: collapse; width: 100%;',
    'th,td': 'border: 1px solid #d9d9d9; padding: 10px;',
    th: 'background-color: #f0f4ff; font-weight: 600;',
    blockquote:
      'border-left: 4px solid #3370ff; padding-left: 16px; color: #555; background: #f8f9ff; padding: 12px 16px; border-radius: 0 4px 4px 0;',
    pre: 'background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 6px; overflow-x: auto;',
    code: 'font-family: monospace;',
    'inline-code':
      'background: #e8f0fe; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em; color: #1967d2;',
    a: 'color: #3370ff; text-decoration: none; font-weight: 500;',
  },
};

/**
 * Document template: wider line spacing, professional font sizing,
 * suited for formal documents.
 */
const document_: StyleTemplate = {
  name: 'document',
  label: 'Document',
  description: 'Professional layout with wider spacing. Ideal for formal docs.',
  styles: {
    h1: 'font-size: 1.8em; font-weight: 700; margin: 16px 0 8px; line-height: 1.3;',
    h2: 'font-size: 1.5em; font-weight: 600; margin: 14px 0 6px; line-height: 1.3;',
    h3: 'font-size: 1.25em; font-weight: 600; margin: 12px 0 4px; line-height: 1.4;',
    p: 'margin: 8px 0; line-height: 1.8;',
    table: 'border-collapse: collapse; width: 100%; margin: 12px 0;',
    'th,td': 'border: 1px solid #c0c0c0; padding: 10px 12px;',
    th: 'background-color: #f5f5f5; font-weight: 600;',
    blockquote:
      'border-left: 4px solid #999; padding-left: 20px; color: #555; margin: 12px 0; font-style: italic; line-height: 1.8;',
    pre: 'background: #f8f8f8; padding: 16px; border-radius: 4px; overflow-x: auto; border: 1px solid #e0e0e0; line-height: 1.6;',
    code: 'font-family: monospace;',
    'inline-code':
      'background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em;',
    a: 'color: #2962ff; text-decoration: underline;',
    li: 'line-height: 1.8; margin: 4px 0;',
  },
};

export const STYLE_TEMPLATES: Record<StyleTemplateName, StyleTemplate> = {
  minimal,
  enhanced,
  document: document_,
};

/**
 * Get a style template by name. Falls back to 'minimal' for unknown names.
 */
export function getStyleTemplate(name: string): StyleTemplate {
  return STYLE_TEMPLATES[name as StyleTemplateName] ?? STYLE_TEMPLATES.minimal;
}

/**
 * Get the inline style string for a given element type from a template.
 * Returns empty string if no style is defined for that element.
 */
export function getElementStyle(template: StyleTemplate, element: string): string {
  return template.styles[element] ?? '';
}
