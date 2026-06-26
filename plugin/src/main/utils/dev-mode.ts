/**
 * Dev Mode Mirror — shared logic for CSS/SVG/HTML/JSON/IMG exports.
 *
 * Ported from figma-dev/code.ts. Exposes the building blocks used by
 * the get_dev_css, get_dev_svg, get_dev_html, get_dev_json and
 * get_dev_image handlers.
 *
 * Notes:
 *  - HTML composition is bounded by HTML_NODE_LIMIT and HTML_MAX_DEPTH
 *    to keep the sandbox responsive.
 *  - Image extraction tries three strategies: direct imageHash,
 *    imageHash on a direct child, then node.exportAsync(PNG) fallback.
 *  - Image bytes are returned as base64 strings (postMessage has been
 *    observed to silently truncate large number[] arrays).
 */

import { decodeBase64ToBytes, getSceneNodeById, isSceneNode } from "../utils";

export type ExportTab = "css" | "svg" | "html" | "json" | "img";

export const HTML_NODE_LIMIT = 200;
export const HTML_MAX_DEPTH = 12;

export const DEV_MODE_TABS: readonly ExportTab[] = [
  "css",
  "svg",
  "html",
  "json",
  "img",
] as const;

export type ImageSource = "node" | `child:${string}` | "export";

export type SelectionPayload = {
  ok: boolean;
  reason?: string;
  nodeName?: string;
  nodeType?: string;
  nodeId?: string;
  css?: string;
  svg?: string;
  html?: string;
  json?: string;
  truncated?: boolean;
  visited?: number;
  imageBase64?: string;
  imageMime?: string;
  imageName?: string;
  imageSource?: ImageSource | string;
  imageScaleMode?: string;
};

const BASE64_CHUNK_SIZE = 60_000;

