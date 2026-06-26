import { useState, useEffect } from "react";
import { LogList } from "./LogList";
import { DevModePanel } from "./DevModePanel";
import type { LogEntry } from "../types/messages";

export type MainTab = "dev" | "mcp";

interface MainTabsProps {
  /** Number of log entries (shown as badge on MCP tab). */
  logCount: number;
  /** Number of error log entries (shown as secondary badge). */
  errorCount: number;
  /** Log entries for the MCP tab. */
  log: readonly LogEntry[];
  /** Clear log handler (passed through to LogList). */
  onClearLog: () => void;
}

const TABS: Array<{ id: MainTab; label: string; key: string }> = [
  { id: "dev", label: "Dev Mode", key: "1" },
  { id: "mcp", label: "MCP", key: "2" },
];

/**
 * MainTabs — root content switcher.
 *
 * Splits the plugin body into two views:
 *  - "Dev Mode" (default): visual exports of the selected node
 *  - "MCP": WebSocket activity log + server/connection details
 *
 * The header (FileInfo, ServerVersion, ErrorBanner) stays always
 * visible above the tabs so the user always knows which file
 * they're working with.
 *
 * Hotkeys:
 *  - Cmd/Ctrl+1 → Dev Mode tab
 *  - Cmd/Ctrl+2 → MCP tab
 */
export function MainTabs({ logCount, errorCount, log, onClearLog }: MainTabsProps) {
  const [active, setActive] = useState<MainTab>("dev");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "1") {
        e.preventDefault();
        setActive("dev");
      } else if (e.key === "2") {
        e.preventDefault();
        setActive("mcp");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="main-tabs">
      <nav className="main-tabs__nav" role="tablist">
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          const badge =
            tab.id === "mcp" ? (
              <span
                className={`main-tabs__badge ${errorCount > 0 ? "main-tabs__badge--error" : ""}`}
                title={
                  errorCount > 0
                    ? `${logCount} entries, ${errorCount} errors`
                    : `${logCount} entries`
                }
              >
                {errorCount > 0 ? `${errorCount}!` : logCount}
              </span>
            ) : null;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`main-tab-panel-${tab.id}`}
              className={`main-tabs__btn ${isActive ? "active" : ""}`}
              onClick={() => setActive(tab.id)}
              title={`${tab.label} (Cmd/Ctrl+${tab.key})`}
            >
              <span className="main-tabs__btn-label">{tab.label}</span>
              {badge}
            </button>
          );
        })}
      </nav>

      <div className="main-tabs__content">
        {active === "dev" && (
          <div
            id="main-tab-panel-dev"
            role="tabpanel"
            className="main-tabs__panel"
          >
            <DevModePanel />
          </div>
        )}

        {active === "mcp" && (
          <div
            id="main-tab-panel-mcp"
            role="tabpanel"
            className="main-tabs__panel"
          >
            <LogList entries={log} onClear={onClearLog} />
          </div>
        )}
      </div>
    </div>
  );
}
