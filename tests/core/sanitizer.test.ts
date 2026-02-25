import { sanitizeHtml } from '../../src/core/sanitizer';

// ---------------------------------------------------------------------------
// Script tag removal
// ---------------------------------------------------------------------------

describe('sanitizeHtml - script removal', () => {
  it('removes <script> tags with content', () => {
    const input = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    expect(sanitizeHtml(input)).toBe('<p>Hello</p><p>World</p>');
  });

  it('removes <script> tags with attributes', () => {
    const input = '<script type="text/javascript">evil()</script>';
    expect(sanitizeHtml(input)).toBe('');
  });

  it('removes <script> tags spanning multiple lines', () => {
    const input = '<script>\nalert(1);\nconsole.log(2);\n</script>';
    expect(sanitizeHtml(input)).toBe('');
  });

  it('removes self-closing <script> tags', () => {
    const input = '<p>Text</p><script src="evil.js" /><p>More</p>';
    expect(sanitizeHtml(input)).toBe('<p>Text</p><p>More</p>');
  });

  it('removes <script> tags case-insensitively', () => {
    const input = '<SCRIPT>alert(1)</SCRIPT>';
    expect(sanitizeHtml(input)).toBe('');
  });

  it('removes multiple <script> tags', () => {
    const input =
      '<script>a()</script>safe<script>b()</script>';
    expect(sanitizeHtml(input)).toBe('safe');
  });
});

// ---------------------------------------------------------------------------
// Event handler removal
// ---------------------------------------------------------------------------

describe('sanitizeHtml - event handler removal', () => {
  it('removes onclick attribute', () => {
    const input = '<button onclick="alert(1)">Click</button>';
    expect(sanitizeHtml(input)).toBe('<button>Click</button>');
  });

  it('removes onerror attribute', () => {
    const input = '<img src="x" onerror="alert(1)" />';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onerror');
    expect(result).toContain('src="x"');
  });

  it('removes onload attribute', () => {
    const input = '<body onload="init()">';
    expect(sanitizeHtml(input)).toBe('<body>');
  });

  it('removes onmouseover with single quotes', () => {
    const input = "<div onmouseover='alert(1)'>text</div>";
    expect(sanitizeHtml(input)).toBe('<div>text</div>');
  });

  it('removes multiple event handlers from one element', () => {
    const input = '<a onclick="x()" onmouseover="y()">link</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onmouseover');
    expect(result).toContain('>link</a>');
  });

  it('removes event handlers case-insensitively', () => {
    const input = '<div ONCLICK="alert(1)">text</div>';
    expect(sanitizeHtml(input)).toBe('<div>text</div>');
  });
});

// ---------------------------------------------------------------------------
// javascript: URL removal
// ---------------------------------------------------------------------------