export function serializeCss(cssObj: Record<string, string>): string {
  return Object.entries(cssObj)
    .map(([prop, value]) => `${prop}: ${value};`)
    .join("\n");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getImageFillFromNode(node: SceneNode): ImagePaint | null {
  if (!("fills" in node)) return null;
  const fills = (node as unknown as { fills: ReadonlyArray<Paint> | typeof figma.mixed }).fills;
  if (!Array.isArray(fills)) return null;
  const found = (fills as ReadonlyArray<Paint>).find(
    (f) => f.type === "IMAGE" && (f as ImagePaint).visible !== false,
  ) as ImagePaint | undefined;
  return found && found.imageHash ? found : null;
}

export function detectMime(bytes: Uint8Array): string {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

export type ImageResult = {
  bytes: Uint8Array;
  mime: string;
  source: ImageSource | string;
  scaleMode: string;
};

export async function findImageForNode(node: SceneNode): Promise<ImageResult | null> {
  const direct = getImageFillFromNode(node);
  if (direct) {
    const hash = direct.imageHash as string;
    const img = figma.getImageByHash(hash);
    if (img) {
      try {
        const bytes = await img.getBytesAsync();
        return {
          bytes,
          mime: detectMime(bytes),
          source: "node",
          scaleMode: direct.scaleMode || "FILL",
        };
      } catch {
        // fall through
      }
    }
  }

  if ("children" in node) {
    for (const child of (node as FrameNode).children) {
      const found = getImageFillFromNode(child);
      if (found) {
        const hash = found.imageHash as string;
        const img = figma.getImageByHash(hash);
        if (img) {
          try {
            const bytes = await img.getBytesAsync();
            return {
              bytes,
              mime: detectMime(bytes),
              source: `child:${child.name}` as ImageSource,
              scaleMode: found.scaleMode || "FILL",
            };
          } catch {
            // continue
          }
        }
      }
    }
  }

  try {
    const bytes = await node.exportAsync({ format: "PNG" });
    return { bytes, mime: "image/png", source: "export", scaleMode: "—" };
  } catch {
    return null;
  }
}

export async function cssFor(node: SceneNode): Promise<string> {
  const cssObj = await node.getCSSAsync();
  return serializeCss(cssObj);
}

async function buildHtmlTree(
  node: SceneNode,
  depth: number,
  state: { count: number; truncated: boolean }
): Promise<string> {
  if (state.count >= HTML_NODE_LIMIT || depth > HTML_MAX_DEPTH) {
    state.truncated = true;
    return "";
  }
  state.count++;
  const indent = "  ".repeat(depth);
  const tag = node.type === "TEXT" ? "span" : "div";
  const css = await node.getCSSAsync();
  const style = serializeCss(css);
  const safeId = node.id.replace(/[^a-zA-Z0-9_-]/g, "");
  const id = `n-${depth}-${safeId}`;
  const textContent =
    node.type === "TEXT" ? escapeHtml((node as TextNode).characters) : "";

  if (!("children" in node) || (node as FrameNode).children.length === 0) {
    return `${indent}<${tag} id="${id}" class="n" style="${escapeHtml(style)}">${textContent}</${tag}>`;
  }

  const childParts: string[] = [];
  for (const child of (node as FrameNode).children) {
    if (state.count >= HTML_NODE_LIMIT) {
      state.truncated = true;
      break;
    }
    const piece = await buildHtmlTree(child, depth + 1, state);
    if (piece) childParts.push(piece);
  }

  const head = `${indent}<${tag} id="${id}" class="n" style="${escapeHtml(style)}">`;
  const tail = `${indent}</${tag}>`;
  if (childParts.length === 0) return `${head}${textContent}${tail}`;
  return `${head}\n${childParts.join("\n")}\n${tail}`;
}

export type HtmlResult = { html: string; truncated: boolean; visited: number };

export async function buildHtml(node: SceneNode): Promise<HtmlResult> {
  const state = { count: 0, truncated: false };
  const tree = await buildHtmlTree(node, 0, state);
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(node.name)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 16px; background: #fff; }
  [class="n"] { box-sizing: border-box; }
</style>
</head>
<body>
${tree}
</body>
</html>`;
  return { html, truncated: state.truncated, visited: state.count };
}

/**
 * Get the currently selected node, or null if nothing is selected.
 */
export function getSelectedNode(): SceneNode | null {
  const sel = figma.currentPage.selection;
  return sel.length > 0 ? sel[0] : null;
}

/**
 * Resolve a node by id, or return the current selection if no id given.
 * Throws if a nodeId is provided but not found.
 */
export async function resolveNode(nodeId?: string): Promise<SceneNode> {
  if (nodeId) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!isSceneNode(node)) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    return node;
  }
  const sel = getSelectedNode();
  if (!sel) {
    throw new Error("Nothing selected. Pick a node in the canvas or pass a nodeId.");
  }
  return sel;
}

/**
 * Encode a Uint8Array to a base64 string and split into chunks that
 * are safe to pass across the plugin postMessage boundary.
 */
export function bytesToBase64Chunks(bytes: Uint8Array): string[] {
  const base64 = figma.base64Encode(bytes);
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += BASE64_CHUNK_SIZE) {
    chunks.push(base64.slice(i, i + BASE64_CHUNK_SIZE));
  }
  return chunks;
}

/**
 * Build a SelectionPayload for the given tab. Returns `{ ok: false }` on
 * failure rather than throwing — callers can pass it through unchanged.
 */
export async function exportTab(
  node: SceneNode,
  tab: ExportTab
): Promise<SelectionPayload> {
  const base: SelectionPayload = {
    ok: true,
    nodeName: node.name,
    nodeType: node.type,
    nodeId: node.id,
  };

  try {
    if (tab === "css") {
      return { ...base, css: await cssFor(node) };
    }
    if (tab === "svg") {
      return { ...base, svg: await node.exportAsync({ format: "SVG_STRING" }) };
    }
    if (tab === "html") {
      const r = await buildHtml(node);
      return { ...base, html: r.html, truncated: r.truncated, visited: r.visited };
    }
    if (tab === "json") {
      const cssObj = await node.getCSSAsync();
      return { ...base, json: JSON.stringify(cssObj, null, 2) };
    }
    if (tab === "img") {
      const found = await findImageForNode(node);
      if (!found) {
        return {
          ...base,
          ok: false,
          reason:
            "No image fill on this node or its direct children, and node export returned no data.",
        };
      }
      return {
        ...base,
        imageBase64: figma.base64Encode(found.bytes),
        imageMime: found.mime,
        imageName: safeFileName(node.name, found.mime),
        imageSource: found.source,
        imageScaleMode: found.scaleMode,
      };
    }
    return { ...base, ok: false, reason: `Unknown tab: ${tab}` };
  } catch (err) {
    return {
      ...base,
      ok: false,
      reason: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function safeFileName(name: string, mime: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext =
    mime === "image/png" ? "png" :
    mime === "image/jpeg" ? "jpg" :
    mime === "image/gif" ? "gif" :
    mime === "image/webp" ? "webp" :
    "bin";
  return `${safe}.${ext}`;
}

// Suppress unused warning for re-exported helper
void decodeBase64ToBytes;
