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
