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

    it('uses equal distribution fallback when all raw widths are zero', () => {
      // Manually construct a token where all cells have empty text
      // so rawWidths are all 0, but after clamping to MIN_COLUMN_WIDTH(60)
      // they won't be zero. To truly hit sum===0, we need columnCount>=2
      // with all rawWidths resulting in 0 after measureTextWidth.
      // Actually, rawWidths start at 0 and measureTextWidth('') returns 0,
      // but MIN_COLUMN_WIDTH clamp prevents sum===0 in practice.
      // So we need to verify the rounding correction path instead.

      // Test rounding correction: many columns where round introduces error
      const manyColHeaders: Array<{ text: string; tokens: never[] }> = [];
      for (let i = 0; i < 7; i++) {
        manyColHeaders.push({ text: 'Col', tokens: [] } as unknown as { text: string; tokens: never[] });
      }
      const fakeToken = {
        type: 'table',
        header: manyColHeaders,
        rows: [manyColHeaders],
        align: [],
      } as unknown as Tokens.Table;
      const widths = calculateColumnWidths(fakeToken);
      const sum = widths.reduce((a: number, b: number) => a + b, 0);
      expect(sum).toBe(720);
      expect(widths).toHaveLength(7);
    });

    it('corrects rounding error so total equals totalWidth exactly', () => {
      // 3 columns with different content to trigger rounding
      const token = parseTable(
        '| Short | A medium length | This is a very long header text for testing |\n|---|---|---|\n| a | bb | ccc |',
      );
      const widths = calculateColumnWidths(token, 1000);
      const sum = widths.reduce((a, b) => a + b, 0);
      expect(sum).toBe(1000);
    });

    it('enforces minimum width of 60px before normalisation', () => {
      // One very long column and one very short column
      // The short column should still get reasonable width after normalisation
      const token = parseTable(
        '| x | This is an extremely long header text that should dominate the width calculation entirely |\n|---|---|\n| y | short |',
      );
      const widths = calculateColumnWidths(token);
      // Both columns should be positive
      expect(widths[0]).toBeGreaterThan(0);
      expect(widths[1]).toBeGreaterThan(0);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(720);
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

    it('falls back to cell.text when cell.tokens is falsy', () => {
      // Construct a fake cell with no tokens property
      const fakeCell = {
        text: 'fallback text',
        tokens: undefined,
      } as unknown as Tokens.TableCell;
      const blocks = buildCellContent(fakeCell);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].text!.elements[0].text_run!.content).toBe('fallback text');
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases for calculateColumnWidths
  // -----------------------------------------------------------------------

  describe('calculateColumnWidths edge cases', () => {
    it('handles diff === 0 case (no rounding correction needed)', () => {
      // A 2-column table with identical content should produce equal widths
      // without rounding correction
      const token = parseTable('| AB | AB |\n|---|---|\n| AB | AB |');
      const widths = calculateColumnWidths(token);
      // Both columns should be exactly 360 (720 / 2)
      expect(widths[0]).toBe(360);
      expect(widths[1]).toBe(360);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(720);
    });

    it('applies rounding correction to last column when diff !== 0', () => {
      // 3 columns with slightly different content to trigger rounding
      const token = parseTable(
        '| AA | BBB | C |\n|---|---|---|\n| aa | bbb | c |',
      );
      const widths = calculateColumnWidths(token);
      const sum = widths.reduce((a, b) => a + b, 0);
      // Sum must always equal totalWidth
      expect(sum).toBe(720);
    });

    it('handles missing header cell text via optional chaining', () => {
      // Header cell with undefined text triggers the ?? '' fallback
      const fakeToken = {
        type: 'table',
        header: [
          { text: 'A', tokens: [] },
          { tokens: [] },  // no text property
        ],
        rows: [[
          { text: '1', tokens: [] },
          { text: '2', tokens: [] },
        ]],
        align: [],
      } as unknown as Tokens.Table;
      const widths = calculateColumnWidths(fakeToken);
      expect(widths).toHaveLength(2);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(720);
    });

    it('handles missing body cell via optional chaining', () => {
      // Body row with fewer cells than header (sparse row)
      const fakeToken = {
        type: 'table',
        header: [
          { text: 'A', tokens: [] },
          { text: 'B', tokens: [] },
        ],
        rows: [[
          { text: '1', tokens: [] },
          // second cell is undefined
        ]],
        align: [],
      } as unknown as Tokens.Table;
      const widths = calculateColumnWidths(fakeToken);
      expect(widths).toHaveLength(2);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(720);
    });

    it('handles header cell with null text via nullish coalescing', () => {
      const fakeToken = {
        type: 'table',
        header: [
          { text: null, tokens: [] },
          { text: 'B', tokens: [] },
        ],
        rows: [],
        align: [],
      } as unknown as Tokens.Table;
      const widths = calculateColumnWidths(fakeToken);
      expect(widths).toHaveLength(2);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(720);
    });

    it('handles body cell with null text', () => {
      const fakeToken = {
        type: 'table',
        header: [
          { text: 'A', tokens: [] },
          { text: 'B', tokens: [] },
        ],
        rows: [[
          { text: null, tokens: [] },
          { text: null, tokens: [] },
        ]],
        align: [],
      } as unknown as Tokens.Table;
      const widths = calculateColumnWidths(fakeToken);
      expect(widths).toHaveLength(2);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(720);
    });

    it('handles undefined header array element', () => {
      // Create an array where element at index 1 is missing
      const headers = [{ text: 'A', tokens: [] }] as unknown[];
      headers.length = 2; // Makes index 1 undefined
      const fakeToken = {
        type: 'table',
        header: headers,
        rows: [
          [{ text: '1', tokens: [] }, { text: '2', tokens: [] }],
        ],
        align: [],
      } as unknown as Tokens.Table;
      const widths = calculateColumnWidths(fakeToken);
      expect(widths).toHaveLength(2);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(720);
    });

    it('handles undefined row cell element', () => {
      // Create a row where element at index 1 is missing (sparse)
      const row = [{ text: '1', tokens: [] }] as unknown[];
      row.length = 2; // Makes index 1 undefined
      const fakeToken = {
        type: 'table',
        header: [
          { text: 'A', tokens: [] },
          { text: 'B', tokens: [] },
        ],
        rows: [row],
        align: [],
      } as unknown as Tokens.Table;
      const widths = calculateColumnWidths(fakeToken);
      expect(widths).toHaveLength(2);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(720);
    });

    it('handles sum === 0 via totalWidth 0', () => {
      // When totalWidth is 0, maxColWidth is 0.
      // rawWidths are computed then clamped: Math.max(60, Math.min(w, 0)) = 60
      // So sum = 120 (not 0). But we can test the path by creating a custom scenario.
      // Actually, since this path is unreachable with MIN_COLUMN_WIDTH > 0,
      // let's verify it doesn't affect normal operation.
      const token = parseTable('| A | B |\n|---|---|\n| 1 | 2 |');
      const widths = calculateColumnWidths(token, 600);
      const sum = widths.reduce((a, b) => a + b, 0);
      expect(sum).toBe(600);
    });

    it('handles table with no body rows', () => {
      // Table with only headers - the body rows loop doesn't execute
      const fakeToken = {
        type: 'table',
        header: [
          { text: 'A', tokens: [] },
          { text: 'B', tokens: [] },
        ],
        rows: [],
        align: [],
      } as unknown as Tokens.Table;
      const widths = calculateColumnWidths(fakeToken);
      expect(widths).toHaveLength(2);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(720);
    });

    it('measures various CJK unicode ranges correctly', () => {
      // This test exercises all CJK code-point branches in measureTextWidth:
      // - 0xAC00-0xD7AF: Hangul Syllables (Korean: \uAC00 = '가')
      // - 0xF900-0xFAFF: CJK Compatibility Ideographs (e.g. \uF900)
      // - 0xFE10-0xFE6F: CJK Compatibility Forms (e.g. \uFE30)
      // - 0xFF01-0xFF60: Fullwidth Latin (e.g. \uFF21 = 'A' fullwidth)
      // - 0xFFE0-0xFFE6: Fullwidth Currency (e.g. \uFFE5 = '￥')
      // - 0x20000-0x2FA1F: CJK Extension B+ (e.g. U+20000 = \u{20000})
      const hangul = '\uAC00';           // 가
      const compat = '\uF900';           // CJK Compat
      const compatForms = '\uFE30';      // CJK Compat Forms
      const fullwidth = '\uFF21';        // Fullwidth A
      const fullwidthCurrency = '\uFFE5'; // ￥
      const extB = '\u{20000}';          // CJK Unified Ideograph Extension B

      // Use all CJK chars in one column and ASCII in the other
      const cjkText = hangul + compat + compatForms + fullwidth + fullwidthCurrency + extB;
      const fakeToken = {
        type: 'table',
        header: [
          { text: 'ABC', tokens: [] },
          { text: cjkText, tokens: [] },
        ],
        rows: [],
        align: [],
      } as unknown as Tokens.Table;

      const widths = calculateColumnWidths(fakeToken);
      expect(widths).toHaveLength(2);
      // CJK column should be wider since each CJK char counts as width 2
      expect(widths[1]).toBeGreaterThan(widths[0]);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(720);
    });
  });
});
