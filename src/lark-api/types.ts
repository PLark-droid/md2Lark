/**
 * Lark Open Platform API Type Definitions
 *
 * Provides type-safe interfaces for Lark/Feishu DocX blocks,
 * OAuth authentication, API responses, and error handling.
 */

// --- Region / Endpoint Configuration ---

/** Supported Lark deployment regions. */
export type LarkRegion = 'feishu' | 'larksuite';

/** Base URLs for a given Lark region. */
export interface LarkEndpoints {
  auth: string;
  token: string;
  api: string;
}

/** Region-specific endpoint mapping. */
export const ENDPOINTS: Record<LarkRegion, LarkEndpoints> = {
  feishu: {
    auth: 'https://open.feishu.cn/open-apis/authen/v1/authorize',
    token: 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
    api: 'https://open.feishu.cn/open-apis',
  },
  larksuite: {
    auth: 'https://open.larksuite.com/open-apis/authen/v1/authorize',
    token: 'https://open.larksuite.com/open-apis/authen/v1/oidc/access_token',
    api: 'https://open.larksuite.com/open-apis',
  },
};

// --- OAuth / Auth ---

/** Configuration required to initiate a Lark OAuth flow. */
export interface LarkAuthConfig {
  appId: string;
  redirectUri: string;
  region: LarkRegion;
}

/** Raw token response from the Lark OIDC token endpoint. */
export interface LarkTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
}

/** Locally persisted token information with pre-computed expiry timestamps. */
export interface LarkTokenStore {
  accessToken: string;
  refreshToken: string;
  /** Absolute timestamp (ms) when access token expires: Date.now() + expires_in * 1000 */
  expiresAt: number;
  /** Absolute timestamp (ms) when refresh token expires. */
  refreshExpiresAt: number;
}

// --- Lark DocX Block Types ---

/**
 * Numeric identifiers for Lark DocX block types.
 * @see https://open.larksuite.com/document/server-docs/docs/docs-overview
 */
export type LarkBlockType =
  | 1  // page
  | 2  // text
  | 3  // heading1
  | 4  // heading2
  | 5  // heading3
  | 6  // heading4
  | 7  // heading5
  | 8  // heading6
  | 9  // heading7
  | 12 // bullet
  | 13 // ordered
  | 14 // quote
  | 15 // code
  | 22 // divider
  | 27 // image
  | 31 // table
  | 32; // table_cell

/** Inline text styling options. */
export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code_inline?: boolean;
  link?: { url: string };
}

/** A single text element inside a block. */
export interface TextElement {
  text_run?: {
    content: string;
    text_element_style?: TextStyle;
  };
}

/** A Lark DocX block structure. */
export interface LarkBlock {
  block_type: LarkBlockType;
  text?: {
    elements: TextElement[];
    style?: Record<string, unknown>;
  };
  heading1?: { elements: TextElement[] };
  heading2?: { elements: TextElement[] };
  heading3?: { elements: TextElement[] };
  heading4?: { elements: TextElement[] };
  heading5?: { elements: TextElement[] };
  heading6?: { elements: TextElement[] };
  bullet?: { elements: TextElement[] };
  ordered?: { elements: TextElement[] };
  quote?: { elements: TextElement[] };
  code?: {
    elements: TextElement[];
    language?: number;
  };
  table?: {
    column_size: number;
    row_size: number;
    column_width?: number[];
    merge_info?: Array<{ row_span: number; col_span: number }>;
  };
  divider?: Record<string, never>;
  image?: {
    file_token: string;
    width?: number;
    height?: number;
  };
}

// --- API Response Types ---

/** Standard Lark API response envelope. */
export interface LarkApiResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
}

/** Response payload for document creation. */
export interface CreateDocumentResponse {
  document: {
    document_id: string;
    title: string;
    revision_id: number;
  };
}

/** Response payload for block creation. */
export interface CreateBlockResponse {
  children: Array<{
    block_id: string;
    block_type: LarkBlockType;
    children?: string[];
  }>;
}

/** Response payload for block retrieval. */
export interface GetBlockResponse {
  block: {
    block_id: string;
    block_type: LarkBlockType;
    children?: string[];
  };
}

// --- Error Types ---

/** Base error class for Lark API errors. */
export class LarkApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly larkCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'LarkApiError';
  }
}

/** Error thrown when authentication / authorization fails. */
export class LarkAuthError extends LarkApiError {
  constructor(httpStatus: number, larkCode: number, message: string) {
    super(httpStatus, larkCode, message);
    this.name = 'LarkAuthError';
  }
}

/** Error thrown when the API rate limit is exceeded. */
export class LarkRateLimitError extends LarkApiError {
  public readonly retryAfterMs: number;

  constructor(
    httpStatus: number,
    larkCode: number,
    message: string,
    retryAfterMs: number,
  ) {
    super(httpStatus, larkCode, message);
    this.name = 'LarkRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}
