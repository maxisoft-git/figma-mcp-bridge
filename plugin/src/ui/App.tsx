import { useCallback, useEffect, useMemo, useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { useHotkeys } from "../hooks/useHotkeys";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { FileInfo } from "../components/FileInfo";
import { ServerVersion } from "../components/ServerVersion";
import { LockButton } from "../components/LockButton";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { MainTabs } from "../components/MainTabs";
import { Icon } from "../components/Icon";
import { PLUGIN_VERSION } from "./version";

const COLLAPSED_STORAGE_KEY = "bridge-ui-collapsed";

export default function App() {
  const {
    connected,
    openFiles,
    serverVersion,
    locked,
    status,
    log,
    error,
    toggleLock,
    clearLog,
    reconnect,
    disconnect,
  } = useWebSocket();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Persist + notify main thread so the iframe resizes.
  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore quota / private-mode errors
    }
    parent.postMessage(
      { pluginMessage: { type: "ui-resize", collapsed } },
      "*"
    );
  }, [collapsed]);

  const handleRetry = useCallback(() => {
    reconnect();
  }, [reconnect]);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const handleClearLog = useCallback(() => {
    clearLog();
  }, [clearLog]);

  const handleToggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  useHotkeys(
    useMemo(
      () => ({
        l: () => toggleLock(),
        r: () => {
          if (connected === "disconnected") reconnect();
        },
        c: () => clearLog(),
        d: () => {
          if (connected === "connected") disconnect();
        },
        b: handleToggleCollapsed,
        "?": () =>
          console.log(
            "Hotkeys: L=lock, R=reconnect, D=disconnect, C=clear, B=toggle collapse, Cmd/Ctrl+1=DevMode, Cmd/Ctrl+2=MCP"
          ),
      }),
      [toggleLock, reconnect, disconnect, connected, clearLog, handleToggleCollapsed]
    )
  );

  const isConnected = connected === "connected";
  const isDisconnected = connected === "disconnected";

  const errorCount = useMemo(
    () => log.filter((e) => e.status === "error").length,
    [log.length]
  );

  return (
    <div className={`container${collapsed ? " container--collapsed" : ""}`}>
      <div className="header">
        <button
          type="button"
          className="header__collapse-btn"
          onClick={handleToggleCollapsed}
          title={collapsed ? "Expand (B)" : "Collapse (B)"}
          aria-label={collapsed ? "Expand plugin" : "Collapse plugin"}
          aria-expanded={!collapsed}
        >
          <Icon name={collapsed ? "chevron-down" : "chevron-up"} size={14} aria-hidden />
        </button>
        <div className="header__title">
          <span className="header__name">Figma MCP Bridge</span>
          {status.fileName && (
            <span className="header__file" title={status.fileName || ""}>
              {status.fileName}
            </span>
          )}
        </div>
        <div className="header__spacer" />
        <div className="header__status">
          <ConnectionStatus state={connected} />
        </div>
      </div>

      {!collapsed && (
        <div className="content">
          <ErrorBanner error={error} onDismiss={handleClearLog} onRetry={handleRetry} />

          <FileInfo status={status} openFiles={openFiles} />

          <ServerVersion pluginVersion={PLUGIN_VERSION} serverVersion={serverVersion} />

          {connected === "connecting" && (
            <LoadingSpinner size="small" message="Connecting..." />
          )}

          <MainTabs
            logCount={log.length}
            errorCount={errorCount}
            log={log}
            onClearLog={handleClearLog}
          />
        </div>
      )}

      {!collapsed && (
        <div className="footer">
          <div className="footer__group">
            {isConnected && (
              <button
                type="button"
                className="disconnect-btn"
                onClick={handleDisconnect}
                title="Disconnect (D)"
                aria-label="Disconnect"
              >
                <Icon name="plug" size={12} aria-hidden />
                <span className="disconnect-btn__label">Disconnect</span>
              </button>
            )}
            {isDisconnected && (
              <button
                type="button"
                className="reconnect-btn"
                onClick={handleRetry}
                title="Reconnect (R)"
                aria-label="Reconnect"
              >
                <Icon name="plug-zap" size={12} aria-hidden />
                <span className="reconnect-btn__label">Reconnect</span>
              </button>
            )}
          </div>
          <div className="footer__spacer" />
          <div className="footer__group">
            <LockButton locked={locked} onToggle={toggleLock} pluginVersion={PLUGIN_VERSION} />
          </div>
        </div>
      )}
    </div>
  );
}
