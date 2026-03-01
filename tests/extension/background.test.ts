/**
 * Tests for the background service worker Lark OAuth integration.
 *
 * All Chrome APIs are mocked so tests run in a pure Node.js environment.
 * The chrome global is set up before the module is imported so that the
 * top-level side effects (listener registration) run against our mocks.
 */

import { webcrypto } from 'crypto';

// ---------------------------------------------------------------------------
// Chrome API mocks - set up BEFORE any import of the module under test
// ---------------------------------------------------------------------------

type StorageCallback = (items: Record<string, unknown>) => void;
type MessageListener = (
  message: { type: string; [key: string]: unknown },
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

let syncStorage: Record<string, unknown> = {};
const messageListeners: MessageListener[] = [];

// Polyfill crypto for Node.js.
if (!globalThis.crypto?.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).chrome = {
  runtime: {
    id: 'test-extension-id',
    onMessage: {
      addListener: jest.fn((listener: MessageListener) => {
        messageListeners.push(listener);
      }),
    },
  },
  commands: {
    onCommand: {
      addListener: jest.fn(),
    },
  },
  action: {
    setBadgeText: jest.fn().mockResolvedValue(undefined),
    setBadgeBackgroundColor: jest.fn().mockResolvedValue(undefined),
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
  },
  scripting: {
    executeScript: jest.fn(),
  },
  storage: {
    sync: {
      get: jest.fn(
        (defaults: Record<string, unknown>, callback: StorageCallback) => {
          const result = { ...defaults };
          for (const key of Object.keys(defaults)) {
            if (key in syncStorage) {
              result[key] = syncStorage[key];
            }
          }
          callback(result);
        },
      ),
    },
    session: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    },
  },
  identity: {
    launchWebAuthFlow: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Mock lark-api modules
// ---------------------------------------------------------------------------

const mockAuthenticate = jest.fn();
const mockLarkClientConstructor = jest.fn();

jest.mock('../../src/lark-api/client.js', () => ({
  LarkClient: jest.fn().mockImplementation((config: unknown) => {
    mockLarkClientConstructor(config);
    return { authenticate: mockAuthenticate };
  }),
}));

const mockLoadTokens = jest.fn();
const mockIsTokenExpired = jest.fn();
const mockClearTokens = jest.fn();

jest.mock('../../src/lark-api/auth.js', () => ({
  loadTokens: (...args: unknown[]) => mockLoadTokens(...args),
  isTokenExpired: (...args: unknown[]) => mockIsTokenExpired(...args),
  clearTokens: (...args: unknown[]) => mockClearTokens(...args),
}));

// ---------------------------------------------------------------------------
// Now import the module under test (side effects register listeners)
// ---------------------------------------------------------------------------

import '../../src/extension/background.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate sending a runtime message and receiving the async response.
 */
function sendMessage(
  message: { type: string; [key: string]: unknown },
): Promise<unknown> {
  return new Promise((resolve) => {
    let handled = false;
    for (const listener of messageListeners) {
      const keepOpen = listener(message, {}, (response: unknown) => {
        resolve(response);
      });
      if (keepOpen === true) {
        handled = true;
        break;
      }
    }
    if (!handled) {
      resolve(undefined);
    }
  });
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  syncStorage = {};
  mockAuthenticate.mockReset();
  mockLarkClientConstructor.mockReset();
  mockLoadTokens.mockReset();
  mockIsTokenExpired.mockReset();
  mockClearTokens.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('background service worker - Lark OAuth', () => {
  it('should have registered a message listener', () => {
    expect(messageListeners.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // lark-auth-start
  // -----------------------------------------------------------------------

  describe('lark-auth-start', () => {
    it('should return error when larkAppId is not configured', async () => {
      // syncStorage has no larkAppId, so the default empty string is used.
      const result = await sendMessage({ type: 'lark-auth-start' });
      expect(result).toEqual({
        success: false,
        error: 'Lark App ID not configured. Go to Settings.',
      });
    });

    it('should create LarkClient with correct config and authenticate', async () => {
      syncStorage = { larkAppId: 'cli_test_app', larkRegion: 'feishu' };
      mockAuthenticate.mockResolvedValueOnce(undefined);

      const result = await sendMessage({ type: 'lark-auth-start' });

      expect(result).toEqual({ success: true });
      expect(mockLarkClientConstructor).toHaveBeenCalledWith({
        region: 'feishu',
        appId: 'cli_test_app',
        redirectUri: 'https://test-extension-id.chromiumapp.org/',
      });
      expect(mockAuthenticate).toHaveBeenCalled();
    });

    it('should use larksuite as default region', async () => {
      syncStorage = { larkAppId: 'cli_test_app' };
      mockAuthenticate.mockResolvedValueOnce(undefined);

      await sendMessage({ type: 'lark-auth-start' });

      expect(mockLarkClientConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'larksuite' }),
      );
    });

    it('should return error when authenticate throws an Error', async () => {
      syncStorage = { larkAppId: 'cli_test_app' };
      mockAuthenticate.mockRejectedValueOnce(new Error('User cancelled'));

      const result = await sendMessage({ type: 'lark-auth-start' });

      expect(result).toEqual({
        success: false,
        error: 'User cancelled',
      });
    });

    it('should return generic message when authenticate throws non-Error', async () => {
      syncStorage = { larkAppId: 'cli_test_app' };
      mockAuthenticate.mockRejectedValueOnce('some string error');

      const result = await sendMessage({ type: 'lark-auth-start' });

      expect(result).toEqual({
        success: false,
        error: 'Authentication failed',
      });
    });
  });

  // -----------------------------------------------------------------------
  // lark-auth-logout
  // -----------------------------------------------------------------------

  describe('lark-auth-logout', () => {
    it('should call clearTokens and return success', async () => {
      mockClearTokens.mockResolvedValueOnce(undefined);

      const result = await sendMessage({ type: 'lark-auth-logout' });

      expect(result).toEqual({ success: true });
      expect(mockClearTokens).toHaveBeenCalled();
    });

    it('should return success: false when clearTokens throws', async () => {
      mockClearTokens.mockRejectedValueOnce(new Error('storage error'));

      const result = await sendMessage({ type: 'lark-auth-logout' });

      expect(result).toEqual({ success: false });
    });
  });

  // -----------------------------------------------------------------------
  // lark-auth-check
  // -----------------------------------------------------------------------

  describe('lark-auth-check', () => {
    it('should return authenticated: true when tokens are valid', async () => {
      const tokens = { accessToken: 'test', expiresAt: Date.now() + 3600000 };
      mockLoadTokens.mockResolvedValueOnce(tokens);
      mockIsTokenExpired.mockReturnValueOnce(false);

      const result = await sendMessage({ type: 'lark-auth-check' });

      expect(result).toEqual({ authenticated: true });
      expect(mockLoadTokens).toHaveBeenCalled();
      expect(mockIsTokenExpired).toHaveBeenCalledWith(tokens);
    });

    it('should return authenticated: false when no tokens stored', async () => {
      mockLoadTokens.mockResolvedValueOnce(null);

      const result = await sendMessage({ type: 'lark-auth-check' });

      expect(result).toEqual({ authenticated: false });
    });

    it('should return authenticated: false when tokens are expired', async () => {
      const tokens = { accessToken: 'test', expiresAt: Date.now() - 1000 };
      mockLoadTokens.mockResolvedValueOnce(tokens);
      mockIsTokenExpired.mockReturnValueOnce(true);

      const result = await sendMessage({ type: 'lark-auth-check' });

      expect(result).toEqual({ authenticated: false });
    });

    it('should return authenticated: false when loadTokens throws', async () => {
      mockLoadTokens.mockRejectedValueOnce(new Error('storage error'));

      const result = await sendMessage({ type: 'lark-auth-check' });

      expect(result).toEqual({ authenticated: false });
    });
  });

  // -----------------------------------------------------------------------
  // Unknown message types
  // -----------------------------------------------------------------------

  describe('unknown message types', () => {
    it('should return undefined for unrecognized message types', async () => {
      const result = await sendMessage({ type: 'unknown-type' });
      expect(result).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Listener registration
  // -----------------------------------------------------------------------

  describe('listener registration', () => {
    it('should register a commands.onCommand listener', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chrome = (globalThis as any).chrome;
      expect(chrome.commands.onCommand.addListener).toHaveBeenCalled();
    });

    it('should register a runtime.onMessage listener', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chrome = (globalThis as any).chrome;
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });
  });
});
