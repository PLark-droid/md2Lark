import { postprocessHtml } from '../../src/core/postprocessor';

describe('postprocessHtml', () => {
  describe('wrapTablesForOverflow', () => {
    it('should wrap tables with overflow div', () => {
      const input =
        '<table style="border-collapse: collapse;"><tr><td>cell</td></tr></table>';
      const result = postprocessHtml(input);
      expect(result).toContain(
        '<div style="overflow-x: auto; max-width: 100%;">',
      );
      expect(result).toContain('</table></div>');
    });

    it('should wrap multiple tables', () => {
      const input =
        '<table><tr><td>1</td></tr></table><p>text</p><table><tr><td>2</td></tr></table>';
      const result = postprocessHtml(input);
      const divCount = (
        result.match(/<div style="overflow-x: auto/g) || []
      ).length;
      expect(divCount).toBe(2);
    });

    it('should handle HTML without tables', () => {
      const input = '<p>No tables here</p>';
      const result = postprocessHtml(input);
      expect(result).toBe('<p>No tables here</p>');
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      expect(postprocessHtml('')).toBe('');
    });

    it('should not double-wrap already wrapped tables', () => {
      const input = '<div style="overflow-x: auto; max-width: 100%;"><table><tr><td>cell</td></tr></table></div>';
      const result = postprocessHtml(input);
      const divCount = (result.match(/<div style="overflow-x: auto/g) || []).length;
      expect(divCount).toBe(1);
    });
  });
});
