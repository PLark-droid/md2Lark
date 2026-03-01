/**
 * Tests for the LarkClient HTTP client.
 *
 * All external dependencies (fetch, chrome.storage, chrome.identity) are
 * mocked so tests run in a pure Node.js environment.
 */

import { webcrypto } from 'crypto';

import { LarkClient } from '../../src/lark-api/client.js';
import type { LarkClientConfig } from '../../src/lark-api/client.js';
import { LarkApiError, LarkAuthError } from '../../src/lark-api/types.js';
import type { LarkTokenStore } from '../../src/lark-api/types.js';

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

// Polyfill crypto for Node.js.
beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).crypto = webcrypto;
  }
});

// Shared mock state.
type StorageData = Record<string, unknown>;

function createStorageAreaMock() {
  let data: StorageData = {};
  return {
    get: jest.fn((key: string) => Promise.resolve(key in data ? { [key]: data[key] } : {})),
    set: jest.fn((items: StorageData) => {
      Object.assign(data, items);
      return Promise.resolve();
    }),
    remove: jest.fn((key: string) => {
      delete data[key];
      return Promise.resolve();
    }),
    _clear: () => { data = {}; },
    _getData: () => data,
  };
}

let sessionMock: ReturnType<typeof createStorageAreaMock>;
let localMock: ReturnType<typeof createStorageAreaMock>;

// Mock fetch globally.
const fetchMock = jest.fn();

