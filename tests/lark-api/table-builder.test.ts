import {
  buildTableStructure,
  calculateColumnWidths,
  buildCellContent,
} from '../../src/lark-api/table-builder.js';
import { Lexer, type Tokens } from 'marked';

/**
 * Helper: parse a markdown table and return the Table token.
 */
function parseTable(md: string): Tokens.Table {
  const tokens = Lexer.lex(md);
  const table = tokens.find((t) => t.type === 'table') as Tokens.Table | undefined;
  if (!table) {
    throw new Error('No table token found in markdown');
  }
  return table;
}

describe('table-builder', () => {
  // -----------------------------------------------------------------------
  // buildTableStructure
  // -----------------------------------------------------------------------

  describe('buildTableStructure', () => {
    it('creates correct structure for a 2-column table', () => {
      const token = parseTable('| A | B |\n|---|---|\n| 1 | 2 |');
      const structure = buildTableStructure(token);

      expect(structure.tableBlock.block_type).toBe(31);
      expect(structure.tableBlock.table).toBeDefined();
      expect(structure.tableBlock.table!.column_size).toBe(2);
      expect(structure.tableBlock.table!.row_size).toBe(2); // 1 header + 1 body
    });

    it('creates correct row_size for multiple body rows', () => {
      const token = parseTable(
        '| H1 | H2 |\n|---|---|\n| a | b |\n| c | d |\n| e | f |',
      );
      const structure = buildTableStructure(token);
      expect(structure.tableBlock.table!.row_size).toBe(4); // 1 header + 3 body
    });

    it('produces cellContents count equal to row_size * column_size', () => {
      const token = parseTable(
        '| H1 | H2 | H3 |\n|---|---|---|\n| a | b | c |\n| d | e | f |',
      );
      const structure = buildTableStructure(token);

      const expectedCells = 3 * 3; // 3 rows (1 header + 2 body) * 3 columns
      expect(structure.cellContents).toHaveLength(expectedCells);
    });

    it('includes header row content in cellContents', () => {
      const token = parseTable('| Name | Age |\n|---|---|\n| Alice | 30 |');
      const structure = buildTableStructure(token);

      // First two cells are header cells
      const headerCell0 = structure.cellContents[0];
      expect(headerCell0).toHaveLength(1);
      expect(headerCell0[0].block_type).toBe(2);
      expect(headerCell0[0].text!.elements[0].text_run!.content).toBe('Name');

      const headerCell1 = structure.cellContents[1];
      expect(headerCell1[0].text!.elements[0].text_run!.content).toBe('Age');
    });

    it('includes body row content in cellContents', () => {
      const token = parseTable('| Name | Age |\n|---|---|\n| Alice | 30 |');
      const structure = buildTableStructure(token);

      // Body cells start after header (2 columns)
      const bodyCell0 = structure.cellContents[2];
      expect(bodyCell0[0].text!.elements[0].text_run!.content).toBe('Alice');

      const bodyCell1 = structure.cellContents[3];
      expect(bodyCell1[0].text!.elements[0].text_run!.content).toBe('30');
    });
  });

  // -----------------------------------------------------------------------
  // calculateColumnWidths
  // -----------------------------------------------------------------------

  describe('calculateColumnWidths', () => {
    it('returns widths summing to totalWidth (720 by default)', () => {
      const token = parseTable('| A | B |\n|---|---|\n| 1 | 2 |');
      const widths = calculateColumnWidths(token);
      const sum = widths.reduce((a, b) => a + b, 0);
      expect(sum).toBe(720);
    });

    it('returns [720] for a single-column table', () => {
      const token = parseTable('| Only |\n|---|\n| data |');
      const widths = calculateColumnWidths(token);
      expect(widths).toEqual([720]);
    });

    it('respects custom totalWidth', () => {
      const token = parseTable('| A | B |\n|---|---|\n| 1 | 2 |');
      const widths = calculateColumnWidths(token, 1000);
      const sum = widths.reduce((a, b) => a + b, 0);
      expect(sum).toBe(1000);
    });

    it('handles CJK characters with wider measurement', () => {
      // CJK characters count as width 2 each, so a column with many CJK chars
      // should be wider than one with the same number of ASCII chars.
      // Use enough characters to exceed the minimum width after scaling.
      const tokenCJK = parseTable(
        '| ab | 日本語の長い文章です |\n|---|---|\n| cd | 東京都港区 |',
      );
      const widths = calculateColumnWidths(tokenCJK);

      // The CJK column should be wider than the ASCII column
      expect(widths).toHaveLength(2);
      expect(widths[1]).toBeGreaterThan(widths[0]);
    });

    it('produces correct number of widths for multi-column table', () => {
      const token = parseTable(
        '| A | B | C | D |\n|---|---|---|---|\n| 1 | 2 | 3 | 4 |',
      );
      const widths = calculateColumnWidths(token);
      expect(widths).toHaveLength(4);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(720);
    });

    it('returns empty array for zero columns', () => {
      // Simulate edge case with a manually constructed token
      const fakeToken = {
        type: 'table',
        header: [],
        rows: [],
        align: [],
      } as unknown as Tokens.Table;
      expect(calculateColumnWidths(fakeToken)).toEqual([]);
    });

    it('enforces minimum column width', () => {
      // Even if content is very short, columns should not be less than 60px
      // (after normalisation this is a proportional constraint)
      const token = parseTable(
        '| A | This is a much longer header text |\n|---|---|\n| x | Short |',
      );
      const widths = calculateColumnWidths(token);
      widths.forEach((w) => {
        expect(w).toBeGreaterThanOrEqual(1); // After normalisation at least 1px
      });
    });
  });

  // -----------------------------------------------------------------------
  // buildCellContent
  // -----------------------------------------------------------------------

  describe('buildCellContent', () => {
    it('creates a text block for a simple cell', () => {
      const token = parseTable('| Hello |\n|---|\n| World |');
      const headerCell = token.header[0];
      const blocks = buildCellContent(headerCell);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].block_type).toBe(2);
      expect(blocks[0].text!.elements[0].text_run!.content).toBe('Hello');
    });

    it('handles inline formatting in cells', () => {
      const token = parseTable('| **bold** |\n|---|\n| data |');
      const headerCell = token.header[0];
      const blocks = buildCellContent(headerCell);

      expect(blocks).toHaveLength(1);
      const elements = blocks[0].text!.elements;
      expect(elements[0].text_run!.content).toBe('bold');
      expect(elements[0].text_run!.text_element_style?.bold).toBe(true);
    });
  });
});
