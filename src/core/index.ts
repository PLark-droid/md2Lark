/**
 * Core module barrel exports.
 *
 * Re-exports all public APIs from the parser, renderer, sanitizer,
 * and type definition modules.
 *
 * @module core
 */

// Parser
export { parseMarkdown } from './parser.js';

// Renderer
export { renderToLarkHtml, markdownToLarkHtml, LarkRenderer } from './renderer.js';

// Sanitizer
export { sanitizeHtml } from './sanitizer.js';

// Preprocessor
export { preprocessMarkdown } from './preprocessor.js';

// Postprocessor
export { postprocessHtml } from './postprocessor.js';

// Styles
export { getStyleTemplate, getElementStyle, STYLE_TEMPLATES } from './styles.js';
export type { StyleTemplate, StyleTemplateName } from './styles.js';

// Types
export type {
  ParserOptions,
  ParseResult,
  ParseMetadata,
} from './types.js';
