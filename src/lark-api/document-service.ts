/**
 * Document creation service for Lark DocX API.
 *
 * Orchestrates the creation of a Lark document and its block content,
 * including special handling for table three-layer structures.
 *
 * @module document-service
 */

import type {
  LarkBlock,
  LarkApiResponse,
  CreateDocumentResponse,
  CreateBlockResponse,
  GetBlockResponse,
} from './types.js';
import type { TableStructure } from './table-builder.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Phases of the document creation pipeline. */
export type DocumentCreationPhase =
  | 'creating-document'
  | 'creating-blocks'
  | 'creating-table'
  | 'done'
  | 'error';

/** Progress information emitted during document creation. */
export interface DocumentCreationProgress {
  phase: DocumentCreationPhase;
  current: number;
  total: number;
  message: string;
}

/** Callback type for progress reporting. */
export type ProgressCallback = (progress: DocumentCreationProgress) => void;

/** Result of a successful document creation. */
export interface DocumentCreationResult {
  documentId: string;
  documentUrl: string;
}

/**
 * Minimal client interface expected by the document service.
 *
 * This decouples the service from a concrete HTTP client implementation,
 * making it easy to mock in tests.
 */
export interface LarkClient {
  /** Send a request to the Lark API. */
  request<T>(method: string, path: string, body?: unknown): Promise<LarkApiResponse<T>>;
  /** Base URL for constructing document URLs. */
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of blocks per batch when adding blocks. */
const BATCH_SIZE = 50;

/** Maximum number of parallel cell-content requests for tables. */
const TABLE_CELL_CONCURRENCY = 5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new Lark document and populate it with the given blocks.
 *
 * @param client - Lark API client.
 * @param title - Document title.
 * @param blocks - Lark blocks to insert into the document body.
 * @param onProgress - Optional callback for progress reporting.
 * @param tableStructures - Optional table structures for three-layer creation.
 * @returns The created document's ID and URL.
 */
export async function createDocumentWithContent(
  client: LarkClient,
  title: string,
  blocks: LarkBlock[],
  onProgress?: ProgressCallback,
  tableStructures?: TableStructure[],
): Promise<DocumentCreationResult> {
  // Phase 1: Create the document
  onProgress?.({
    phase: 'creating-document',
    current: 0,
    total: 1,
    message: `Creating document "${title}"`,
  });

  const createResponse = await client.request<CreateDocumentResponse>(
    'POST',
    '/docx/v1/documents',
    { title },
  );

  if (!createResponse.data) {
    throw new Error('Failed to create document: no data in response');
  }

  const { document_id: documentId } = createResponse.data.document;

  // Get the root block ID (page block) - the document_id doubles as root block_id
  const rootBlockId = documentId;

  // Phase 2: Insert blocks
  await insertBlocksToDocument(
    client,
    documentId,
    rootBlockId,
    blocks,
    onProgress,
    tableStructures,
  );

  // Done
  const baseUrl = client.baseUrl ?? 'https://open.larksuite.com';
  const documentUrl = `${baseUrl}/docx/${documentId}`;

  onProgress?.({
    phase: 'done',
    current: 1,
    total: 1,
    message: 'Document created successfully',
  });

  return { documentId, documentUrl };
}

/**
 * Insert blocks into a document, handling tables with three-layer creation.
 *
 * @param client - Lark API client.
 * @param docId - Document ID.
 * @param parentBlockId - Parent block ID to insert children into.
 * @param blocks - Blocks to insert.
 * @param onProgress - Optional progress callback.
 * @param tableStructures - Optional table structures for three-layer creation.
 */
export async function insertBlocksToDocument(
  client: LarkClient,
  docId: string,
  parentBlockId: string,
  blocks: LarkBlock[],
  onProgress?: ProgressCallback,
  tableStructures?: TableStructure[],
): Promise<void> {
  // Separate table blocks from non-table blocks, preserving order.
  // We process them in sequence to maintain document order.
  const tableStructureMap = new Map<LarkBlock, TableStructure>();
  if (tableStructures) {
    for (const ts of tableStructures) {
      tableStructureMap.set(ts.tableBlock, ts);
    }
  }

  // Group consecutive non-table blocks into batches.
  let currentBatch: LarkBlock[] = [];
  const segments: Array<{ type: 'batch'; blocks: LarkBlock[] } | { type: 'table'; structure: TableStructure }> = [];

  for (const block of blocks) {
    const tableStructure = tableStructureMap.get(block);
    if (tableStructure) {
      // Flush accumulated non-table blocks first
      if (currentBatch.length > 0) {
        segments.push({ type: 'batch', blocks: currentBatch });
        currentBatch = [];
      }
      segments.push({ type: 'table', structure: tableStructure });
    } else {
      currentBatch.push(block);
    }
  }
  if (currentBatch.length > 0) {
    segments.push({ type: 'batch', blocks: currentBatch });
  }

  // Process segments in order
  const totalSegments = segments.length;
  for (let i = 0; i < totalSegments; i++) {
    const segment = segments[i];
    if (segment.type === 'batch') {
      await addBlocksInBatches(
        client,
        docId,
        parentBlockId,
        segment.blocks,
        onProgress,
      );
    } else {
      onProgress?.({
        phase: 'creating-table',
        current: i + 1,
        total: totalSegments,
        message: 'Creating table structure',
      });
      await createTableBlock(
        client,
        docId,
        parentBlockId,
        segment.structure.tableBlock,
        segment.structure.cellContents,
      );
    }
  }
}

/**
 * Add blocks to a document in batches of {@link BATCH_SIZE}.
 *
 * @param client - Lark API client.
 * @param docId - Document ID.
 * @param parentBlockId - Parent block ID.
 * @param blocks - Blocks to add (must not include table blocks).
 * @param onProgress - Optional progress callback.
 */
export async function addBlocksInBatches(
  client: LarkClient,
  docId: string,
  parentBlockId: string,
  blocks: LarkBlock[],
  onProgress?: ProgressCallback,
): Promise<void> {
  const totalBatches = Math.ceil(blocks.length / BATCH_SIZE);

  for (let i = 0; i < totalBatches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, blocks.length);
    const batch = blocks.slice(start, end);

    onProgress?.({
      phase: 'creating-blocks',
      current: i + 1,
      total: totalBatches,
      message: `Adding blocks batch ${i + 1}/${totalBatches} (${batch.length} blocks)`,
    });

    await client.request<CreateBlockResponse>(
      'POST',
      `/docx/v1/documents/${docId}/blocks/${parentBlockId}/children`,
      { children: batch },
    );
  }
}

