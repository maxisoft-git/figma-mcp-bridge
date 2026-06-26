import { Icon } from "./Icon";

interface LockButtonProps {
  locked: boolean;
  onToggle: () => void;
  pluginVersion: string;
}

export function LockButton({ locked, onToggle, pluginVersion }: LockButtonProps) {
  return (
    <>
      <span className="version-label">v{pluginVersion}</span>
      <button
        type="button"
        className={`lock-btn ${locked ? "locked" : ""}`}
        onClick={onToggle}
        title={locked ? "Unlock plugin (L)" : "Lock plugin (L)"}
        aria-pressed={locked}
        aria-label={locked ? "Unlock plugin" : "Lock plugin"}
      >
        <Icon
          name={locked ? "lock" : "unlock"}
          size={11}
          className="lock-btn__icon"
          aria-hidden
        />
        <span className="lock-btn__label">{locked ? "Locked" : "Lock"}</span>
      </button>
    </>
  );
}
