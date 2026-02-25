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
 * 1. `<script>` elements (including their content)
 * 2. Inline event-handler attributes (`onclick`, `onerror`, etc.)
 * 3. `javascript:` URLs in `href` and `src` attributes
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

  // 1. Strip <script> tags and everything between them.
  //    The `s` (dotAll) flag ensures we match across newlines.
  result = result.replace(
    /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
    '',
  );

  // Also strip self-closing / unclosed <script> tags.
  result = result.replace(/<script\b[^>]*\/?>/gi, '');

  // 2. Strip on* event-handler attributes.
  //    Matches  onXxx="..."  |  onXxx='...'  |  onXxx=value (unquoted).
  result = result.replace(
    /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    '',
  );

  // 3. Strip javascript: URLs inside href and src attributes.
  //    We replace just the attribute value, keeping the attribute name so the
  //    tag remains valid HTML.
  result = result.replace(
    /(href|src)\s*=\s*(?:"[^"]*javascript\s*:[^"]*"|'[^']*javascript\s*:[^']*')/gi,
    '$1=""',
  );

  return result;
}
