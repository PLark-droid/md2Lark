/**
 * Lightweight HTML sanitizer for preventing XSS in generated Lark HTML.
 *
 * Uses a regex-based approach with no external dependencies, suitable for
 * browser environments. This is intentionally minimal -- it strips known
 * dangerous patterns while leaving the rest of the HTML intact so that the
 * Lark rich-text editor can consume it.
 */

/**
 * Remove dangerous HTML constructs that could lead to XSS.
 *
 * Specifically:
 * 1. Dangerous elements (`<script>`, `<iframe>`, `<embed>`, `<object>`,
 *    `<style>`, `<form>`, `<applet>`, `<base>`, `<meta>`) including their
 *    content
 * 2. Inline event-handler attributes (`onclick`, `onerror`, etc.)
 * 3. Dangerous URI schemes (`javascript:`, `vbscript:`, `data:`) in `href`,
 *    `src`, `action`, and `formaction` attributes
 *
 * All other HTML is passed through unchanged.
 *
 * @param html - Raw HTML string to sanitize.
 * @returns Sanitized HTML string.
 *
 * @example
 * ```ts
 * sanitizeHtml('<p onclick="alert(1)">hi</p>');
 * // => '<p>hi</p>'
 * ```
 */
export function sanitizeHtml(html: string): string {
  let result = html;

  // 1. Strip dangerous tags (expanded list).
  const dangerousTags = [
    'script',
    'iframe',
    'embed',
    'object',
    'style',
    'form',
    'applet',
    'base',
    'meta',
  ];
  for (const tag of dangerousTags) {
    // Remove paired tags with content.
    result = result.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'),
      '',
    );
    // Remove self-closing / orphaned opening tags.
    result = result.replace(
      new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'),
      '',
    );
  }

  // 2. Strip on* event-handler attributes (quoted, unquoted, entity-encoded).
  //    Matches  onXxx="..."  |  onXxx='...'  |  onXxx=value (unquoted).
  result = result.replace(
    /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    '',
  );

  // 3. Decode HTML entities in href/src/action/formaction values to catch encoded schemes.
  result = result.replace(
    /(href|src|action|formaction)\s*=\s*"([^"]*)"/gi,
    (_match, attr: string, value: string) => {
      const decoded = value
        .replace(/&#x([0-9a-fA-F]+);/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCharCode(parseInt(dec, 10)));
      return `${attr}="${decoded}"`;
    },
  );
  result = result.replace(
    /(href|src|action|formaction)\s*=\s*'([^']*)'/gi,
    (_match, attr: string, value: string) => {
      const decoded = value
        .replace(/&#x([0-9a-fA-F]+);/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCharCode(parseInt(dec, 10)));
      return `${attr}='${decoded}'`;
    },
  );

  // 4. Neutralize dangerous URI schemes in href, src, action, formaction.
  //    Handles double-quoted, single-quoted, and unquoted attribute values.
  result = result.replace(
    /(href|src|action|formaction)\s*=\s*(?:"[^"]*(?:javascript|vbscript|data)\s*:[^"]*"|'[^']*(?:javascript|vbscript|data)\s*:[^']*'|(?:javascript|vbscript|data)\s*:[^\s>]*)/gi,
    '$1=""',
  );

  return result;
}
