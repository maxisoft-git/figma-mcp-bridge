import type { ConnectionState } from "../types/messages";
import { Icon } from "./Icon";

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connected: "Connected",
  connecting: "Connecting",
  disconnected: "Disconnected",
};

interface ConnectionStatusProps {
  state: ConnectionState;
  onReconnect?: () => void;
}

export function ConnectionStatus({ state, onReconnect }: ConnectionStatusProps) {
  const label = CONNECTION_LABELS[state];
  const isError = state === "disconnected";
  const iconName = state === "connected" ? "wifi" : state === "connecting" ? "loader" : "wifi-off";

  return (
    <div className={`badge ${state}`}>
      <Icon
        name={iconName}
        size={12}
        className={`badge__icon badge__icon--${state}`}
        aria-hidden
      />
      <span className="badge-text">{label}</span>
      {isError && onReconnect && (
        <button
          type="button"
          className="badge-reconnect"
          onClick={onReconnect}
          aria-label="Reconnect"
          title="Reconnect (R)"
        >
          <Icon name="plug-zap" size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}
