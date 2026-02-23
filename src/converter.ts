import type { ConvertOptions, LarkDocument } from './types';

/**
 * Convert markdown to Lark document format
 */
export function convert(options: ConvertOptions): LarkDocument {
  const { markdown, title = 'Untitled' } = options;

  // TODO(P1): Implement full markdown parsing and Lark block conversion
  return {
    title,
    content: [
      {
        blockType: 'paragraph',
        body: { text: markdown },
      },
    ],
  };
}
