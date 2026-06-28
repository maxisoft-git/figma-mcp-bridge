/**
 * Lightweight inline SVG icons.
 *
 * Based on Lucide icon paths (ISC licensed) but inlined to avoid
 * adding a dependency. All icons are 24x24 viewBox, stroke 2, currentColor.
 *
 * Usage: <Icon name="lock" size={16} aria-label="Lock" />
 */

import type { CSSProperties } from "react";

export type IconName =
  | "lock"
  | "unlock"
  | "wifi"
  | "wifi-off"
  | "loader"
  | "alert-circle"
  | "x"
  | "check"
  | "plug"
  | "plug-zap"
  | "trash"
  | "file-text"
  | "scroll-text"
  | "terminal"
  | "copy"
  | "chevron-up"
  | "chevron-down";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
  style?: CSSProperties;
}

const PATHS: Record<IconName, JSX.Element> = {
  lock: (
    <>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  unlock: (
    <>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </>
  ),
  wifi: (
    <>
      <path d="M5 13a10 10 0 0 1 14 0" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 20 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </>
  ),
  "wifi-off": (
    <>
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
      <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </>
  ),
  loader: (
    <>
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </>
  ),
  "alert-circle": (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),
  x: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  plug: (
    <>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </>
  ),
  "plug-zap": (
    <>
      <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" />
      <path d="m2 22 3-3" />
      <path d="M7.5 13.5 10 11" />
      <path d="M10.5 9.5 13 7" />
      <path d="M18 12V2l4 4h-4v8Z" />
    </>
  ),
  trash: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  "file-text": (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </>
  ),
  "scroll-text": (
    <>
      <path d="M15 12h-5" />
      <path d="M15 8h-5" />
      <path d="M19 17V5a2 2 0 0 0-2-2H4" />
      <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2" />
    </>
  ),
  terminal: (
    <>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </>
  ),
  copy: (
    <>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  "chevron-up": <polyline points="18 15 12 9 6 15" />,
  "chevron-down": <polyline points="6 9 12 15 18 9" />,
};

export function Icon({
  name,
  size = 16,
  className,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden = !ariaLabel,
  style,
}: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon icon--${name}${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
      style={style}
    >
      {PATHS[name]}
    </svg>
  );
}
