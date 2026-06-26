/**
 * Domain types for the Figma MCP Bridge plugin UI.
 *
 * All message types use discriminated unions on `type` field for type-safe
 * pattern matching. All ID-like strings use branded types to prevent
 * accidental mixing of e.g. fileKey and requestId.
 */

// =============================================================================
// Branded types
// =============================================================================

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type RequestId = Brand<string, "RequestId">;
export type FileKey = Brand<string, "FileKey">;
export type FileName = Brand<string, "FileName">;

export const asRequestId = (s: string): RequestId => s as RequestId;
export const asFileKey = (s: string): FileKey => s as FileKey;
export const asFileName = (s: string): FileName => s as FileName;

// =============================================================================
// Plugin state
// =============================================================================

export type ConnectionState = "connected" | "disconnected" | "connecting";

export type FileStatus = {
  fileName: FileName;
  fileKey: FileKey;
  selectionCount: number;
};

export type LogStatus = "ok" | "error" | "pending";

export type LogEntry = {
  type: string;
  requestId?: RequestId;
  time: string;
  timestamp: number;
  duration?: number;
  status?: LogStatus;
  payload?: string;
};

// =============================================================================
// Message protocol
// =============================================================================

export type BridgeEvent =
  | { type: "__bridge_event"; event: "files"; files: readonly unknown[] }
  | { type: "__bridge_event"; event: "server_version"; serverVersion: string };

export type ServerRequest = {
  type: string;
  requestId?: RequestId;
  id?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ServerMessage = BridgeEvent | ServerRequest;

export type LockedErrorResponse = {
  type: string;
  requestId: string;
  error: "Plugin locked by user";
};

export type PluginMessage =
  | { type: "ui-ready" }
  | { type: "server-request"; payload: ServerMessage }
  | { type: "plugin-locked"; requestId: RequestId };

// =============================================================================
// Type guards
// =============================================================================

export const isFileStatus = (data: unknown): data is FileStatus => {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.fileName === "string" &&
    typeof d.fileKey === "string" &&
    typeof d.selectionCount === "number"
  );
};

export const isBridgeEvent = (data: unknown): data is BridgeEvent => {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return d.type === "__bridge_event" && typeof d.event === "string";
};

export const isServerRequest = (data: unknown): data is ServerRequest => {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.type === "string" && d.type !== "__bridge_event";
};

export const isServerMessage = (data: unknown): data is ServerMessage => {
  return isBridgeEvent(data) || isServerRequest(data);
};

export const isPluginMessage = (data: unknown): data is PluginMessage => {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return d.type === "ui-ready" || d.type === "server-request" || d.type === "plugin-locked";
};

// =============================================================================
// Error types
// =============================================================================

export type ConnectionError = {
  kind: "connection";
  cause: "timeout" | "refused" | "closed" | "unknown";
  message: string;
};

export type MessageParseError = {
  kind: "parse";
  raw: string;
  message: string;
};

export type PluginError = ConnectionError | MessageParseError;
