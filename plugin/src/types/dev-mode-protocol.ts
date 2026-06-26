/**
 * Wire protocol between the React UI and the Figma main thread
 * for Dev Mode Mirror exports.
 *
 * Lives in `src/types/` so both bundles (UI root: "./src/ui" and
 * main entry: "./src/main/code.ts") can import the same shapes.
 */

export type DevModeTab = "css" | "svg" | "html" | "json" | "img";

export const DEV_MODE_TABS: readonly DevModeTab[] = [
  "css",
  "svg",
  "html",
  "json",
  "img",
] as const;

export const DEV_MODE_TAB_LABELS: Record<DevModeTab, string> = {
  css: "CSS",
  svg: "SVG",
  html: "HTML",
  json: "JSON",
  img: "IMG",
};

/** UI → main thread: trigger an export. */
export interface DevModeExportRequest {
  type: "dev_mode_export";
  requestId: string;
  tab: DevModeTab;
  /** Optional nodeId. If absent, uses current selection. */
  nodeId?: string;
}

/** main thread → UI: payload of an export. */
export interface DevModeExportResult {
  type: "dev_mode_result";
  requestId: string;
  tab: DevModeTab;
  ok: boolean;
  reason?: string;
  nodeName?: string;
  nodeType?: string;
  // css tab
  css?: string;
  // svg tab
  svg?: string;
  // html tab
  html?: string;
  truncated?: boolean;
  visited?: number;
  // json tab
  json?: string;
  jsonNode?: unknown;
  // img tab
  base64?: string;
  mime?: string;
  source?: string;
  scaleMode?: string;
  bytes?: number;
}

export type DevModeMessage = DevModeExportRequest | DevModeExportResult;

/** Map tab → which fields are expected to be populated on success. */
export const DEV_MODE_TAB_FIELDS: Record<DevModeTab, keyof DevModeExportResult> = {
  css: "css",
  svg: "svg",
  html: "html",
  json: "json",
  img: "base64",
};
