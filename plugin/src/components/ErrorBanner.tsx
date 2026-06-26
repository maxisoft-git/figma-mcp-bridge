import type { PluginError } from "../types/messages";
import { Icon } from "./Icon";

interface ErrorBannerProps {
  error: PluginError | null;
  onDismiss: () => void;
  onRetry?: () => void;
}

const formatError = (error: PluginError): string => {
  if (error.kind === "connection") {
    return `Connection error (${error.cause}): ${error.message}`;
  }
  return `Parse error: ${error.message}`;
};

export function ErrorBanner({ error, onDismiss, onRetry }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <div className="error-banner" role="alert">
      <Icon
        name="alert-circle"
        size={14}
        className="error-banner__icon"
        aria-label="Error"
      />
      <span className="error-banner__message">{formatError(error)}</span>
      <div className="error-banner__actions">
        {onRetry && (
          <button
            type="button"
            className="error-banner__retry"
            onClick={onRetry}
            title="Retry (R)"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          className="error-banner__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss error"
          title="Dismiss"
        >
          <Icon name="x" size={12} aria-hidden />
        </button>
      </div>
    </div>
  );
}
