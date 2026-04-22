import React, { useEffect, useMemo, useRef, useState } from "react";

const PLUGIN_VERSION = "0.5.0";

type PluginStatus = {
  fileName: string;
  fileKey: string;
  selectionCount: number;
  pluginVersion?: string;
};

const WS_BASE_URL = "ws://localhost:1994/ws";

type ServerRequest = {
  type: string;
  requestId: string;
  nodeIds?: string[];
  params?: Record<string, unknown>;
};

type LogEntry = {
  type: string;
  time: string;
};

const MAX_LOG = 5;

export default function App() {
  const [connected, setConnected] = useState(false);
  const [openFiles, setOpenFiles] = useState(0);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<PluginStatus>({
    fileName: "Unknown file",
    fileKey: "",
    selectionCount: 0
  });
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  const statusLabel = useMemo(
    () => (connected ? "WebSocket Connected" : "Disconnected"),
    [connected]
  );

  const addLog = (type: string) => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setLog((prev) => [{ type, time }, ...prev].slice(0, MAX_LOG));
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === "plugin-status") {
        setStatus(msg.payload);
        return;
      }

      if (!("requestId" in msg)) {
        return;
      }

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      socketRef.current.send(JSON.stringify(msg));
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    if (!status.fileKey) return;

    const connect = () => {
      if (socketRef.current) {
        socketRef.current.close();
      }

      const wsUrl = `${WS_BASE_URL}?fileKey=${encodeURIComponent(status.fileKey)}&fileName=${encodeURIComponent(status.fileName)}&pluginVersion=${encodeURIComponent(PLUGIN_VERSION)}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        parent.postMessage({ pluginMessage: { type: "ui-ready" } }, "*");
      };

      ws.onclose = () => {
        setConnected(false);
        setOpenFiles(0);
        if (reconnectTimer.current === null) {
          reconnectTimer.current = window.setTimeout(() => {
            reconnectTimer.current = null;
            connect();
          }, 1500);
        }
      };

      ws.onerror = () => {
        setConnected(false);
      };

      ws.onmessage = (event) => {
        const parsed = JSON.parse(event.data);
        if (parsed?.type === "__bridge_event") {
          if (parsed.event === "files" && Array.isArray(parsed.files)) {
            setOpenFiles(parsed.files.length);
          }
          if (parsed.event === "server_version" && typeof parsed.serverVersion === "string") {
            setServerVersion(parsed.serverVersion);
          }
          return;
        }
        if (locked) {
          const errorResp = {
            type: parsed.type,
            requestId: parsed.requestId,
            error: "Plugin locked by user",
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(errorResp));
          }
          return;
        }
        addLog(parsed.type ?? "unknown");
        parent.postMessage(
          { pluginMessage: { type: "server-request", payload: parsed as ServerRequest } },
          "*"
        );
      };
    };

    connect();

    return () => {
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [status.fileKey, status.fileName, locked]);

  const versionMismatch = serverVersion && serverVersion !== PLUGIN_VERSION;

  return (
    <div className="container">
      <div className="info-section">
        <div className="info-row">
          <span className="info-label">File:</span>
          <span className="info-value">
            {status.fileName}
            {openFiles > 1 && <span className="info-muted"> · {openFiles} open</span>}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">Selection:</span>
          <span className="info-value">{status.selectionCount} node(s)</span>
        </div>
      </div>

      {versionMismatch && (
        <div className="version-warning">
          Plugin v{PLUGIN_VERSION} ← Server v{serverVersion}
          <br />
          <span className="version-hint">Re-import plugin to update</span>
        </div>
      )}

      {log.length > 0 && (
        <div className="log-section">
          {log.map((entry, i) => (
            <div key={i} className="log-entry">
              <span className="log-time">{entry.time}</span>
              <span className="log-type">{entry.type}</span>
            </div>
          ))}
        </div>
      )}

      <div className="footer">
        <span className="version-label">v{PLUGIN_VERSION}</span>
        <button
          className={`lock-btn ${locked ? "locked" : ""}`}
          onClick={() => setLocked((l) => !l)}
          title={locked ? "Unlock plugin" : "Lock plugin"}
        >
          {locked ? "Locked" : "Lock"}
        </button>
        <div className={`badge ${connected ? "connected" : "disconnected"}`}>
          <span className="dot" />
          <span className="badge-text">{statusLabel}</span>
        </div>
      </div>
    </div>
  );
}
