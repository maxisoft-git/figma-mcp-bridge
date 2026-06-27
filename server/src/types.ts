export interface BridgeRequest {
  type: string;
  requestId: string;
  nodeIds?: string[];
  params?: Record<string, unknown>;
}

export interface BridgeError {
  code:
    | "PARSE_ERROR"
    | "NO_PLUGIN"
    | "TIMEOUT"
    | "NOT_FOUND"
    | "LOCKED"
    | "VALIDATION_ERROR"
    | "OPERATION_FAILED"
    | "UNSUPPORTED_OPERATION"
    | "NODE_NOT_FOUND"
    | string;
  message: string;
}

export interface BridgeResponse {
  type: string;
  requestId: string;
  data?: unknown;
  /** Plain string for backward compat with older plugins. */
  error?: string;
  /** Structured error (preferred). When set, `error` is redundant. */
  errorDetails?: BridgeError;
}

export interface RPCRequest {
  tool: string;
  nodeIds?: string[];
  params?: Record<string, unknown>;
  fileKey?: string;
}

export interface RPCResponse {
  data?: unknown;
  /** Plain string error message (set by server/forwarder). */
  error?: string;
  /** Structured error mirror (for tool handlers that already have it). */
  errorDetails?: BridgeError;
}

export interface ConnectedFile {
  fileKey: string;
  fileName: string;
}

export enum Role {
  Unknown = 0,
  Leader = 1,
  Follower = 2,
}
