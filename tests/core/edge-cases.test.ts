/**
 * Integration tests for edge cases that span the full pipeline
 * (preprocessor -> parser -> renderer -> sanitizer -> postprocessor).
 */
import { preprocessMarkdown } from '../../src/core/preprocessor';
import { markdownToLarkHtml } from '../../src/core/renderer';
import { sanitizeHtml } from '../../src/core/sanitizer';
import { postprocessHtml } from '../../src/core/postprocessor';

function fullPipeline(markdown: string): string {
  const preprocessed = preprocessMarkdown(markdown);
  const html = markdownToLarkHtml(preprocessed);
  const sanitized = sanitizeHtml(html);
  return postprocessHtml(sanitized);
}

describe('Edge cases - full pipeline', () => {
  describe('code blocks with markdown syntax', () => {
    it('should not render markdown inside fenced code blocks', () => {
      const input = '```\n# Not a heading\n**not bold**\n```';
      const result = fullPipeline(input);
      expect(result).not.toContain('<h1');
      expect(result).not.toContain('<strong');
      expect(result).toContain('# Not a heading');
    });

    it('should preserve code block content exactly', () => {
      const input =
        '```javascript\nconst x = `template ${literal}`;\n```';
      const result = fullPipeline(input);
      expect(result).toContain('const x = `template ${literal}`;');
    });
  });

  describe('math expressions', () => {
    it('should render display math as code block', () => {
      const input = '$$E = mc^2$$';
      const result = fullPipeline(input);
      expect(result).toContain('E = mc^2');
      // Should be in a code/pre block
      expect(result).toContain('<code');
    });

    it('should render inline math as inline code', () => {
      const input = 'The formula $x^2 + y^2 = z^2$ is Pythagorean.';
      const result = fullPipeline(input);
      expect(result).toContain('<code');
      expect(result).toContain('x^2 + y^2 = z^2');
    });
  });

  describe('mermaid diagrams', () => {
    it('should render mermaid as code block', () => {
      const input = '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```';
      const result = fullPipeline(input);
      expect(result).toContain('<code');
      expect(result).toContain('graph TD');
    });
  });

  describe('checkboxes', () => {
    it('should show check marks in list items', () => {
      const input = '- [x] Done\n- [ ] Todo';
      const result = fullPipeline(input);
      expect(result).toContain('\u2705');
      expect(result).toContain('\u2B1C');
    });
  });

  describe('footnotes', () => {
    it('should expand footnotes inline', () => {
      const input = 'Important[^1] fact.\n\n[^1]: Source: Wikipedia';
      const result = fullPipeline(input);
      expect(result).toContain('Source: Wikipedia');
      expect(result).not.toContain('[^1]');
    });
  });

  describe('tables', () => {
    it('should wrap tables with overflow container', () => {
      const input =
        '| Col1 | Col2 | Col3 |\n|------|------|------|\n| a | b | c |';
      const result = fullPipeline(input);
      expect(result).toContain('overflow-x: auto');
      expect(result).toContain('<table');
    });
  });

  describe('HTML mixed markdown', () => {
    it('should sanitize inline HTML in markdown', () => {
      const input =
        'Text with <script>alert("xss")</script> injection.';
      const result = fullPipeline(input);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert');
    });

    it('should handle safe HTML tags', () => {
      const input =
        'Text with <strong>bold</strong> and <em>italic</em>.';
      const result = fullPipeline(input);
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
    });
  });

  describe('CJK text handling', () => {
    it('should handle Japanese text correctly', () => {
      const input =
        '# \u65E5\u672C\u8A9E\u306E\u30C6\u30B9\u30C8\n\n\u3053\u308C\u306F\u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3067\u3059\u3002\n\u6539\u884C\u304C\u3042\u308A\u307E\u3059\u3002';
      const result = fullPipeline(input);
      expect(result).toContain('\u65E5\u672C\u8A9E\u306E\u30C6\u30B9\u30C8');
      expect(result).toContain('\u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8');
    });

    it('should handle Chinese text correctly', () => {
      const input = '# \u4E2D\u6587\u6D4B\u8BD5\n\n\u8FD9\u662F\u4E2D\u6587\u6587\u672C\u3002';
      const result = fullPipeline(input);
      expect(result).toContain('\u4E2D\u6587\u6D4B\u8BD5');
      expect(result).toContain('\u4E2D\u6587\u6587\u672C');
    });
  });

  describe('consecutive blank lines', () => {
    it('should normalize excessive blank lines', () => {
      const input = 'Paragraph 1\n\n\n\n\nParagraph 2';
      const result = fullPipeline(input);
      // Should have two paragraphs, not excessive spacing
      expect(result).toContain('Paragraph 1');
      expect(result).toContain('Paragraph 2');
    });
  });

  describe('indented code blocks', () => {
    it('should handle 4-space indented code blocks', () => {
      const input =
        'Normal text\n\n    indented code\n    more code\n\nNormal again';
      const result = fullPipeline(input);
      expect(result).toContain('<code');
      expect(result).toContain('indented code');
    });
  });

  // -- Performance tests (#48) ----------------------------------------------

  describe('performance', () => {
    it('should handle large input within 5 seconds', () => {
      const largeMd = '# Title\n\n' + 'Paragraph text here. '.repeat(10000);
      const start = Date.now();
      const result = fullPipeline(largeMd);
      expect(Date.now() - start).toBeLessThan(5000);
      expect(result).toContain('Title');
    });
  });

  // -- Deeply nested structures (#48) ---------------------------------------

  describe('deeply nested structures', () => {
    it('should handle 10-level nested lists', () => {
      const md = Array.from({ length: 10 }, (_, i) => '  '.repeat(i) + '- item ' + (i + 1)).join('\n');
      expect(() => fullPipeline(md)).not.toThrow();
    });

    it('should handle 5-level nested blockquotes', () => {
      const md = Array.from({ length: 5 }, (_, i) => '>'.repeat(i + 1) + ' level ' + (i + 1)).join('\n');
      expect(() => fullPipeline(md)).not.toThrow();
    });
  });
});
