import { useState, useEffect, useRef, useCallback } from "react";
import {
  type FileKey,
  type FileName,
  type ConnectionState,
  type LogEntry,
  type LogStatus,
  type FileStatus,
  type ServerMessage,
  type PluginMessage,
  type PluginError,
  asFileKey,
  asFileName,
  isFileStatus,
  isServerMessage,
  isPluginMessage,
} from "../types/messages";
import { PLUGIN_VERSION } from "../ui/version";

const WS_BASE_URL = "ws://localhost:1994/ws";
const MAX_LOG = 20;
const RECONNECT_DELAY = 1500;
const SECRET = "figma-mcp-bridge-v1";

export interface UseWebSocketReturn {
  connected: ConnectionState;
  openFiles: number;
  serverVersion: string | null;
  locked: boolean;
  status: FileStatus;
  log: LogEntry[];
  error: PluginError | null;
  send: (message: ServerMessage) => void;
  toggleLock: () => void;
  clearLog: () => void;
  reconnect: () => void;
  disconnect: () => void;
  addLog: (type: string, options?: {
    requestId?: string;
    status?: LogStatus;
    duration?: number;
    payload?: string;
  }) => LogEntry;
}

const formatTime = (date: Date): string => {
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const parseError = (raw: string): PluginError => ({
  kind: "parse",
  raw,
  message: "Failed to parse incoming message",
});

const isPluginMessagePayload = (data: unknown): data is PluginMessage => {
  if (typeof data !== "object" || data === null) return false;
  const d = data as { type?: unknown; pluginMessage?: unknown };
  if (d.type === "pluginMessage" && isPluginMessage(d.pluginMessage)) {
    return true;
  }
  return false;
};

export function useWebSocket(): UseWebSocketReturn {
  const [status, setStatus] = useState<FileStatus>({
    fileName: asFileName("Unknown file"),
    fileKey: asFileKey(""),
    selectionCount: 0,
  });
  const [connected, setConnected] = useState<ConnectionState>("disconnected");
  const [openFiles, setOpenFiles] = useState(0);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<PluginError | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const requestStartRef = useRef<Map<string, number>>(new Map());

  const addLog = useCallback(
    (
      type: string,
      options: {
        requestId?: string;
        status?: LogStatus;
        duration?: number;
        payload?: string;
      } = {}
    ): LogEntry => {
      const now = new Date();
      const entry: LogEntry = {
        type,
        time: formatTime(now),
        timestamp: now.getTime(),
        status: options.status ?? "ok",
      };
      if (options.requestId !== undefined) {
        entry.requestId = options.requestId as LogEntry["requestId"];
      }
      if (options.duration !== undefined) entry.duration = options.duration;
      if (options.payload !== undefined) entry.payload = options.payload;
      setLog((prev) => [entry, ...prev].slice(0, MAX_LOG));
      return entry;
    },
    []
  );

  const updateLogByRequestId = useCallback(
    (
      requestId: string,
      updates: { status?: LogStatus; duration?: number; payload?: string }
    ) => {
      setLog((prev) =>
        prev.map((entry) =>
          entry.requestId === requestId
            ? {
                ...entry,
                ...(updates.status !== undefined && { status: updates.status }),
                ...(updates.duration !== undefined && { duration: updates.duration }),
                ...(updates.payload !== undefined && { payload: updates.payload }),
              }
            : entry
        )
      );
    },
    []
  );

  const clearLog = useCallback(() => {
    setLog([]);
    requestStartRef.current.clear();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const send = useCallback((message: ServerMessage) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, []);

  const toggleLock = useCallback(() => {
    setLocked((prev) => !prev);
  }, []);

  // Listen to plugin UI messages from Figma (responses from main thread)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const outer = event.data as { pluginMessage?: unknown } | undefined;
        if (!outer?.pluginMessage) return;

        if (!isPluginMessagePayload(outer)) return;
        const msg = (outer as { pluginMessage: PluginMessage }).pluginMessage;

        if (msg.type === "ui-ready") {
          return;
        }

        if (msg.type === "server-request") {
          const payload = msg.payload;
          const payloadObj = payload as Record<string, unknown> | null;
          const requestId =
            payloadObj && typeof payloadObj.requestId === "string"
              ? payloadObj.requestId
              : undefined;

          // Calculate duration from request to response
          let duration: number | undefined;
          if (requestId && requestStartRef.current.has(requestId)) {
            const startTime = requestStartRef.current.get(requestId)!;
            duration = Date.now() - startTime;
            requestStartRef.current.delete(requestId);
          }

          // Forward to server
          const ws = socketRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
          }

          // Update log with response
          if (requestId) {
            const errorField = payloadObj?.error;
            updateLogByRequestId(requestId, {
              status: errorField ? "error" : "ok",
              duration,
              payload: errorField ? String(errorField) : undefined,
            });
          }
        }
      } catch (err) {
        setError(parseError(String(err)));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [updateLogByRequestId]);

  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    setConnected("connecting");
    attemptRef.current += 1;
    clearError();

    const params = new URLSearchParams({
      fileKey: status.fileKey,
      fileName: status.fileName,
      pluginVersion: PLUGIN_VERSION,
      secret: SECRET,
    });
    const ws = new WebSocket(`${WS_BASE_URL}?${params.toString()}`);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected("connected");
      attemptRef.current = 0;
      parent.postMessage(
        { pluginMessage: { type: "ui-ready" } },
        "*"
      );
    };

    ws.onclose = () => {
      setConnected("disconnected");

      if (reconnectTimerRef.current === null && attemptRef.current < 5) {
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, RECONNECT_DELAY * Math.min(attemptRef.current, 4));
      }
    };

    ws.onerror = () => {
      setConnected("disconnected");
      setError({
        kind: "connection",
        cause: "unknown",
        message: "WebSocket connection error",
      });
    };

    ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch (err) {
        setError(parseError(event.data));
        return;
      }

      if (!isServerMessage(parsed)) return;

      if (parsed.type === "__bridge_event") {
        if (parsed.event === "files" && Array.isArray(parsed.files)) {
          setOpenFiles(parsed.files.length);
        }
        if (parsed.event === "server_version" && typeof parsed.serverVersion === "string") {
          setServerVersion(parsed.serverVersion);
        }
        return;
      }

      const parsedObj = parsed as Record<string, unknown>;
      const requestId =
        typeof parsedObj.requestId === "string" ? parsedObj.requestId : undefined;

      if (locked) {
        const errorResp = {
          type: parsed.type,
          requestId,
          error: "Plugin locked by user" as const,
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(errorResp));
        }
        addLog(parsed.type, {
          requestId,
          status: "error",
          payload: "Plugin locked by user",
        });
        return;
      }

      if (requestId) {
        requestStartRef.current.set(requestId, Date.now());
      }

      addLog(parsed.type, {
        requestId,
        status: "pending",
      });

      if (typeof parsedObj.id === "string") {
        parent.postMessage(
          { pluginMessage: { type: "server-request", payload: parsed } },
          "*"
        );
      }
    };
  }, [status.fileKey, status.fileName, locked, clearError, addLog]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnected("disconnected");
  }, []);

  const reconnect = useCallback(() => {
    attemptRef.current = 0;
    clearError();
    if (status.fileKey) {
      connect();
    }
  }, [status.fileKey, connect, clearError]);

  useEffect(() => {
    if (status.fileKey) {
      connect();
    }
    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect, status.fileKey]);

  return {
    connected,
    openFiles,
    serverVersion,
    locked,
    status,
    log,
    error,
    send,
    toggleLock,
    clearLog,
    reconnect,
    disconnect,
    addLog,
  };
}
