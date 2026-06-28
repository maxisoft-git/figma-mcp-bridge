import { useState, useEffect, useRef, useCallback } from "react";
import type {
  DevModeExportRequest,
  DevModeExportResult,
  DevModeTab,
} from "../types/dev-mode-protocol";
import { DEV_MODE_TABS, DEV_MODE_TAB_LABELS } from "../types/dev-mode-protocol";
import { CodeViewer } from "./CodeViewer";
import { SvgViewer } from "./SvgViewer";
import { ImageViewer } from "./ImageViewer";

/**
 * DevModePanel — visual Dev Mode Mirror UI.
 *
 * 5 tabs (CSS / SVG / HTML / JSON / IMG) on top, content viewer below.
 * Direct UI ↔ plugin messaging via parent.postMessage — no server
 * roundtrip, instant feedback on selection change.
 */
export function DevModePanel() {
  const [activeTab, setActiveTab] = useState<DevModeTab>("css");
  const [result, setResult] = useState<DevModeExportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const requestExport = useCallback(
    (tab: DevModeTab) => {
      const seq = ++requestSeqRef.current;
      const request: DevModeExportRequest = {
        type: "dev_mode_export",
        requestId: `dev-${tab}-${seq}`,
        tab,
      };
      setActiveTab(tab);
      setLoading(true);
      setError(null);
      parent.postMessage({ pluginMessage: request }, "*");
    },
    [],
  );

  // Keep a ref to the latest activeTab so the message handler (registered
  // once) always reads the current tab without re-binding the listener.
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    let lastSelectionCount = -1;
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      // 1. Response to our export request
      if (msg.type === "dev_mode_result") {
        const r = msg as DevModeExportResult;
        const currentSeq = requestSeqRef.current;
        const resultSeq = Number(r.requestId.split("-").pop());
        if (Number.isFinite(resultSeq) && resultSeq < currentSeq) return;

        setLoading(false);
        if (r.ok) {
          setResult(r);
          setError(null);
        } else {
          setResult(null);
          setError(r.reason ?? "Unknown error");
        }
        return;
      }

      // 2. Selection changed in Figma → main thread sends updated
      //    plugin-status. Re-export the active tab ONLY when the
      //    selection count actually changed — otherwise every ui-ready
      //    reply (mount + 1s backup + 2s main-thread backup) would
      //    trigger a fresh node.exportAsync.
      if (msg.type === "plugin-status") {
        const sc = (msg.payload as { selectionCount?: number })?.selectionCount;
        if (typeof sc === "number" && sc !== lastSelectionCount) {
          lastSelectionCount = sc;
          requestExport(activeTabRef.current);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [requestExport]);

  // Initial load
  useEffect(() => {
    requestExport("css");
  }, [requestExport]);

  return (
    <div className="dev-mode-panel">
      <nav className="dev-mode-tabs" role="tablist">
        {DEV_MODE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`dev-mode-panel-${tab}`}
            className={`dev-mode-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => requestExport(tab)}
          >
            {DEV_MODE_TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      <div className="dev-mode-content" id={`dev-mode-panel-${activeTab}`}>
        {error && (
          <div className="dev-mode-error" role="alert">
            <span className="dev-mode-error__icon" aria-hidden>⚠</span>
            <span className="dev-mode-error__text">{error}</span>
          </div>
        )}

        {result && !error && (
          <>
            {result.nodeName && (
              <div className="dev-mode-meta">
                <span className="dev-mode-meta__name" title={result.nodeId}>
                  {result.nodeName}
                </span>
                <span className="dev-mode-meta__type">{result.nodeType}</span>
                {typeof result.bytes === "number" && (
                  <span className="dev-mode-meta__size">
                    {(result.bytes / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>
            )}

            {result.tab === "css" && result.css !== undefined && (
              <CodeViewer
                code={result.css}
                language="css"
                loading={loading}
              />
            )}

            {result.tab === "html" && result.html !== undefined && (
              <>
                {result.truncated && (
                  <div className="dev-mode-warning">
                    Tree truncated: visited {result.visited} nodes
                  </div>
                )}
                <CodeViewer
                  code={result.html}
                  language="html"
                  loading={loading}
                />
              </>
            )}

            {result.tab === "json" && result.json !== undefined && (
              <CodeViewer
                code={result.json}
                language="json"
                loading={loading}
              />
            )}

            {result.tab === "svg" && result.svg !== undefined && (
              <SvgViewer svg={result.svg} loading={loading} />
            )}

            {result.tab === "img" && result.base64 && result.mime && (
              <ImageViewer
                base64={result.base64}
                mime={result.mime}
                source={result.source}
                scaleMode={result.scaleMode}
                fileName={result.nodeName}
                loading={loading}
              />
            )}
          </>
        )}

        {loading && !result && (
          <div className="dev-mode-loading">
            <div className="dev-mode-loading__spinner" aria-hidden />
            <span>Loading…</span>
          </div>
        )}
      </div>
    </div>
  );
}
