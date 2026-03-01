import {
  createDocumentWithContent,
  addBlocksInBatches,
  createTableBlock,
  insertBlocksToDocument,
  type LarkClient,
  type ProgressCallback,
  type DocumentCreationProgress,
} from '../../src/lark-api/document-service.js';
import type { LarkBlock, LarkApiResponse, CreateDocumentResponse, CreateBlockResponse, GetBlockResponse } from '../../src/lark-api/types.js';
import type { TableStructure } from '../../src/lark-api/table-builder.js';

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function createMockClient(overrides?: Partial<LarkClient>): LarkClient {
  return {
    request: jest.fn().mockResolvedValue({ code: 0, msg: 'ok', data: null }),
    baseUrl: 'https://test.larksuite.com',
    ...overrides,
  };
}

/**
 * Create a mock client that returns appropriate responses for document creation flow.
 */
function createDocFlowMockClient(): LarkClient {
  const request = jest.fn();

  // Default: create document
  request.mockImplementation(
    (method: string, path: string, _body?: unknown): Promise<LarkApiResponse<unknown>> => {
      if (method === 'POST' && path === '/docx/v1/documents') {
        return Promise.resolve({
          code: 0,
          msg: 'ok',
          data: {
            document: {
              document_id: 'doc_123',
              title: 'Test',
              revision_id: 1,
            },
          } satisfies CreateDocumentResponse,
        });
      }

      if (method === 'POST' && path.includes('/children')) {
        return Promise.resolve({
          code: 0,
          msg: 'ok',
          data: {
            children: [
              { block_id: 'blk_001', block_type: 2 },
            ],
          } satisfies CreateBlockResponse,
        });
      }

      if (method === 'GET' && path.includes('/blocks/')) {
        return Promise.resolve({
          code: 0,
          msg: 'ok',
          data: {
            block: {
              block_id: 'tbl_001',
              block_type: 31,
              children: ['cell_001', 'cell_002', 'cell_003', 'cell_004'],
            },
          } satisfies GetBlockResponse,
        });
      }

      return Promise.resolve({ code: 0, msg: 'ok', data: null });
    },
  );

  return { request, baseUrl: 'https://test.larksuite.com' };
}

// ---------------------------------------------------------------------------
// Helper: create simple text blocks
// ---------------------------------------------------------------------------

function makeTextBlock(content: string): LarkBlock {
  return {
    block_type: 2,
    text: {
      elements: [{ text_run: { content } }],
    },
  };
}

