import type { ServerRequest, PluginResponse } from "./types";
import type { DevModeExportRequest, DevModeExportResult, DevModeTab } from "../types/dev-mode-protocol";
import { sendStatus } from "./utils";
import { dispatch } from "./router";
import { createError, PluginErrorCode } from "./errors";
import { cssFor, buildHtml, findImageForNode } from "./utils/dev-mode";
import { serializeNode } from "./serializer";

const handleRequest = async (
  request: ServerRequest
): Promise<PluginResponse> => {
  try {
    return await dispatch(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      type: request.type,
      requestId: request.requestId,
      error: createError(PluginErrorCode.OPERATION_FAILED, message),
    };
  }
};

/** Resolve a node by id, or use current selection. Throws structured error. */
const resolveNodeForDev = async (nodeId: string | undefined): Promise<SceneNode> => {
  if (nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
      throw createError(PluginErrorCode.NODE_NOT_FOUND, `Node not found: ${nodeId}`);
    }
    return node as SceneNode;
  }
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    throw createError(
      PluginErrorCode.VALIDATION_ERROR,
      "Nothing selected. Pick a node in the canvas or pass a nodeId.",
    );
  }
  return sel[0];
};

/** Build a failure result with ok:false. */
const devFailure = (
  request: DevModeExportRequest,
  err: unknown,
): DevModeExportResult => {
  const message = err instanceof Error ? err.message : String(err);
  return {
    type: "dev_mode_result",
    requestId: request.requestId,
    tab: request.tab,
    ok: false,
    reason: message,
  };
};

/** Handle a dev_mode_export request from the UI. */
const handleDevModeExport = async (
  request: DevModeExportRequest,
): Promise<DevModeExportResult> => {
  const base = {
    type: "dev_mode_result" as const,
    requestId: request.requestId,
    tab: request.tab,
  };

  try {
    const node = await resolveNodeForDev(request.nodeId);
    const result: DevModeExportResult = {
      ...base,
      ok: true,
      nodeName: node.name,
      nodeType: node.type,
    };

    if (request.tab === "css") {
      result.css = await cssFor(node);
    } else if (request.tab === "svg") {
      result.svg = await node.exportAsync({ format: "SVG_STRING" });
    } else if (request.tab === "html") {
      const r = await buildHtml(node);
      result.html = r.html;
      result.truncated = r.truncated;
      result.visited = r.visited;
    } else if (request.tab === "json") {
      const cssObj = await node.getCSSAsync();
      result.json = JSON.stringify(cssObj, null, 2);
      result.jsonNode = serializeNode(node, { depth: 2 });
    } else if (request.tab === "img") {
      const found = await findImageForNode(node);
      if (!found) {
        result.ok = false;
        result.reason =
          "No image fill on this node or its direct children, and node export returned no data.";
      } else {
        result.base64 = figma.base64Encode(found.bytes);
        result.mime = found.mime;
        result.source = String(found.source);
        result.scaleMode = found.scaleMode;
        result.bytes = found.bytes.length;
      }
    } else {
      result.ok = false;
      result.reason = `Unknown tab: ${request.tab as string}`;
    }

    return result;
  } catch (err) {
    return devFailure(request, err);
  }
};

figma.showUI(__html__, { width: 460, height: 560 });
sendStatus();

// Persist a debug trail we can inspect from the terminal to diagnose
// handshake problems.
const debugLog: string[] = [];
const debugPush = (entry: string): void => {
  debugLog.push(`[${new Date().toISOString()}] ${entry}`);
  if (debugLog.length > 50) debugLog.shift();
  figma.clientStorage.setAsync("bridge-debug", JSON.stringify(debugLog));
};
debugPush("plugin started, sendStatus() called");

// Backup: if no ui-ready arrives within 2s, re-send status. This covers
// the case where the very first sendStatus() is dropped (UI listener not
// yet mounted) and the UI's own handshake on-mount effect also failed.
const statusRetry = setTimeout(() => {
  debugPush("2s elapsed, no ui-ready — re-sending status");
  sendStatus();
}, 2000);

figma.on("selectionchange", () => {
  debugPush("selectionchange — re-sending status");
  sendStatus();
});

figma.ui.onmessage = async (message: { type: string; [key: string]: unknown }) => {
  debugPush(`ui->main message: type=${message.type}`);
  if (message.type === "ui-ready") {
    clearTimeout(statusRetry);
    debugPush("ui-ready received — sending status");
    sendStatus();
    return;
  }

  if (message.type === "server-request") {
    const response = await handleRequest(message.payload as ServerRequest);
    try {
      figma.ui.postMessage(response);
    } catch (err) {
      figma.ui.postMessage({
        type: response.type,
        requestId: response.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (message.type === "dev_mode_export") {
    const result = await handleDevModeExport(
      message as unknown as DevModeExportRequest,
    );
    figma.ui.postMessage(result);
    return;
  }

  if (message.type === "ui-resize") {
    // UI asked the iframe to grow/shrink so the plugin takes less canvas
    // space. Min 460×56 (just the header bar) — Figma clamps the height
    // to a positive integer and enforces a 50px minimum.
    const collapsed = message.collapsed === true;
    const width = 460;
    const height = collapsed ? 56 : 560;
    try {
      figma.ui.resize(width, height);
      debugPush(`ui-resize: collapsed=${collapsed} → ${width}×${height}`);
    } catch (err) {
      debugPush(`ui-resize failed: ${(err as Error).message}`);
    }
    return;
  }
};
