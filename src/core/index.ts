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

// Types
export type {
  ParsedToken,
  ParserOptions,
  ParseResult,
  ParseMetadata,
} from './types.js';