function makeTableBlock(): LarkBlock {
  return {
    block_type: 31,
    table: { column_size: 2, row_size: 2 },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('document-service', () => {
  // -----------------------------------------------------------------------
  // createDocumentWithContent
  // -----------------------------------------------------------------------

  describe('createDocumentWithContent', () => {
    it('creates a document and adds blocks', async () => {
      const client = createDocFlowMockClient();
      const blocks = [makeTextBlock('Hello'), makeTextBlock('World')];

      const result = await createDocumentWithContent(client, 'Test Doc', blocks);

      expect(result.documentId).toBe('doc_123');
      expect(result.documentUrl).toContain('doc_123');

      // Should have called: create doc + add blocks batch
      expect(client.request).toHaveBeenCalledWith(
        'POST',
        '/docx/v1/documents',
        { title: 'Test Doc' },
      );
    });

    it('reports progress via callback', async () => {
      const client = createDocFlowMockClient();
      const blocks = [makeTextBlock('Hello')];
      const progress: DocumentCreationProgress[] = [];
      const onProgress: ProgressCallback = (p) => progress.push({ ...p });

      await createDocumentWithContent(client, 'Test', blocks, onProgress);

      // Should have: creating-document, creating-blocks, done
      const phases = progress.map((p) => p.phase);
      expect(phases).toContain('creating-document');
      expect(phases).toContain('creating-blocks');
      expect(phases).toContain('done');
    });

    it('uses default baseUrl when client has none', async () => {
      const request = jest.fn().mockImplementation(
        (method: string, path: string): Promise<LarkApiResponse<unknown>> => {
          if (method === 'POST' && path === '/docx/v1/documents') {
            return Promise.resolve({
              code: 0,
              msg: 'ok',
              data: {
                document: {
                  document_id: 'doc_456',
                  title: 'Test',
                  revision_id: 1,
                },
              } satisfies CreateDocumentResponse,
            });
          }
          return Promise.resolve({
            code: 0,
            msg: 'ok',
            data: { children: [] } satisfies CreateBlockResponse,
          });
        },
      );
      const client: LarkClient = { request };

      const result = await createDocumentWithContent(client, 'Test', []);
      expect(result.documentUrl).toContain('https://open.larksuite.com');
    });

    it('throws when document creation returns no data', async () => {
      const client = createMockClient({
        request: jest.fn().mockResolvedValue({ code: 0, msg: 'ok', data: null }),
      });

      await expect(
        createDocumentWithContent(client, 'Test', []),
      ).rejects.toThrow('Failed to create document');
    });
  });

  // -----------------------------------------------------------------------
  // addBlocksInBatches
  // -----------------------------------------------------------------------

  describe('addBlocksInBatches', () => {
    it('sends all blocks in a single batch when count <= 50', async () => {
      const client = createMockClient({
        request: jest.fn().mockResolvedValue({
          code: 0,
          msg: 'ok',
          data: { children: [] },
        }),
      });

      const blocks = Array.from({ length: 30 }, (_, i) => makeTextBlock(`Block ${i}`));
      await addBlocksInBatches(client, 'doc_1', 'root_1', blocks);

      expect(client.request).toHaveBeenCalledTimes(1);
    });

    it('splits 60 blocks into 2 batches (50 + 10)', async () => {
      const client = createMockClient({
        request: jest.fn().mockResolvedValue({
          code: 0,
          msg: 'ok',
          data: { children: [] },
        }),
      });

      const blocks = Array.from({ length: 60 }, (_, i) => makeTextBlock(`Block ${i}`));
      await addBlocksInBatches(client, 'doc_1', 'root_1', blocks);

      expect(client.request).toHaveBeenCalledTimes(2);

      // First batch: 50 blocks
      const firstCall = (client.request as jest.Mock).mock.calls[0];
      expect(firstCall[2].children).toHaveLength(50);

      // Second batch: 10 blocks
      const secondCall = (client.request as jest.Mock).mock.calls[1];
      expect(secondCall[2].children).toHaveLength(10);
    });

    it('splits 150 blocks into 3 batches (50 + 50 + 50)', async () => {
      const client = createMockClient({
        request: jest.fn().mockResolvedValue({
          code: 0,
          msg: 'ok',
          data: { children: [] },
        }),
      });

      const blocks = Array.from({ length: 150 }, (_, i) => makeTextBlock(`Block ${i}`));
      await addBlocksInBatches(client, 'doc_1', 'root_1', blocks);

      expect(client.request).toHaveBeenCalledTimes(3);
    });

    it('reports progress for each batch', async () => {
      const client = createMockClient({
        request: jest.fn().mockResolvedValue({
          code: 0,
          msg: 'ok',
          data: { children: [] },
        }),
      });

      const blocks = Array.from({ length: 60 }, (_, i) => makeTextBlock(`Block ${i}`));
      const progress: DocumentCreationProgress[] = [];
      const onProgress: ProgressCallback = (p) => progress.push({ ...p });

      await addBlocksInBatches(client, 'doc_1', 'root_1', blocks, onProgress);

      expect(progress).toHaveLength(2);
      expect(progress[0].phase).toBe('creating-blocks');
      expect(progress[0].current).toBe(1);
      expect(progress[0].total).toBe(2);
      expect(progress[1].current).toBe(2);
    });

    it('handles empty block array without making API calls', async () => {
      const client = createMockClient();
      await addBlocksInBatches(client, 'doc_1', 'root_1', []);
      expect(client.request).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // createTableBlock - three-layer creation
  // -----------------------------------------------------------------------

  describe('createTableBlock', () => {
    it('performs three-step API calls for table creation', async () => {
      const client = createDocFlowMockClient();
      const tableBlock = makeTableBlock();
      const cellContents: LarkBlock[][] = [
        [makeTextBlock('H1')],
        [makeTextBlock('H2')],
        [makeTextBlock('D1')],
        [makeTextBlock('D2')],
      ];

      await createTableBlock(client, 'doc_1', 'root_1', tableBlock, cellContents);

      const calls = (client.request as jest.Mock).mock.calls;

      // Step 1: Create table block (POST children)
      expect(calls[0][0]).toBe('POST');
      expect(calls[0][1]).toContain('/children');

      // Step 2: Get table block info (GET)
      expect(calls[1][0]).toBe('GET');
      expect(calls[1][1]).toContain('/blocks/');

      // Step 3: Add content to cells (POST for each cell)
      const cellCalls = calls.slice(2);
      expect(cellCalls.length).toBe(4); // 4 cells
      cellCalls.forEach((call: unknown[]) => {
        expect(call[0]).toBe('POST');
        expect((call[1] as string)).toContain('/children');
      });
    });

    it('throws when table creation returns no children', async () => {
      const client = createMockClient({
        request: jest.fn().mockResolvedValue({
          code: 0,
          msg: 'ok',
          data: { children: [] },
        }),
      });

      await expect(
        createTableBlock(client, 'doc_1', 'root_1', makeTableBlock(), []),
      ).rejects.toThrow('Failed to create table block');
    });

    it('throws when table block has no children IDs', async () => {
      const request = jest.fn();
      // Step 1 succeeds
      request.mockResolvedValueOnce({
        code: 0,
        msg: 'ok',
        data: { children: [{ block_id: 'tbl_001', block_type: 31 }] },
      });
      // Step 2 returns no children
      request.mockResolvedValueOnce({
        code: 0,
        msg: 'ok',
        data: { block: { block_id: 'tbl_001', block_type: 31 } },
      });

      const client: LarkClient = { request };

      await expect(
        createTableBlock(client, 'doc_1', 'root_1', makeTableBlock(), [
          [makeTextBlock('test')],
        ]),
      ).rejects.toThrow('Failed to get table block children');
    });
  });

  // -----------------------------------------------------------------------
  // insertBlocksToDocument
  // -----------------------------------------------------------------------

  describe('insertBlocksToDocument', () => {
    it('handles mix of regular blocks and table blocks', async () => {
      const client = createDocFlowMockClient();
      const tableBlock = makeTableBlock();
      const blocks: LarkBlock[] = [
        makeTextBlock('Before table'),
        tableBlock,
        makeTextBlock('After table'),
      ];

      const tableStructure: TableStructure = {
        tableBlock,
        cellContents: [
          [makeTextBlock('H1')],
          [makeTextBlock('H2')],
          [makeTextBlock('D1')],
          [makeTextBlock('D2')],
        ],
      };

      await insertBlocksToDocument(
        client,
        'doc_1',
        'root_1',
        blocks,
        undefined,
        [tableStructure],
      );

      const calls = (client.request as jest.Mock).mock.calls;
      // Should have: batch(1 block) + table(3 steps + 4 cells) + batch(1 block)
      expect(calls.length).toBeGreaterThanOrEqual(3);
    });

    it('processes all blocks as batches when no table structures provided', async () => {
      const client = createMockClient({
        request: jest.fn().mockResolvedValue({
          code: 0,
          msg: 'ok',
          data: { children: [] },
        }),
      });

      const blocks = [makeTextBlock('A'), makeTextBlock('B')];
      await insertBlocksToDocument(client, 'doc_1', 'root_1', blocks);

      expect(client.request).toHaveBeenCalledTimes(1);
    });

    it('reports creating-table phase for table segments', async () => {
      const client = createDocFlowMockClient();
      const tableBlock = makeTableBlock();
      const blocks: LarkBlock[] = [tableBlock];
      const tableStructure: TableStructure = {
        tableBlock,
        cellContents: [
          [makeTextBlock('H1')],
          [makeTextBlock('H2')],
          [makeTextBlock('D1')],
          [makeTextBlock('D2')],
        ],
      };

      const progress: DocumentCreationProgress[] = [];
      const onProgress: ProgressCallback = (p) => progress.push({ ...p });

      await insertBlocksToDocument(
        client,
        'doc_1',
        'root_1',
        blocks,
        onProgress,
        [tableStructure],
      );

      const tablePhases = progress.filter((p) => p.phase === 'creating-table');
      expect(tablePhases.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // runWithConcurrency (via createTableBlock)
  // -----------------------------------------------------------------------

  describe('runWithConcurrency via createTableBlock', () => {
    it('limits concurrent cell operations to 5 for 8 cells', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;
      const request = jest.fn();

      // Step 1: Create table block
      request.mockResolvedValueOnce({
        code: 0,
        msg: 'ok',
        data: {
          children: [{ block_id: 'tbl_001', block_type: 31 }],
        } satisfies CreateBlockResponse,
      });

      // Step 2: Get table block - return 8 cell IDs
      request.mockResolvedValueOnce({
        code: 0,
        msg: 'ok',
        data: {
          block: {
            block_id: 'tbl_001',
            block_type: 31,
            children: [
              'cell_01', 'cell_02', 'cell_03', 'cell_04',
              'cell_05', 'cell_06', 'cell_07', 'cell_08',
            ],
          },
        } satisfies GetBlockResponse,
      });

      // Step 3: Cell content calls - track concurrency
      request.mockImplementation(
        (method: string, path: string): Promise<LarkApiResponse<unknown>> => {
          if (method === 'POST' && path.includes('/children') && path.includes('cell_')) {
            currentConcurrent++;
            maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
            return new Promise((resolve) => {
              setTimeout(() => {
                currentConcurrent--;
                resolve({
                  code: 0,
                  msg: 'ok',
                  data: { children: [] },
                });
              }, 10);
            });
          }
          return Promise.resolve({ code: 0, msg: 'ok', data: null });
        },
      );

      const client: LarkClient = { request };
      const tableBlock = makeTableBlock();
      const cellContents: LarkBlock[][] = Array.from({ length: 8 }, (_, i) => [
        makeTextBlock(`Cell ${i}`),
      ]);

      await createTableBlock(client, 'doc_1', 'root_1', tableBlock, cellContents);

      // maxConcurrent should be at most 5 (TABLE_CELL_CONCURRENCY)
      expect(maxConcurrent).toBeLessThanOrEqual(5);
      // At least 2 should run concurrently for 8 cells
      expect(maxConcurrent).toBeGreaterThanOrEqual(2);
    });
  });
});
