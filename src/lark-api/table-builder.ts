/**
 * Table structure builder for Lark DocX API.
 *
 * Lark tables use a three-layer hierarchy:
 *   Table (block_type=31) -> TableCell (block_type=32) -> Content blocks
 *
 * This module generates the structural data needed to create a table via the
 * Block API. It does NOT make any API calls itself.
 *
 * @module table-builder
 */

import type { Tokens, Token } from 'marked';
import type { LarkBlock, TextElement } from './types.js';
import { parseInlineTokens } from './block-converter.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Data extracted from a markdown table. */
export interface TableData {
  /** Header row cell texts (each cell has inline tokens). */
  headers: string[][];
  /** Body rows cell texts. */
  rows: string[][];
}

/**
 * Structure produced by the table builder, ready for API submission.
 */
export interface TableStructure {
  /** The table block to create first (block_type=31). */
  tableBlock: LarkBlock;
  /**
   * Content blocks for each cell in row-major order.
   * Each inner array holds the content blocks for one cell (typically a
   * single text block).
   *
   * Layout: [row0col0, row0col1, ..., row1col0, ...]
   */
  cellContents: LarkBlock[][];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default total table width in pixels for a Lark document. */
const DEFAULT_TABLE_WIDTH = 720;

/** Minimum width for any column in pixels. */
const MIN_COLUMN_WIDTH = 60;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the three-layer table structure from a `marked` Table token.
 *
 * @param token - A table token produced by `marked.Lexer.lex()`.
 * @param totalWidth - Total table width in pixels (default: 720).
 * @returns A {@link TableStructure} ready for sequential API submission.
 */
export function buildTableStructure(
  token: Tokens.Table,
  totalWidth: number = DEFAULT_TABLE_WIDTH,
): TableStructure {
  const columnCount = token.header.length;
  const rowCount = 1 + token.rows.length; // header + body rows
  const columnWidths = calculateColumnWidths(token, totalWidth);

  const tableBlock: LarkBlock = {
    block_type: 31,
    table: {
      column_size: columnCount,
      row_size: rowCount,
      column_width: columnWidths,
    },
  };

  // Build cell contents in row-major order: header row first, then body rows.
  const cellContents: LarkBlock[][] = [];

  // Header cells
  for (const headerCell of token.header) {
    cellContents.push(buildCellContent(headerCell));
  }

  // Body cells
  for (const row of token.rows) {
    for (const cell of row) {
      cellContents.push(buildCellContent(cell));
    }
  }

  return { tableBlock, cellContents };
}

/**
 * Calculate pixel widths for each column based on content lengths.
 *
 * CJK characters count as width 2, ASCII characters as width 1.
 * Column widths are clamped to [{@link MIN_COLUMN_WIDTH}, totalWidth * 0.6]
 * and then normalised so their sum equals `totalWidth`.
 *
 * @param token - Marked table token.
 * @param totalWidth - Total table width in pixels.
 * @returns Array of pixel widths, one per column.
 */
export function calculateColumnWidths(
  token: Tokens.Table,
  totalWidth: number = DEFAULT_TABLE_WIDTH,
): number[] {
  const columnCount = token.header.length;
  if (columnCount === 0) return [];
  if (columnCount === 1) return [totalWidth];

  const maxColWidth = totalWidth * 0.6;

  // Measure text width for each column across all rows (header + body).
  const rawWidths: number[] = new Array<number>(columnCount).fill(0);

  for (let col = 0; col < columnCount; col++) {
    // Header
    const headerText = token.header[col]?.text ?? '';
    rawWidths[col] = Math.max(rawWidths[col], measureTextWidth(headerText));

    // Body rows
    for (const row of token.rows) {
      const cellText = row[col]?.text ?? '';
      rawWidths[col] = Math.max(rawWidths[col], measureTextWidth(cellText));
    }
  }

  // Clamp widths
  const clamped = rawWidths.map((w) =>
    Math.max(MIN_COLUMN_WIDTH, Math.min(w, maxColWidth)),
  );

  // Normalise so sum equals totalWidth
  const sum = clamped.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    // Equal distribution fallback
    const equal = Math.floor(totalWidth / columnCount);
    const widths = new Array<number>(columnCount).fill(equal);
    widths[columnCount - 1] = totalWidth - equal * (columnCount - 1);
    return widths;
  }

  const scale = totalWidth / sum;
  const widths = clamped.map((w) => Math.round(w * scale));

  // Correct rounding errors so sum is exact.
  const currentSum = widths.reduce((a, b) => a + b, 0);
  const diff = totalWidth - currentSum;
  if (diff !== 0) {
    // Apply the difference to the last column.
    widths[columnCount - 1] += diff;
  }

  return widths;
}

/**
 * Build content blocks for a single table cell.
 *
 * Each cell becomes one text block (block_type=2) containing the cell's
 * inline content.
 *
 * @param cell - A table cell from the marked token.
 * @returns Array of LarkBlock objects (typically a single text block).
 */
export function buildCellContent(cell: Tokens.TableCell): LarkBlock[] {
  const elements: TextElement[] = cell.tokens
    ? parseInlineTokens(cell.tokens as Token[])
    : [{ text_run: { content: cell.text } }];

  return [
    {
      block_type: 2,
      text: { elements },
    },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * CJK Unicode ranges used for text width measurement.
 * Matches CJK Unified Ideographs, Extension A/B, Compatibility Ideographs,
 * Hiragana, Katakana, Hangul Syllables, and full-width characters.
 */
const CJK_REGEX =
  /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u{20000}-\u{2FA1F}]/u;

/**
 * Measure approximate pixel width of text for column sizing.
 *
 * CJK characters are counted as width 2 (they are typically double-width),
 * while ASCII / Latin characters are counted as width 1.
 *
 * @param text - Plain text content of a cell.
 * @returns Approximate width score.
 */
function measureTextWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += CJK_REGEX.test(char) ? 2 : 1;
  }
  // Scale to approximate pixel width (roughly 8px per unit).
  return width * 8;
}