beforeEach(() => {
  sessionMock = createStorageAreaMock();
  localMock = createStorageAreaMock();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).chrome = {
    storage: {
      session: sessionMock,
      local: localMock,
    },
    identity: {
      launchWebAuthFlow: jest.fn(),
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchMock;
  fetchMock.mockReset();
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).chrome;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).fetch;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: LarkClientConfig = {
  region: 'larksuite',
  appId: 'cli_test_app',
  redirectUri: 'https://example.com/callback',
};

/** Seed valid tokens into Chrome storage so client is "authenticated". */
async function seedTokens(overrides?: Partial<LarkTokenStore>): Promise<LarkTokenStore> {
  const store: LarkTokenStore = {
    accessToken: 'valid-access-token',
    refreshToken: 'valid-refresh-token',
    expiresAt: Date.now() + 3_600_000,
    refreshExpiresAt: Date.now() + 86_400_000,
    ...overrides,
  };
  await sessionMock.set({ lark_tokens: store });
  await localMock.set({ lark_tokens: store });
  return store;
}

/** Create a mock Response object. */
function mockResponse(
  status: number,
  body: unknown,
  ok?: boolean,
): Response {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('LarkClient', () => {
  describe('constructor', () => {
    it('should create an instance without errors', () => {
      const client = new LarkClient(DEFAULT_CONFIG);
      expect(client).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // isAuthenticated
  // -----------------------------------------------------------------------

  describe('isAuthenticated', () => {
    it('should return false when no tokens are stored', async () => {
      const client = new LarkClient(DEFAULT_CONFIG);
      const result = await client.isAuthenticated();
      expect(result).toBe(false);
    });

    it('should return true when valid tokens exist', async () => {
      await seedTokens();
      const client = new LarkClient(DEFAULT_CONFIG);
      const result = await client.isAuthenticated();
      expect(result).toBe(true);
    });

    it('should return false when tokens are expired', async () => {
      await seedTokens({ expiresAt: Date.now() - 1000 });
      const client = new LarkClient(DEFAULT_CONFIG);
      const result = await client.isAuthenticated();
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // logout
  // -----------------------------------------------------------------------

  describe('logout', () => {
    it('should clear all stored tokens', async () => {
      await seedTokens();
      const client = new LarkClient(DEFAULT_CONFIG);
      await client.logout();

      const loaded = await sessionMock.get('lark_tokens');
      expect(loaded).toEqual({});
    });
  });

  // -----------------------------------------------------------------------
  // request
  // -----------------------------------------------------------------------

  describe('request', () => {
    it('should throw LarkAuthError when not authenticated', async () => {
      const client = new LarkClient(DEFAULT_CONFIG);
      await expect(client.request('GET', '/test')).rejects.toThrow(LarkAuthError);
    });

    it('should make an authenticated GET request', async () => {
      const tokens = await seedTokens();
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { code: 0, msg: 'ok', data: { result: true } }),
      );

      const client = new LarkClient(DEFAULT_CONFIG);
      const response = await client.request('GET', '/docx/v1/test');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/docx/v1/test'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${tokens.accessToken}`,
          }),
        }),
      );
      expect(response.code).toBe(0);
    });

    it('should make an authenticated POST request with body', async () => {
      await seedTokens();
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { code: 0, msg: 'ok', data: { id: '123' } }),
      );

      const client = new LarkClient(DEFAULT_CONFIG);
      const body = { title: 'Test Document' };
      await client.request('POST', '/docx/v1/documents', body);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    });

    it('should throw LarkApiError on non-ok response', async () => {
      await seedTokens();
      fetchMock.mockResolvedValueOnce(
        mockResponse(400, { code: 1001, msg: 'Bad request' }, false),
      );

      const client = new LarkClient(DEFAULT_CONFIG);
      await expect(client.request('GET', '/test')).rejects.toThrow(LarkApiError);
    });

    it('should throw LarkApiError when code is non-zero', async () => {
      await seedTokens();
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { code: 99999, msg: 'Internal error' }),
      );

      const client = new LarkClient(DEFAULT_CONFIG);
      await expect(client.request('GET', '/test')).rejects.toThrow(LarkApiError);
    });

    it('should attempt token refresh on 401 and retry', async () => {
      // Seed valid tokens.
      await seedTokens();

      // First call returns 401, refresh succeeds, retry returns 200.
      fetchMock
        // First attempt: 401
        .mockResolvedValueOnce(mockResponse(401, { code: 0, msg: 'ok' }, false))
        // Refresh token call
        .mockResolvedValueOnce(
          mockResponse(200, {
            data: {
              access_token: 'new-access-token',
              refresh_token: 'new-refresh-token',
              token_type: 'Bearer',
              expires_in: 7200,
              refresh_expires_in: 86400,
            },
          }),
        )
        // Retry after refresh
        .mockResolvedValueOnce(
          mockResponse(200, { code: 0, msg: 'ok', data: { retry: true } }),
        );

      const client = new LarkClient(DEFAULT_CONFIG);
      const response = await client.request('GET', '/docx/v1/test');
      expect(response.data).toEqual({ retry: true });
    });
  });

  // -----------------------------------------------------------------------
  // createDocument
  // -----------------------------------------------------------------------

  describe('createDocument', () => {
    it('should POST to /docx/v1/documents with title', async () => {
      await seedTokens();
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {
          code: 0,
          msg: 'ok',
          data: {
            document: {
              document_id: 'doc123',
              title: 'Test',
              revision_id: 1,
            },
          },
        }),
      );

      const client = new LarkClient(DEFAULT_CONFIG);
      const response = await client.createDocument('Test');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/docx/v1/documents'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(response.data?.document.document_id).toBe('doc123');
    });

    it('should include folder_token when folderId is provided', async () => {
      await seedTokens();
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {
          code: 0,
          msg: 'ok',
          data: {
            document: {
              document_id: 'doc456',
              title: 'InFolder',
              revision_id: 1,
            },
          },
        }),
      );

      const client = new LarkClient(DEFAULT_CONFIG);
      await client.createDocument('InFolder', 'folder_abc');

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(callBody.folder_token).toBe('folder_abc');
    });
  });

  // -----------------------------------------------------------------------
  // createBlocks
  // -----------------------------------------------------------------------

  describe('createBlocks', () => {
    it('should POST blocks as children of a parent block', async () => {
      await seedTokens();
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {
          code: 0,
          msg: 'ok',
          data: {
            children: [
              { block_id: 'b1', block_type: 2 },
            ],
          },
        }),
      );

      const client = new LarkClient(DEFAULT_CONFIG);
      const blocks = [
        {
          block_type: 2 as const,
          text: {
            elements: [{ text_run: { content: 'Hello' } }],
          },
        },
      ];
      const response = await client.createBlocks('doc1', 'parent1', blocks);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/docx/v1/documents/doc1/blocks/parent1/children'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(response.data?.children).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // getBlock
  // -----------------------------------------------------------------------

  describe('getBlock', () => {
    it('should GET a block by ID', async () => {
      await seedTokens();
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {
          code: 0,
          msg: 'ok',
          data: {
            block: {
              block_id: 'blk1',
              block_type: 1,
              children: ['blk2', 'blk3'],
            },
          },
        }),
      );

      const client = new LarkClient(DEFAULT_CONFIG);
      const response = await client.getBlock('doc1', 'blk1');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/docx/v1/documents/doc1/blocks/blk1'),
        expect.objectContaining({ method: 'GET' }),
      );
      expect(response.data?.block.block_id).toBe('blk1');
    });
  });
});
