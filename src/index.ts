/**
 * md2Lark - Markdown to Lark (Feishu) document converter
 */

// High-level conversion API
export { convert, convertToHtml } from './converter';

// Types
export type {
  ConvertOptions,
  ConvertResult,
  ConvertMetadata,
  LarkDocument,
  LarkBlock,
} from './types';

// Core module re-exports
export {
  parseMarkdown,
  renderToLarkHtml,
  markdownToLarkHtml,
  LarkRenderer,
  sanitizeHtml,
} from './core/index';

export type {
  ParsedToken,
  ParserOptions,
  ParseResult,
  ParseMetadata,
} from './core/index';
