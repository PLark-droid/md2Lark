/**
 * Lightweight HTML sanitizer for preventing XSS in generated Lark HTML.
 *
 * Uses a regex-based approach with no external dependencies, suitable for
 * browser environments. This is intentionally minimal -- it strips known
 * dangerous patterns while leaving the rest of the HTML intact so that the
 * Lark rich-text editor can consume it.
 */

// ---------------------------------------------------------------------------
// Pre-compiled regex patterns for dangerous tags
// ---------------------------------------------------------------------------

/** Tags whose content and structure are always stripped. */
const DANGEROUS_TAGS = [
  'script',
  'iframe',
  'embed',
  'object',
  'style',
  'form',
  'applet',
  'base',
  'meta',
  'svg',
  'math',
  'template',
] as const;

/**
 * For each dangerous tag, a pair of pre-compiled RegExp objects:
 *   [0] matches paired tags with content  (e.g. `<script ...>...</script>`)
 *   [1] matches self-closing / orphaned opening tags  (e.g. `<script ... />`)
 */
const DANGEROUS_TAG_PATTERNS: ReadonlyArray<readonly [RegExp, RegExp]> = DANGEROUS_TAGS.map(
  (tag) =>
    [
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'),
      new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'),
    ] as const,
);

/** Matches inline event-handler attributes (onclick, onerror, ...). */
const EVENT_HANDLER_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Matches href/src/action/formaction with double-quoted values. */
const ATTR_DOUBLE_QUOTE_RE = /(href|src|action|formaction)\s*=\s*"([^"]*)"/gi;

/** Matches href/src/action/formaction with single-quoted values. */
const ATTR_SINGLE_QUOTE_RE = /(href|src|action|formaction)\s*=\s*'([^']*)'/gi;

/** Hex-encoded HTML entity (e.g. `&#x6A;`). */
const HEX_ENTITY_RE = /&#x([0-9a-fA-F]+);/gi;

/** Decimal-encoded HTML entity (e.g. `&#106;`). */
const DEC_ENTITY_RE = /&#(\d+);/g;

/** Dangerous URI schemes in attribute values (double-quoted, single-quoted, or unquoted). */
const DANGEROUS_URI_RE =
  /(href|src|action|formaction)\s*=\s*(?:"[^"]*(?:javascript|vbscript|data)\s*:[^"]*"|'[^']*(?:javascript|vbscript|data)\s*:[^']*'|(?:javascript|vbscript|data)\s*:[^\s>]*)/gi;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
  // Early exit: plain text with no HTML tags needs no sanitization.
  if (!html.includes('<')) return html;

  let result = html;

  // Strip null bytes which can be used to bypass sanitization filters.
  result = result.replace(/\x00/g, '');

  // 1. Strip dangerous tags using pre-compiled patterns.
  for (const [pairedRe, selfClosingRe] of DANGEROUS_TAG_PATTERNS) {
    // Reset lastIndex for global regexes.
    pairedRe.lastIndex = 0;
    selfClosingRe.lastIndex = 0;

    result = result.replace(pairedRe, '');
    result = result.replace(selfClosingRe, '');
  }

  // 2. Strip on* event-handler attributes (quoted, unquoted, entity-encoded).
  EVENT_HANDLER_RE.lastIndex = 0;
  result = result.replace(EVENT_HANDLER_RE, '');

  // 3. Decode HTML entities in href/src/action/formaction values to catch encoded schemes.
  ATTR_DOUBLE_QUOTE_RE.lastIndex = 0;
  result = result.replace(ATTR_DOUBLE_QUOTE_RE, (_match, attr: string, value: string) => {
    const decoded = value
      .replace(HEX_ENTITY_RE, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .replace(DEC_ENTITY_RE, (_m, dec: string) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/[\x00-\x1f]+/g, '');
    const safe = decoded.replace(/"/g, '&quot;');
    return `${attr}="${safe}"`;
  });
  ATTR_SINGLE_QUOTE_RE.lastIndex = 0;
  result = result.replace(ATTR_SINGLE_QUOTE_RE, (_match, attr: string, value: string) => {
    const decoded = value
      .replace(HEX_ENTITY_RE, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .replace(DEC_ENTITY_RE, (_m, dec: string) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/[\x00-\x1f]+/g, '');
    const safe = decoded.replace(/'/g, '&#39;');
    return `${attr}='${safe}'`;
  });

  // 4. Neutralize dangerous URI schemes in href, src, action, formaction.
  DANGEROUS_URI_RE.lastIndex = 0;
  result = result.replace(DANGEROUS_URI_RE, '$1=""');

  return result;
}
