/**
 * Core type definitions for the Markdown parser module.
 *
 * Re-exports and wraps relevant types from the `marked` library
 * for use throughout the md2Lark conversion pipeline.
 */
import type { Token } from 'marked';

/**
 * A parsed token from the marked lexer.
 *
 * This is a direct re-export of `marked.Token` to decouple downstream
 * consumers from the specific marked library version.
 */
export type ParsedToken = Token;

/**
 * Options that control how Markdown source is parsed.
 */
export interface ParserOptions {
  /**
   * Enable GitHub Flavored Markdown extensions (tables, strikethrough, etc.).
   * @default true
   */
  gfm?: boolean;

  /**
   * Enable GFM line breaks. Requires `gfm` to be `true`.
   * @default false
   */
  breaks?: boolean;
}

/**
 * Metadata extracted from the parsed token tree.
 */
export interface ParseMetadata {
  /** Whether the document contains any fenced or indented code blocks. */
  hasCodeBlocks: boolean;

  /** Deduplicated list of programming languages found in fenced code blocks. */
  languages: string[];

  /** Whether the document contains any GFM tables. */
  hasTables: boolean;

  /** Whether the document contains any images. */
  hasImages: boolean;
}

/**
 * The result of parsing a Markdown string.
 */
export interface ParseResult {
  /** The top-level token list produced by the marked lexer. */
  tokens: Token[];

  /** Metadata extracted by walking the token tree. */
  metadata: ParseMetadata;
}
