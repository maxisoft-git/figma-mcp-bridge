import { useCallback, useMemo } from "react";
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

  const handleRetry = useCallback(() => {
    reconnect();
  }, [reconnect]);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const handleClearLog = useCallback(() => {
    clearLog();
  }, [clearLog]);

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
        "?": () =>
          console.log(
            "Hotkeys: L=lock, R=reconnect, D=disconnect, C=clear, Cmd/Ctrl+1=DevMode, Cmd/Ctrl+2=MCP",
          ),
      }),
      [toggleLock, reconnect, clearLog, disconnect, connected]
    )
  );

  const isConnected = connected === "connected";
  const isDisconnected = connected === "disconnected";

  const errorCount = useMemo(
    () => log.filter((e) => e.status === "error").length,
    [log],
  );

  return (
    <div className="container">
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

      <div className="footer">
        <div className="footer__group">
          <ConnectionStatus state={connected} />
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
    </div>
  );
}
