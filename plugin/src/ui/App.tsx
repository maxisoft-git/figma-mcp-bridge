import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";

type RequestType =
  | "get_document"
  | "get_selection"
  | "get_node"
  | "get_styles"
  | "get_metadata"
  | "get_design_context"
  | "get_variable_defs"
  | "get_screenshot";

type ServerRequest = {
  type: RequestType;
  requestId: string;
  nodeIds?: string[];
  params?: {
    format?: "PNG" | "SVG" | "JPG" | "PDF";
    scale?: number;
    depth?: number;
  };
};

type PluginResponse = {
  type: RequestType;
  requestId: string;
  data?: unknown;
  error?: string;
};

type PluginStatus = {
  fileName: string;
  fileKey: string;
  selectionCount: number;
};

const WS_BASE_URL = "ws://localhost:1994/ws";

export default function App() {
  const [connected, setConnected] = useState(false);
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

  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(() => {
    if (status.selectionCount === 0 || exporting) return;
    setExporting(true);
    parent.postMessage({ pluginMessage: { type: "export-selection" } }, "*");
  }, [status.selectionCount, exporting]);

  // Handle export result from plugin code
  useEffect(() => {
    const handleExportResult = async (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg || msg.type !== "export-result") return;

      if (msg.error) {
        console.error("Export failed:", msg.error);
        setExporting(false);
        return;
      }

      try {
        const zip = new JSZip();
        const seen = new Map<string, number>();

        for (const item of msg.data) {
          // Deduplicate names
          let safeName = item.name.replace(/[\/\\:*?"<>|]/g, "_");
          const count = seen.get(safeName) || 0;
          seen.set(safeName, count + 1);
          if (count > 0) safeName = `${safeName}_${count}`;

          zip.file(`${safeName}.json`, JSON.stringify(item.json, null, 2));

          // Decode base64 PNG
          const raw = atob(item.pngBase64);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          zip.file(`${safeName}.png`, bytes);
        }

        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `figma-export-${msg.data.length}-nodes.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("ZIP creation failed:", err);
      }

      setExporting(false);
    };

    window.addEventListener("message", handleExportResult);
    return () => window.removeEventListener("message", handleExportResult);
  }, []);

  // Connect/reconnect WebSocket when fileKey changes
  useEffect(() => {
    if (!status.fileKey) return;

    const connect = () => {
      if (socketRef.current) {
        socketRef.current.close();
      }

      const wsUrl = `${WS_BASE_URL}?fileKey=${encodeURIComponent(status.fileKey)}&fileName=${encodeURIComponent(status.fileName)}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        parent.postMessage({ pluginMessage: { type: "ui-ready" } }, "*");
      };

      ws.onclose = () => {
        setConnected(false);
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
        const payload = JSON.parse(event.data) as ServerRequest;
        parent.postMessage({ pluginMessage: { type: "server-request", payload } }, "*");
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
  }, [status.fileKey, status.fileName]);



  return (
    <div className="container">
      <div className="info-section">
        <div className="info-row">
          <span className="info-label">File:</span>
          <span className="info-value">{status.fileName}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Selection:</span>
          <span className="info-value">{status.selectionCount} node(s)</span>
        </div>
      </div>

      <button
        className="export-btn"
        onClick={handleExport}
        disabled={status.selectionCount === 0 || exporting}
      >
        {exporting ? "Exporting…" : `Export Selection to JSON`}
      </button>

      <div className="footer">
        <div className={`badge ${connected ? "connected" : "disconnected"}`}>
          <span className="dot" />
          <span className="badge-text">{statusLabel}</span>
        </div>
      </div>
    </div>
  );
}
