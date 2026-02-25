/**
 * Options for markdown to Lark conversion
 */
export interface ConvertOptions {
  /** Source markdown string */
  markdown: string;
  /** Target Lark document title */
  title?: string;
}

/**
 * Lark document representation
 */
export interface LarkDocument {
  /** Document title */
  title: string;
  /** Lark block content */
  content: LarkBlock[];
}

/**
 * Lark block element
 */
export interface LarkBlock {
  /** Block type (paragraph, heading, code, list, etc.) */
  blockType: string;
  /** Block content */
  body: Record<string, unknown>;
}

/**
 * Metadata about the converted document.
 */
export interface ConvertMetadata {
  /** Document title (extracted from first heading or options) */
  title: string;
  /** Approximate word count of the source markdown */
  wordCount: number;
  /** Whether the document contains fenced or indented code blocks */
  hasCodeBlocks: boolean;
  /** Programming languages found in fenced code blocks */
  languages: string[];
  /** Whether the document contains GFM tables */
  hasTables: boolean;
  /** Whether the document contains images */
  hasImages: boolean;
}

/**
 * Result of the HTML conversion pipeline.
 *
 * Contains the Lark-optimised HTML, a plain-text fallback, and
 * document-level metadata.
 */
export interface ConvertResult {
  /** Lark-optimised HTML string */
  html: string;
  /** Plain text version (for text/plain clipboard) */
  plainText: string;
  /** Document metadata */
  metadata: ConvertMetadata;
}
