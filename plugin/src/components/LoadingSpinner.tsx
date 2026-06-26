import { Icon } from "./Icon";

interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  message?: string;
}

const SIZE_MAP = {
  small: 12,
  medium: 18,
  large: 24,
};

export function LoadingSpinner({ size = "medium", message }: LoadingSpinnerProps) {
  const pixelSize = SIZE_MAP[size];

  return (
    <div
      className="loading-spinner"
      role="status"
      aria-live="polite"
      aria-label={message || "Loading"}
    >
      <Icon
        name="loader"
        size={pixelSize}
        className="loading-spinner__icon"
        aria-hidden
      />
      {message && <span className="loading-spinner__message">{message}</span>}
    </div>
  );
}
