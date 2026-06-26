/**
 * TypeScript типы для plugin UI.
 *
 * Обеспечивает type safety для всех компонентов и хуков.
 */

/**
 * Статус подключения.
 */
export type ConnectionStatus = "connected" | "disconnected" | "connecting";

/**
 * Тип файла.
 */
export type FileType = "file" | "directory" | "image" | "unknown";

/**
 * Информация о файле.
 */
export interface FileInfo {
  name: string;
  key: string;
  type: FileType;
  size?: number;
  lastModified?: number;
}

/**
 * Информация о сервере.
 */
export interface ServerInfo {
  name: string;
  version: string;
  status: ConnectionStatus;
  lastSync?: number;
}

/**
 * Пропсы для ConnectionStatus компонента.
 */
export interface ConnectionStatusProps {
  status: ConnectionStatus;
  onReconnect?: () => void;
}

/**
 * Пропсы для FileInfo компонента.
 */
export interface FileInfoProps {
  file: FileInfo;
  showDetails?: boolean;
}

/**
 * Пропсы для ServerVersion компонента.
 */
export interface ServerVersionProps {
  server: ServerInfo;
  showMismatch?: boolean;
}

/**
 * Пропсы для ErrorBoundary.
 */
export interface ErrorBoundaryProps {
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  children: React.ReactNode;
}

/**
 * Состояние ErrorBoundary.
 */
export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Возврат useWebSocket хука.
 */
export interface UseWebSocketReturn {
  connected: boolean;
  serverVersion: string | null;
  fileName: string;
  fileKey: string;
  selectionCount: number;
  log: LogEntry[];
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: WebSocketMessage) => void;
}

/**
 * Запись в логе.
 */
export interface LogEntry {
  type: string;
  time: string;
  timestamp: number;
}

/**
 * WebSocket сообщение.
 */
export interface WebSocketMessage {
  type: string;
  payload?: unknown;
}

/**
 * Пропсы для LoadingSpinner.
 */
export interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  message?: string;
}
