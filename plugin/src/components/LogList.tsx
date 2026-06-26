import { useState } from "react";
import type { LogEntry, LogStatus } from "../types/messages";
import { formatDuration } from "../hooks/useWebSocket";

interface LogListProps {
  entries: readonly LogEntry[];
  onClear?: () => void;
}

const STATUS_ICONS: Record<LogStatus, string> = {
  ok: "✓",
  error: "✗",
  pending: "⋯",
};

const STATUS_LABELS: Record<LogStatus, string> = {
  ok: "OK",
  error: "Error",
  pending: "Pending",
};

const relativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  if (diff < 1000) return "now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
};

export function LogList({ entries, onClear }: LogListProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (timestamp: number): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(timestamp)) {
        next.delete(timestamp);
      } else {
        next.add(timestamp);
      }
      return next;
    });
  };

  if (entries.length === 0) {
    return (
      <div className="log-section log-section--empty">
        <div className="log-header">
          <h3 className="log-title">Log</h3>
        </div>
        <div className="log-empty">
          <span className="log-empty__icon" aria-hidden="true">📋</span>
          <p className="log-empty__text">No operations yet</p>
          <p className="log-empty__hint">AI agent operations will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="log-section">
      <div className="log-header">
        <h3 className="log-title">Log ({entries.length})</h3>
        {onClear && (
          <button
            type="button"
            className="log-clear"
            onClick={onClear}
            aria-label="Clear log"
          >
            Clear
          </button>
        )}
      </div>
      <ul className="log-list">
        {entries.map((entry) => {
          const isExpanded = expanded.has(entry.timestamp);
          const status = entry.status ?? "ok";
          const hasDetails = entry.duration !== undefined || entry.payload !== undefined;
          return (
            <li
              key={entry.timestamp}
              className={`log-entry log-entry--${status}`}
            >
              <button
                type="button"
                className="log-entry__row"
                onClick={hasDetails ? () => toggle(entry.timestamp) : undefined}
                disabled={!hasDetails}
                aria-expanded={hasDetails ? isExpanded : undefined}
                title={hasDetails ? "Click to expand" : undefined}
              >
                <span
                  className={`log-entry__status log-entry__status--${status}`}
                  aria-label={STATUS_LABELS[status]}
                  title={STATUS_LABELS[status]}
                >
                  {STATUS_ICONS[status]}
                </span>
                <span className="log-entry__time">{entry.time}</span>
                <span className="log-entry__relative">
                  {relativeTime(entry.timestamp)}
                </span>
                <span className="log-entry__type">{entry.type}</span>
                {entry.duration !== undefined && (
                  <span
                    className="log-entry__duration"
                    title="Duration"
                  >
                    {formatDuration(entry.duration)}
                  </span>
                )}
              </button>
              {isExpanded && hasDetails && (
                <div className="log-entry__details">
                  {entry.requestId && (
                    <div className="log-entry__detail">
                      <span className="log-entry__detail-label">requestId:</span>
                      <code className="log-entry__detail-value">
                        {entry.requestId}
                      </code>
                    </div>
                  )}
                  {entry.duration !== undefined && (
                    <div className="log-entry__detail">
                      <span className="log-entry__detail-label">duration:</span>
                      <code className="log-entry__detail-value">
                        {formatDuration(entry.duration)}
                      </code>
                    </div>
                  )}
                  {entry.payload && (
                    <div className="log-entry__detail">
                      <span className="log-entry__detail-label">payload:</span>
                      <code className="log-entry__detail-value log-entry__detail-value--error">
                        {entry.payload}
                      </code>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
