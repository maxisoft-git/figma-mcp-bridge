export enum PluginErrorCode {
  NODE_NOT_FOUND = "NODE_NOT_FOUND",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  FONT_NOT_AVAILABLE = "FONT_NOT_AVAILABLE",
  UNSUPPORTED_OPERATION = "UNSUPPORTED_OPERATION",
  OPERATION_FAILED = "OPERATION_FAILED",
}

export type PluginError = {
  code: PluginErrorCode;
  message: string;
};

export const createError = (code: PluginErrorCode, message: string): PluginError => ({
  code,
  message,
});

export const nodeNotFound = (nodeId: string) =>
  createError(PluginErrorCode.NODE_NOT_FOUND, `Node not found: ${nodeId}`);

export const validationError = (message: string) =>
  createError(PluginErrorCode.VALIDATION_ERROR, message);

export const unsupportedOperation = (operation: string, nodeType: string) =>
  createError(PluginErrorCode.UNSUPPORTED_OPERATION, `${operation} is not supported for node type: ${nodeType}`);

export const operationFailed = (message: string) =>
  createError(PluginErrorCode.OPERATION_FAILED, message);