/**
 * Create a table using the three-layer API pattern.
 *
 * 1. Create the table block -> get table_block_id
 * 2. Get the table block info -> get cell_block_ids (children)
 * 3. Add content to each cell (with bounded concurrency)
 *
 * @param client - Lark API client.
 * @param docId - Document ID.
 * @param parentBlockId - Parent block ID to attach the table to.
 * @param tableBlock - The table block definition (block_type=31).
 * @param cellContents - Content blocks for each cell in row-major order.
 */
export async function createTableBlock(
  client: LarkClient,
  docId: string,
  parentBlockId: string,
  tableBlock: LarkBlock,
  cellContents: LarkBlock[][],
): Promise<void> {
  // Step 1: Create the table block
  const createResult = await client.request<CreateBlockResponse>(
    'POST',
    `/docx/v1/documents/${docId}/blocks/${parentBlockId}/children`,
    { children: [tableBlock] },
  );

  if (!createResult.data?.children?.[0]) {
    throw new Error('Failed to create table block: no children in response');
  }

  const tableBlockId = createResult.data.children[0].block_id;

  // Step 2: Get table block details to retrieve cell block IDs
  const blockInfo = await client.request<GetBlockResponse>(
    'GET',
    `/docx/v1/documents/${docId}/blocks/${tableBlockId}`,
  );

  if (!blockInfo.data?.block?.children) {
    throw new Error('Failed to get table block children: no children in response');
  }

  const cellBlockIds = blockInfo.data.block.children;

  // Step 3: Add content to each cell with bounded concurrency
  const tasks: Array<() => Promise<void>> = [];

  for (let i = 0; i < Math.min(cellBlockIds.length, cellContents.length); i++) {
    const cellBlockId = cellBlockIds[i];
    const content = cellContents[i];

    if (content.length > 0) {
      tasks.push(async () => {
        await client.request<CreateBlockResponse>(
          'POST',
          `/docx/v1/documents/${docId}/blocks/${cellBlockId}/children`,
          { children: content },
        );
      });
    }
  }

  // Execute with bounded concurrency
  await runWithConcurrency(tasks, TABLE_CELL_CONCURRENCY);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execute async tasks with a maximum concurrency limit.
 *
 * @param tasks - Array of task functions to execute.
 * @param concurrency - Maximum number of simultaneous tasks.
 */
async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  concurrency: number,
): Promise<void> {
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = task().then(() => {
      executing.delete(p);
    });
    executing.add(p);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}