describe('sanitizeHtml - javascript: URL removal', () => {
  it('removes javascript: in href (double quotes)', () => {
    const input = '<a href="javascript:alert(1)">link</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
    expect(result).toContain('href=""');
    expect(result).toContain('>link</a>');
  });

  it('removes javascript: in href (single quotes)', () => {
    const input = "<a href='javascript:alert(1)'>link</a>";
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('removes javascript: in src attribute', () => {
    const input = '<img src="javascript:alert(1)" />';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
    expect(result).toContain('src=""');
  });

  it('removes javascript: with spaces before colon', () => {
    const input = '<a href="javascript :alert(1)">link</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript');
  });
});

// ---------------------------------------------------------------------------
// Normal HTML passthrough
// ---------------------------------------------------------------------------

describe('sanitizeHtml - normal HTML passthrough', () => {
  it('passes through regular HTML unchanged', () => {
    const input =
      '<p>Hello <strong>world</strong></p><ul><li>item</li></ul>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('passes through links with normal href', () => {
    const input = '<a href="https://example.com">link</a>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('passes through images with normal src', () => {
    const input = '<img src="https://example.com/img.png" alt="img" />';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('passes through inline styles', () => {
    const input = '<div style="color: red;">text</div>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('passes through tables with styles', () => {
    const input =
      '<table style="border-collapse: collapse;"><tr><td style="border: 1px solid #d9d9d9;">cell</td></tr></table>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('passes through empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Dangerous tag removal (iframe, embed, object, style, form, etc.)
// ---------------------------------------------------------------------------

describe('sanitizeHtml - dangerous tag removal', () => {
  it('removes iframe tags', () => {
    expect(sanitizeHtml('<iframe src="https://evil.com"></iframe>')).toBe('');
  });

  it('removes embed tags', () => {
    expect(sanitizeHtml('<embed src="evil.swf">')).toBe('');
  });

  it('removes object tags', () => {
    expect(sanitizeHtml('<object data="evil.swf"></object>')).toBe('');
  });

  it('removes style tags', () => {
    expect(sanitizeHtml('<style>body{display:none}</style>')).toBe('');
  });

  it('removes form tags', () => {
    expect(sanitizeHtml('<form action="evil"><input></form>')).toBe('');
  });

  it('removes applet tags', () => {
    expect(sanitizeHtml('<applet code="Evil.class"></applet>')).toBe('');
  });

  it('removes base tags', () => {
    expect(sanitizeHtml('<base href="https://evil.com">')).toBe('');
  });

  it('removes meta tags', () => {
    expect(sanitizeHtml('<meta http-equiv="refresh" content="0;url=evil">')).toBe('');
  });

  it('removes dangerous tags case-insensitively', () => {
    expect(sanitizeHtml('<IFRAME src="evil"></IFRAME>')).toBe('');
    expect(sanitizeHtml('<Style>body{}</Style>')).toBe('');
  });

  it('preserves surrounding content when removing dangerous tags', () => {
    const input = '<p>before</p><iframe src="evil"></iframe><p>after</p>';
    expect(sanitizeHtml(input)).toBe('<p>before</p><p>after</p>');
  });
});

// ---------------------------------------------------------------------------
// data: and vbscript: URI removal
// ---------------------------------------------------------------------------

describe('sanitizeHtml - data: and vbscript: URI removal', () => {
  it('removes data: URIs in href', () => {
    const input = '<a href="data:text/html,<script>alert(1)</script>">link</a>';
    expect(sanitizeHtml(input)).not.toContain('data:');
  });

  it('removes data: URIs in src', () => {
    const input = '<img src="data:image/svg+xml,<svg onload=alert(1)>">';
    expect(sanitizeHtml(input)).not.toContain('data:');
  });

  it('removes vbscript: URIs', () => {
    const input = '<a href="vbscript:MsgBox(1)">link</a>';
    expect(sanitizeHtml(input)).not.toContain('vbscript:');
  });

  it('removes vbscript: URIs in single quotes', () => {
    const input = "<a href='vbscript:MsgBox(1)'>link</a>";
    expect(sanitizeHtml(input)).not.toContain('vbscript:');
  });

  it('removes data: URIs in action attribute', () => {
    const input = '<form action="data:text/html,<script>alert(1)</script>">';
    expect(sanitizeHtml(input)).not.toContain('data:');
  });
});

// ---------------------------------------------------------------------------
// Unquoted javascript: URL removal
// ---------------------------------------------------------------------------

describe('sanitizeHtml - unquoted javascript: URL removal', () => {
  it('removes unquoted javascript: URLs', () => {
    const input = '<a href=javascript:alert(1)>click</a>';
    expect(sanitizeHtml(input)).not.toContain('javascript:');
  });

  it('removes unquoted vbscript: URLs', () => {
    const input = '<a href=vbscript:MsgBox(1)>click</a>';
    expect(sanitizeHtml(input)).not.toContain('vbscript:');
  });

  it('removes unquoted data: URLs', () => {
    const input = '<a href=data:text/html,evil>click</a>';
    expect(sanitizeHtml(input)).not.toContain('data:');
  });
});

// ---------------------------------------------------------------------------
// Nested / obfuscated XSS attempts
// ---------------------------------------------------------------------------

describe('sanitizeHtml - nested and obfuscated XSS', () => {
  it('handles script inside other elements', () => {
    const input = '<div><script>alert(1)</script></div>';
    expect(sanitizeHtml(input)).toBe('<div></div>');
  });

  it('handles event handler with encoded content', () => {
    const input = '<img src="x" onerror="alert(&#39;xss&#39;)" />';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onerror');
  });

  it('handles multiple attack vectors combined', () => {
    const input =
      '<p onclick="x()">text</p><script>evil()</script><a href="javascript:void(0)">link</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('javascript:');
  });

  it('handles script tag with extra whitespace', () => {
    const input = '<script  type="text/javascript" >alert(1)</script >';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('alert');
  });
});

// ---------------------------------------------------------------------------
// HTML entity encoded attacks (#47)
// ---------------------------------------------------------------------------

describe('HTML entity encoded attacks', () => {
  it('neutralizes entity-encoded javascript: in href', () => {
    const input = '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">link</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('neutralizes hex entity-encoded javascript: in href', () => {
    const input = '<a href="&#x6A;avascript:alert(1)">link</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });
});
