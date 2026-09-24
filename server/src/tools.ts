import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Node } from "./node.js";
import { Follower } from "./follower.js";
import {
  createFrameInput,
  createImageInput,
  createPageInput,
  importHtmlLayersInput,
  createShapeShape,
  createTextShape,
  createShapeInput,
  createTextInput,
  setNodePropertiesInput,
  setTextPropertiesShape,
  setTextPropertiesInput,
  toolInputSchemas,
} from "./schema.js";
import type { BridgeResponse } from "./types.js";
import { buildSprite, type IconInput } from "./sprite.js";
import { fetchImageBytes, MAX_IMAGE_BYTES } from "./ssrf.js";
import { registerExtensionTools } from "./extensions/index.js";
import {
  inferFormatFromPath,
  resolveExportFormat,
  wireFormatFor,
  type ExportFormat,
} from "./export-format.js";
import { encodeWebp } from "./webp.js";

/**
 * Raster exports travel as MCP `image` content so the client feeds them to
 * the model as vision input; base64 in a text block measured ~20x more
 * expensive (14 KB PNG = ~12k text tokens vs ~500 as an image) and megabyte
 * payloads were truncated away by the client anyway.
 */
type ToolResultContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

type ToolResult = {
  content: ToolResultContent[];
  isError?: boolean;
};

export type { ExportFormat };

/** Largest html-figma layer-tree JSON the server will read from disk. */
const MAX_LAYERS_JSON_BYTES = 16 * 1024 * 1024;

export interface ScreenshotSender {
  sendWithParams(
    requestType: string,
    nodeIds?: string[],
    params?: Record<string, unknown>
  ): Promise<BridgeResponse>;
}

interface ScreenshotExport {
  nodeId: string;
  nodeName: string;
  format: ExportFormat;
  base64: string;
  width: number;
  height: number;
}

interface SaveScreenshotItemInput {
  nodeId: string;
  outputPath: string;
  format?: ExportFormat;
  scale?: number;
}

interface SaveScreenshotItemResult {
  index: number;
  nodeId: string;
  nodeName?: string;
  outputPath: string;
  format?: ExportFormat;
  width?: number;
  height?: number;
  bytesWritten?: number;
  success: boolean;
  error?: string;
}

export function registerTools(server: McpServer, node: Node, port: number): void {
  server.tool(
    "list_files",
    "List all currently connected Figma files. Returns fileKey and fileName for each. Use the fileKey to target a specific file in other tools.",
    async (): Promise<ToolResult> => {
      try {
        let files = node.listConnectedFiles();
        if (files.length === 0) {
          // Follower: fetch via RPC from leader
          const follower = new Follower(`http://localhost:${port}`);
          files = await follower.listConnectedFiles();
        }
        return {
          content: [{ type: "text", text: JSON.stringify(files) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_document",
    "Get the current Figma page document tree. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_document.shape,
    async ({ fileKey, includeHidden, includeImageData }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (includeHidden) params.includeHidden = true;
      if (includeImageData) params.includeImageData = true;
      return renderResponse(() =>
        node.sendWithParams("get_document", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "get_selection",
    "Get the currently selected nodes in Figma. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_selection.shape,
    async ({ fileKey, includeHidden, includeImageData }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (includeHidden) params.includeHidden = true;
      if (includeImageData) params.includeImageData = true;
      return renderResponse(() =>
        node.sendWithParams("get_selection", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "get_node",
    "Get a specific Figma node by ID. Must use colon format, e.g. '4029:12345', never use hyphens. Returns the whole subtree unless `depth` cuts it, and a subtree too large for one result is cut at the budget with `truncated: true` and `childCount` on the nodes it stopped at. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_node.shape,
    async ({ nodeId, fileKey, depth, includeHidden, includeImageData }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (depth !== undefined) params.depth = depth;
      if (includeHidden) params.includeHidden = true;
      if (includeImageData) params.includeImageData = true;
      return renderResponse(() =>
        node.sendWithParams("get_node", [nodeId], params, fileKey)
      );
    }
  );

  server.tool(
    "get_layout_tree",
    "Read absolute node transforms and layout bounds for a capture root. Separate screenshot calls are non-atomic. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_layout_tree.shape,
    async ({ rootId, maxNodes, fileKey }): Promise<ToolResult> =>
      renderResponse(() =>
        node.sendWithParams("get_layout_tree", [rootId], { maxNodes }, fileKey)
      )
  );

  server.tool(
    "execute_code",
    "Run JavaScript directly in the Figma plugin sandbox against the Plugin API — an escape hatch for anything the other tools do not cover. The code runs inside an async function, so it may `await` and `return` a JSON-safe value. Writes made here are real. When multiple files are connected, specify fileKey.",
    toolInputSchemas.execute_code.shape,
    async ({ code, fileKey }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("execute_code", undefined, { code }, fileKey)
      );
    }
  );

  server.tool(
    "get_styles",
    "Get all local styles in the document. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_styles.shape,
    async ({ fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.send("get_styles", undefined, fileKey));
    }
  );

  server.tool(
    "get_metadata",
    "Get metadata about the current Figma document including file name, pages, and current page info. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_metadata.shape,
    async ({ fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.send("get_metadata", undefined, fileKey));
    }
  );

  server.tool(
    "get_design_context",
    "Get the design context for the current selection or page. Returns a summarized tree structure optimized for understanding the current design context. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_design_context.shape,
    async ({ depth, includeHidden, includeImageData, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (depth !== undefined && depth > 0) {
        params.depth = depth;
      }
      if (includeHidden) {
        params.includeHidden = true;
      }
      if (includeImageData) {
        params.includeImageData = true;
      }
      return renderResponse(() =>
        node.sendWithParams("get_design_context", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "get_implementation_context",
    "Get a compact implementation-ready Figma context: precise auto-layout tree, typography, asset manifest, layout warnings, root CSS, and generated HTML. Use get_node when you need the complete raw Figma tree.",
    toolInputSchemas.get_implementation_context.shape,
    async ({ nodeId, maxDepth, includeHtml, includeCss, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (maxDepth !== undefined) params.maxDepth = maxDepth;
      if (includeHtml !== undefined) params.includeHtml = includeHtml;
      if (includeCss !== undefined) params.includeCss = includeCss;
      return renderResponse(() =>
        node.sendWithParams("get_implementation_context", [nodeId], params, fileKey)
      );
    }
  );

  server.tool(
    "get_variable_defs",
    "Get all local variable definitions including variable collections, modes, and variable values. Variables are Figma's system for design tokens (colors, numbers, strings, booleans). When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_variable_defs.shape,
    async ({ fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.send("get_variable_defs", undefined, fileKey));
    }
  );

  server.tool(
    "get_screenshot",
    "Export a screenshot of the selected nodes or specific nodes by ID as PNG/SVG/JPG/PDF/WEBP. Returns images as MCP image content (rendered by the client, never as base64 text), SVG as its text source and PDF as metadata only. WEBP is encoded server-side from a PNG export and needs `cwebp` on PATH. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_screenshot.shape,
    async ({ nodeIds, format, scale, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (format) params.format = wireFormatFor(format);
      if (scale !== undefined && scale > 0) params.scale = scale;
      try {
        const resp = await node.sendWithParams(
          "get_screenshot",
          nodeIds,
          params,
          fileKey
        );
        if (resp.error) {
          return { content: [{ type: "text", text: resp.error }], isError: true };
        }
        // The plugin exported PNG for a WEBP request; hand back webp instead.
        const data = format === "WEBP" ? await reencodeExportsAsWebp(resp.data) : resp.data;
        return { content: screenshotContent(data) };
      } catch (err) {
        return {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_image",
    "Export a specific node as an image (PNG/SVG/JPG/PDF/WEBP). Set backgroundOnly to export only the background fill of a frame without its children. If outputPath is provided, saves the image to disk and returns only metadata; otherwise the image comes back as MCP image content (SVG as text source, PDF as metadata only). WEBP is encoded server-side from a PNG export and needs `cwebp` on PATH. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_image.shape,
    async ({ nodeId, format, scale, backgroundOnly, outputPath, fileKey }): Promise<ToolResult> => {
      try {
        const targetPath =
          outputPath !== undefined
            ? resolveAndValidateOutputPath(outputPath, process.cwd())
            : undefined;

        // An explicit format wins, but a bare outputPath should still export
        // what its extension says — otherwise "shot.webp" silently receives
        // PNG bytes.
        const resolvedFormat = resolveExportFormat(
          format,
          targetPath ? inferFormatFromPath(targetPath) : null
        );

        const params: Record<string, unknown> = {
          format: wireFormatFor(resolvedFormat),
        };
        if (scale !== undefined && scale > 0) params.scale = scale;
        if (backgroundOnly) params.backgroundOnly = true;

        const resp = await node.sendWithParams("get_image", [nodeId], params, fileKey);
        if (resp.error) {
          return { content: [{ type: "text", text: resp.error }], isError: true };
        }

        const data = resp.data as { base64?: string; nodeId: string; nodeName: string; format: string; scale: number; width: number; height: number };

        if (targetPath && data.base64) {
          const bytesWritten = await writeExportToFile(
            data.base64,
            targetPath,
            resolvedFormat
          );
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                nodeId: data.nodeId,
                nodeName: data.nodeName,
                format: resolvedFormat,
                scale: data.scale,
                width: data.width,
                height: data.height,
                outputPath: targetPath,
                bytesWritten,
              }),
            }],
          };
        }

        if (resolvedFormat === "WEBP" && data.base64) {
          const webp = (await encodeWebp(Buffer.from(data.base64, "base64"))).toString("base64");
          return { content: screenshotContent({ ...data, format: "WEBP", base64: webp }) };
        }
        return { content: screenshotContent(data) };
      } catch (err) {
        return {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "save_node_json",
    "Serialize one or more Figma nodes to JSON files on disk. Returns only file metadata (path, size, node name) — never dumps the JSON into the response. Use this instead of get_node when you want to inspect large nodes without filling the context window.",
    toolInputSchemas.save_node_json.shape,
    async ({ items, fileKey }): Promise<ToolResult> => {
      const results = [];
      for (const item of items) {
        let resolvedPath = item.outputPath;
        try {
          resolvedPath = resolveAndValidateOutputPath(item.outputPath, process.cwd());
          const resp = await node.send("get_node", [item.nodeId], fileKey);
          if (resp.error) throw new Error(resp.error);
          const json = JSON.stringify(resp.data, null, 2);
          const bytes = Buffer.from(json, "utf8");
          await mkdir(path.dirname(resolvedPath), { recursive: true });
          try {
            await writeFile(resolvedPath, bytes, { flag: "wx" });
          } catch (err) {
            if (isNodeError(err) && err.code === "EEXIST") {
              throw new Error(`File already exists: ${resolvedPath}`);
            }
            throw err;
          }
          const nodeName = (resp.data as { name?: string })?.name;
          results.push({ nodeId: item.nodeId, nodeName, outputPath: resolvedPath, bytesWritten: bytes.length, success: true });
        } catch (err) {
          results.push({ nodeId: item.nodeId, outputPath: resolvedPath, success: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
      const succeeded = results.filter((r) => r.success).length;
      return {
        content: [{ type: "text", text: JSON.stringify({ total: results.length, succeeded, failed: results.length - succeeded, results }) }],
      };
    }
  );

  server.tool(
    "set_node_visibility",
    "Show or hide specific Figma nodes. Returns previous visibility for each node so you can restore them after. Useful for isolating a single layer before exporting: hide all siblings, export the frame, then restore visibility.",
    toolInputSchemas.set_node_visibility.shape,
    async ({ items, fileKey }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("set_node_visibility", undefined, { items }, fileKey)
      );
    }
  );

  server.tool(
    "set_text_content",
    "Update the contents of a single text node. The plugin loads the node's fonts before applying the new text. When multiple files are connected, specify fileKey.",
    toolInputSchemas.set_text_content.shape,
    async ({ nodeId, text, fileKey }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("set_text_content", [nodeId], { text }, fileKey)
      );
    }
  );

  server.tool(
    "set_text_properties",
    "Patch common text properties such as font family/style, size, alignment, auto-resize, line height, letter spacing, fill color, and bounds. When multiple files are connected, specify fileKey.",
    setTextPropertiesShape.shape,
    async ({ nodeId, fileKey, ...properties }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("set_text_properties", [nodeId], properties, fileKey)
      );
    }
  );

  server.tool(
    "set_node_properties",
    "Patch common node properties such as name, position, size, visibility, opacity, corner radius, and solid fill color. Only supported properties for the target node type may be changed. When multiple files are connected, specify fileKey.",
    setNodePropertiesInput.shape,
    async ({ nodeId, fileKey, ...properties }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("set_node_properties", [nodeId], properties, fileKey)
      );
    }
  );

  server.tool(
    "create_page",
    "Create a new page in the Figma document, optionally naming it and switching the editor to it. Returns the new page's ID, which can be passed as parentId to create_frame / create_text / create_shape / create_image to author content on that page. When multiple files are connected, specify fileKey.",
    createPageInput.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_page", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_frame",
    "Create a new frame, optionally inside a specified parent. You can set name, size, position, and a solid fill. When multiple files are connected, specify fileKey.",
    createFrameInput.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_frame", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_text",
    "Create a new text node, optionally inside a specified parent. You can set its content, font, size, alignment, color, position, and bounds. When multiple files are connected, specify fileKey.",
    createTextShape.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_text", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_shape",
    "Create a rectangle, ellipse, or line, optionally inside a specified parent. You can set its size, position, rotation, fill, and stroke. When multiple files are connected, specify fileKey.",
    createShapeShape.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_shape", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_image",
    "Create an image-backed rectangle from a local file path, remote URL, or data URI. You can set its parent, position, size, corner radius, and fit mode. When multiple files are connected, specify fileKey.",
    createImageInput.shape,
    async ({ source, fileKey, ...params }): Promise<ToolResult> => {
      try {
        const imageBase64 = await loadImageSourceAsBase64(source, process.cwd());
        return await renderResponse(() =>
          node.sendWithParams(
            "create_image",
            undefined,
            { ...params, imageBase64 },
            fileKey
          )
        );
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "import_html_layers",
    "Import a DOM serialization (JSON produced by html-figma's browser htmlToFigma()) as editable Figma layers inside a new wrapper frame — frames, text, rectangles, and SVG vectors in one call. Source must be a JSON file path inside the MCP server working directory. Optionally append the wrapper into an existing frame/section via parentId. When multiple files are connected, specify fileKey.",
    importHtmlLayersInput.shape,
    async ({ source, fileKey, ...params }): Promise<ToolResult> => {
      try {
        const layers = await loadLayersJson(source, process.cwd());
        return await renderResponse(() =>
          node.sendWithParams("import_html_layers", undefined, { ...params, layers }, fileKey)
        );
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "duplicate_nodes",
    "Duplicate one or more nodes in place. The duplicates remain under the same parent as the originals. When multiple files are connected, specify fileKey.",
    toolInputSchemas.duplicate_nodes.shape,
    async ({ nodeIds, fileKey }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("duplicate_nodes", nodeIds, undefined, fileKey)
      );
    }
  );

  server.tool(
    "reparent_nodes",
    "Move one or more nodes into a different parent container. When multiple files are connected, specify fileKey.",
    toolInputSchemas.reparent_nodes.shape,
    async ({ nodeIds, parentId, fileKey }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("reparent_nodes", nodeIds, { parentId }, fileKey)
      );
    }
  );

  server.tool(
    "delete_nodes",
    "Delete one or more nodes. This is destructive and requires confirm: true. Page and document nodes cannot be deleted through this tool. When multiple files are connected, specify fileKey.",
    toolInputSchemas.delete_nodes.shape,
    async ({ nodeIds, confirm, fileKey }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("delete_nodes", nodeIds, { confirm }, fileKey)
      );
    }
  );

  server.tool(
    "save_screenshots",
    "Export screenshots for multiple nodes and save them directly to the local filesystem. Returns metadata only (no base64). When multiple files are connected, specify fileKey.",
    toolInputSchemas.save_screenshots.shape,
    async ({ items, format, scale, fileKey }): Promise<ToolResult> => {
      try {
        // Create a sender bound to the specific fileKey
        const sender: ScreenshotSender = {
          sendWithParams: (requestType, nodeIds, params) =>
            node.sendWithParams(requestType, nodeIds, params, fileKey),
        };
        const result = await executeSaveScreenshots(sender, items, format, scale);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "set_stroke",
    "Set or update the stroke on a node. Supports color, weight, alignment, and dash patterns. When multiple files are connected, specify fileKey.",
    toolInputSchemas.set_stroke.shape,
    async ({ nodeId, fileKey, ...properties }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("set_stroke", [nodeId], properties, fileKey)
      );
    }
  );

  server.tool(
    "set_effects",
    "Add, replace, or clear visual effects (shadows, blurs) on a node. Use mode:'append' to add, mode:'replace' to replace all, or mode:'clear' to remove all. When multiple files are connected, specify fileKey.",
    toolInputSchemas.set_effects.shape,
    async ({ nodeId, fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("set_effects", [nodeId], params, fileKey)
      );
    }
  );

  server.tool(
    "set_constraints",
    "Set resizing constraints on a node (horizontal and vertical). When multiple files are connected, specify fileKey.",
    toolInputSchemas.set_constraints.shape,
    async ({ nodeId, fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("set_constraints", [nodeId], params, fileKey)
      );
    }
  );

  server.tool(
    "set_gradient_fill",
    "Add a gradient fill (linear, radial, angular, or diamond) to a node. When multiple files are connected, specify fileKey.",
    toolInputSchemas.set_gradient_fill.shape,
    async ({ nodeId, fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("set_gradient_fill", [nodeId], params, fileKey)
      );
    }
  );

  server.tool(
    "list_components",
    "List all local components on the current page or a specified page. Returns component ID, name, key, and dimensions. When multiple files are connected, specify fileKey.",
    toolInputSchemas.list_components.shape,
    async ({ pageId, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (pageId) params.pageId = pageId;
      return renderResponse(() =>
        node.sendWithParams("list_components", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_component",
    "Convert an existing node into a reusable component. Returns the new component's ID and key. When multiple files are connected, specify fileKey.",
    toolInputSchemas.create_component.shape,
    async ({ nodeId, fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_component", [nodeId], params, fileKey)
      );
    }
  );

  server.tool(
    "create_instance",
    "Create an instance of an existing component by ID or key. Returns the new instance's ID. When multiple files are connected, specify fileKey.",
    toolInputSchemas.create_instance.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_instance", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "set_instance_properties",
    "Override properties on a component instance's children. Supports changing text content, fills, opacity, visibility, and name of nested nodes. When multiple files are connected, specify fileKey.",
    toolInputSchemas.set_instance_properties.shape,
    async ({ nodeId, fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("set_instance_properties", [nodeId], params, fileKey)
      );
    }
  );

  server.tool(
    "batch_mutation",
    "Execute multiple operations atomically. Supports creating frames, text nodes, shapes, setting properties (position, size, fills, strokes, corner radius), editing text, appending children, deleting nodes, and finding nodes. Use refs (tmp:refName) to reference nodes created in earlier operations within the same batch. Max 100 operations per call. When multiple files are connected, specify fileKey.",
    toolInputSchemas.batch_mutation.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("batch_mutation", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_paint_style",
    "Create a new paint style (color or gradient) in the Figma document. Returns the new style's ID. When multiple files are connected, specify fileKey.",
    toolInputSchemas.create_paint_style.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_paint_style", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_text_style",
    "Create a new text style (font, size, line height, etc.) in the Figma document. Returns the new style's ID. When multiple files are connected, specify fileKey.",
    toolInputSchemas.create_text_style.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_text_style", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_effect_style",
    "Create a new effect style (shadow, blur) in the Figma document. Returns the new style's ID. When multiple files are connected, specify fileKey.",
    toolInputSchemas.create_effect_style.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_effect_style", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_grid_style",
    "Create a new grid style (columns, rows, or grid) in the Figma document. Returns the new style's ID. When multiple files are connected, specify fileKey.",
    toolInputSchemas.create_grid_style.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_grid_style", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_variable_collection",
    "Create a new variable collection (design token group) with modes (e.g., Light/Dark). Returns the new collection's ID. When multiple files are connected, specify fileKey.",
    toolInputSchemas.create_variable_collection.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_variable_collection", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_variable",
    "Create a new variable (design token) in a collection. Supports COLOR, FLOAT, STRING, and BOOLEAN types. Values are set per mode (by mode name or modeId). When multiple files are connected, specify fileKey.",
    toolInputSchemas.create_variable.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_variable", undefined, params, fileKey)
      );
    }
  );

  // ---- Dev Mode Mirror (ported from figma-dev) ----
  server.tool(
    "get_dev_css",
    "Dev Mode Mirror: get CSS for a node. Uses figma.getCSSAsync() on the single node (no subtree walk). Pass nodeIds[0] to target a specific node; otherwise uses the current selection. Returns { nodeId, nodeName, nodeType, css }.",
    toolInputSchemas.get_dev_css.shape,
    async ({ fileKey, nodeIds }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("get_dev_css", nodeIds, undefined, fileKey)
      );
    }
  );

  server.tool(
    "get_dev_svg",
    "Dev Mode Mirror: export a node as SVG with all styles inlined as XML attributes (matches what Figma's Dev Mode shows). Pass nodeIds[0] to target a specific node; otherwise uses the current selection. Returns { nodeId, nodeName, nodeType, svg }.",
    toolInputSchemas.get_dev_svg.shape,
    async ({ fileKey, nodeIds }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("get_dev_svg", nodeIds, undefined, fileKey)
      );
    }
  );

  server.tool(
    "get_dev_html",
    "Dev Mode Mirror: compose a simplified HTML document for a node by walking its children. Capped at 200 nodes / 12 levels deep to keep the sandbox responsive. Image fills are NOT inlined. Pass nodeIds[0] to target a specific node; otherwise uses the current selection. Returns { nodeId, nodeName, nodeType, html, truncated, visited }.",
    toolInputSchemas.get_dev_html.shape,
    async ({ fileKey, nodeIds }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("get_dev_html", nodeIds, undefined, fileKey)
      );
    }
  );

  server.tool(
    "get_dev_json",
    "Dev Mode Mirror: get the raw getCSSAsync() key/value object for a node, plus a depth-2 structural dump of the node tree. Pass nodeIds[0] to target a specific node; otherwise uses the current selection. Returns { nodeId, nodeName, nodeType, css: { ... }, node: SerializedNode }.",
    toolInputSchemas.get_dev_json.shape,
    async ({ fileKey, nodeIds }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("get_dev_json", nodeIds, undefined, fileKey)
      );
    }
  );

  server.tool(
    "get_dev_image",
    "Dev Mode Mirror: extract the image from a node. Tries (1) direct imageHash, (2) imageHash on a direct child, (3) node.exportAsync(PNG) fallback. Returns { nodeId, nodeName, nodeType, mime, source, scaleMode, base64, bytes }.",
    toolInputSchemas.get_dev_image.shape,
    async ({ fileKey, nodeIds }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("get_dev_image", nodeIds, undefined, fileKey)
      );
    }
  );

  // ---- Design System automation ----
  server.tool(
    "extract_design_system",
    "Extract a design system from a node subtree. Scans all unique colors (SOLID fills), text styles, spacing values (auto-layout padding/gap) and corner radii. Creates Variables in the target Variable collection and Paint/Text Styles. Returns a manifestId that can be passed to create_styles_table and apply_design_system. Typical workflow: extract from a master frame, then apply to other pages.",
    toolInputSchemas.extract_design_system.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("extract_design_system", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_styles_table",
    "Render a visual reference table of paint styles and text styles from a design system manifest on a dedicated '📐 Design System' page. Each color cell shows a swatch bound to the underlying Variable; each text cell shows a sample bound to the text style. Use after extract_design_system to give humans a browsable overview.",
    toolInputSchemas.create_styles_table.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_styles_table", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "apply_design_system",
    "Apply a design system (extracted earlier) to the given nodes. Walks recursively and replaces hardcoded SOLID fills, text styles and corner radii with Variables / Styles from the manifest. Use dryRun=true to preview changes without applying them. Use skipMissing=true to leave values not in the manifest untouched instead of counting them as skipped.",
    toolInputSchemas.apply_design_system.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("apply_design_system", undefined, params, fileKey)
      );
    }
  );

  // ---- Manifest management ----
  server.tool(
    "manage_manifests",
    "List all stored design system manifests, or delete a specific one. Manifests are persisted to ~/.figma-mcp-bridge/manifests/ as JSON files and survive plugin restarts. Use mode='list' to enumerate, mode='delete' with manifestId to remove.",
    toolInputSchemas.manage_manifests.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("manage_manifests", undefined, params, fileKey)
      );
    }
  );

  // ---- Workflow tools ----
  server.tool(
    "bulk_rename",
    "Bulk rename nodes in a subtree using a RegEx pattern. Useful for cleaning up auto-generated names (e.g. /^Frame \\d+$/ → 'Frame'). Returns { matched, renamed, samples }.",
    toolInputSchemas.bulk_rename.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("bulk_rename", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "normalize_spacing",
    "Normalize spacing values across auto-layout frames in the given nodes. Strategy: 'grid' (4px step), 'manifest' (snap to values in a design system), 'semantic' (Tailwind scale). Returns diffs and applies unless dryRun=true.",
    toolInputSchemas.normalize_spacing.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("normalize_spacing", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "switch_theme",
    "Switch variable modes (light/dark) for all bound variables on the given nodes. If manifestId is provided, the manifest's collection is also switched.",
    toolInputSchemas.switch_theme.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("switch_theme", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "update_component_instances",
    "Mass-update overrides on instances of a master component. Override keys: 'text:<name>', 'fill:<name>', 'opacity:<name>', 'rotation:<name>', 'visible:<name>', or just '<name>' (defaults to text).",
    toolInputSchemas.update_component_instances.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("update_component_instances", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "normalize_layers",
    "Clean up a subtree: rename 'Frame N' → 'Frame' and flatten single-child frame wrappers. Reports actions and supports dry-run.",
    toolInputSchemas.normalize_layers.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("normalize_layers", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "lint_styles",
    "Lint a subtree against design system rules. Flags hardcoded colors, off-grid spacing, etc. With fix=true, attempts to rebind violations to manifest variables.",
    toolInputSchemas.lint_styles.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("lint_styles", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "generate_component_from_description",
    "Create a Figma component from a structured description. Supports nested text/frame/rect children. Optional manifest to bind styles.",
    toolInputSchemas.generate_component_from_description.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("generate_component_from_description", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "analyze_node_against_design",
    "Render preview(s) of the given nodes and list deviations from the given manifest (hardcoded colors, off-grid spacing). Returns { previews, deviations }.",
    toolInputSchemas.analyze_node_against_design.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("analyze_node_against_design", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "apply_aria_labels",
    "Apply accessible names to interactive nodes in a subtree. Figma uses node.name as the a11y label proxy. mode='auto' uses text content; 'from-name' uses node name; 'clear' empties labels.",
    toolInputSchemas.apply_aria_labels.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("apply_aria_labels", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "manage_snapshots",
    "Create, list, restore, or delete node state snapshots. Snapshots auto-expire after 10 minutes and are capped at 32.",
    toolInputSchemas.manage_snapshots.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("manage_snapshots", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "diff_layouts",
    "Diff two frames' auto-layout properties (and child structure if recurse=true). Returns a list of changes.",
    toolInputSchemas.diff_layouts.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("diff_layouts", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "go_to_node",
    "Set Figma's current selection to the given node. Helps AI agents ground the user's UI in the right context.",
    toolInputSchemas.go_to_node.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("go_to_node", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "get_selection_chain",
    "Return the breadcrumb of names from the current selection up to the page root.",
    toolInputSchemas.get_selection_chain.shape,
    async ({ fileKey }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("get_selection_chain", undefined, {}, fileKey)
      );
    }
  );

  server.tool(
    "set_z_index_strategy",
    "Move the given nodes to front/back of their parent, or forward/backward by one step. Useful for layer order fixes.",
    toolInputSchemas.set_z_index_strategy.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("set_z_index_strategy", undefined, params, fileKey)
      );
    }
  );

  // ---- Dev Mode parity ----
  server.tool(
    "inspect_node",
    "Inspect a node: box model, constraints, typography, fills/strokes/effects with bound variables, and warnings. Set recurse=true to walk a subtree with overflow detection.",
    toolInputSchemas.inspect_node.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("inspect_node", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "generate_code",
    "Generate code for a Figma node. Frameworks: react-tailwind, react-css, vue, html, css, scss. Returns { html, css, dependencies }.",
    toolInputSchemas.generate_code.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("generate_code", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "inspect_variables",
    "Inspect/get/set/alias design variables. mode=list (with filters), get (collection+vars+values), set (one value), alias (create alias variable).",
    toolInputSchemas.inspect_variables.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("inspect_variables", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "get_set_property_value",
    "Read or write a single property on one or more nodes. Set value to write. Properties: 'fill', 'width', 'height', 'rotation', 'opacity', 'cornerRadius', 'paddingTop' etc., 'characters' (for TEXT).",
    toolInputSchemas.get_set_property_value.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("get_set_property_value", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "get_layout_measurements",
    "Get auto-layout measurements for a frame and (optionally) its subtree: padding, spacing, sizing modes, alignment, layout grow/align. Includes overflow warnings.",
    toolInputSchemas.get_layout_measurements.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("get_layout_measurements", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "visualize_layout",
    "Return an ASCII tree visualization of an auto-layout structure. Useful for understanding complex nested layouts without rendering screenshots.",
    toolInputSchemas.visualize_layout.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("visualize_layout", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "get_constraints",
    "Get resize constraints (horizontal/vertical MIN/MAX/STRETCH/SCALE/CENTER) and layout grow/align for the given nodes.",
    toolInputSchemas.get_constraints.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("get_constraints", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "get_component_variants",
    "Inspect a component's variants: property definitions and each variant's resolved property values.",
    toolInputSchemas.get_component_variants.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("get_component_variants", undefined, params, fileKey)
      );
    }
  );

  // ---- Tier 2/3 ----
  server.tool(
    "apply_style_preset",
    "Create a Variable collection from a built-in or custom design system preset (iOS, Android, Material, Fluent). Optionally bind the resulting variables to the given nodes (fills, spacing, radius).",
    toolInputSchemas.apply_style_preset.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("apply_style_preset", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "create_design_token_alias",
    "Create a new alias variable that points to an existing one. Useful for semantic naming (e.g. 'surface' → 'color/neutral-50').",
    toolInputSchemas.create_design_token_alias.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("create_design_token_alias", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "bulk_swap_text",
    "Bulk replace text inside TEXT nodes in a subtree. Supports literal substring or RegEx replacement with capture groups.",
    toolInputSchemas.bulk_swap_text.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("bulk_swap_text", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "set_node_metadata",
    "Store JSON metadata on a node via setSharedPluginData. Used for AI annotations, build IDs, design-version tags.",
    toolInputSchemas.set_node_metadata.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("set_node_metadata", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "get_node_metadata",
    "Read metadata stored by set_node_metadata.",
    toolInputSchemas.get_node_metadata.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("get_node_metadata", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "figma_inspect",
    "Mirror of Figma's Dev Mode Inspect panel: full box model, constraints, typography, fills/strokes/effects with bound variables, layout subtree, component binding.",
    toolInputSchemas.figma_inspect.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("figma_inspect", undefined, params, fileKey)
      );
    }
  );

  // ---- Tier 4 — design system marketplace + spec import ----
  server.tool(
    "export_design_tokens",
    "Export stored design system manifest(s) as a JSON string. The JSON can be saved to disk and re-imported later. Useful for backing up a design system or sharing it across projects.",
    toolInputSchemas.export_design_tokens.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("export_design_tokens", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "import_design_tokens",
    "Import a design system manifest from JSON (e.g. from export_design_tokens or an external source). Returns the new (or merged) manifestId with counts.",
    toolInputSchemas.import_design_tokens.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("import_design_tokens", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "find_nodes_by_variable",
    "Find all nodes that bind to a given design variable. Useful for refactoring: 'find all nodes using color/primary/500 before I change it'.",
    toolInputSchemas.find_nodes_by_variable.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("find_nodes_by_variable", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "storybook_import",
    "Create a Figma frame from a Storybook-like JSON spec. Supports nested 'frame' with auto-layout, plus 'text', 'rect', 'circle'.",
    toolInputSchemas.storybook_import.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("storybook_import", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "spec_import",
    "Create a Figma component from a declarative spec. Designed for high-level UI descriptions like 'a row with a title and a button'. Supports 'row', 'column', 'text', 'button', 'input', 'rect' primitives with auto-layout. Optional 'tokens' map for design system variable references.",
    toolInputSchemas.spec_import.shape,
    async ({ fileKey, ...params }): Promise<ToolResult> => {
      return renderResponse(() =>
        node.sendWithParams("spec_import", undefined, params, fileKey)
      );
    }
  );

  server.tool(
    "export_icon_sprite",
    "Find SVG icons across the file, deduplicate them, and write a single sprite.svg to disk. Useful for shipping a complete icon set to web/app consumers. Returns a summary of how many icons were found vs collapsed into the final sprite.",
    toolInputSchemas.export_icon_sprite.shape,
    async (rawArgs): Promise<ToolResult> => {
      const args = rawArgs as {
        outputPath: string;
        scope?: "page" | "selection" | "document";
        pageId?: string;
        namePattern?: string;
        sizeFilter?: { width: number; tolerance?: number };
        includeHidden?: boolean;
        maxIcons?: number;
        dedupeMode?: "raw" | "normalized" | "paths";
        spriteFormat?: "symbol" | "g";
        fillStrategy?: "currentColor" | "preserve" | "black";
        fileKey?: string;
      };

      const {
        outputPath,
        fileKey,
        dedupeMode,
        spriteFormat,
        fillStrategy,
        ...pluginParams
      } = args;

      let resolvedPath: string;
      try {
        resolvedPath = resolveAndValidateOutputPath(outputPath, process.cwd());
      } catch (err) {
        return {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        };
      }

      const pluginArgs: Record<string, unknown> = { ...pluginParams };
      // Empty namePattern disables the filter on the plugin side (it falls
      // back to the default if undefined — so we pass empty string).
      if (args.namePattern !== undefined) pluginArgs.namePattern = args.namePattern;

      const resp = await node.sendWithParams(
        "export_icon_sprite",
        undefined,
        pluginArgs,
        fileKey,
      );
      if (resp.error) {
        return { content: [{ type: "text", text: resp.error }], isError: true };
      }

      const data = resp.data as {
        scope: string;
        totalFound: number;
        truncated: boolean;
        icons: IconInput[];
      };
      const result = buildSprite(data.icons ?? [], {
        dedupeMode,
        spriteFormat,
        fillStrategy,
      });

      try {
        await mkdir(path.dirname(resolvedPath), { recursive: true });
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to create output directory: ${(err as Error).message}` }],
          isError: true,
        };
      }

      try {
        await writeFile(resolvedPath, result.sprite, { flag: "wx" });
      } catch (err) {
        if (isNodeError(err) && err.code === "EEXIST") {
          return {
            content: [{ type: "text", text: `File already exists at outputPath: ${resolvedPath}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: (err as Error).message }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              scope: data.scope,
              totalFound: result.totalFound,
              uniqueIcons: result.uniqueIcons,
              duplicatesRemoved: result.duplicatesRemoved,
              truncated: data.truncated,
              outputPath: resolvedPath,
              bytesWritten: Buffer.byteLength(result.sprite, "utf8"),
              groups: result.groups,
            }),
          },
        ],
      };
    }
  );

  registerExtensionTools(server, node);
}

export async function executeSaveScreenshots(
  sender: ScreenshotSender,
  items: SaveScreenshotItemInput[],
  format?: ExportFormat,
  scale?: number
): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  hasErrors: boolean;
  results: SaveScreenshotItemResult[];
}> {
  const results: SaveScreenshotItemResult[] = [];

  for (const [index, item] of items.entries()) {
    const result = await saveScreenshotItemToFile(
      sender,
      item,
      index,
      process.cwd(),
      format,
      scale
    );
    results.push(result);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;

  return {
    total: results.length,
    succeeded,
    failed,
    hasErrors: failed > 0,
    results,
  };
}

async function renderResponse(
  fn: () => Promise<BridgeResponse>
): Promise<ToolResult> {
  try {
    const resp = await fn();
    if (resp.error) {
      return {
        content: [{ type: "text", text: resp.error }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(resp.data) }],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: err instanceof Error ? err.message : String(err),
        },
      ],
      isError: true,
    };
  }
}

function resolveAndValidateOutputPath(
  outputPath: string,
  workspaceRoot: string
): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedPath = path.resolve(resolvedRoot, outputPath);
  const relativePath = path.relative(resolvedRoot, resolvedPath);
  const escapesRoot =
    relativePath.startsWith("..") || path.isAbsolute(relativePath);
  if (escapesRoot) {
    throw new Error(
      `outputPath must be inside the MCP server working directory: ${resolvedRoot}`
    );
  }
  return resolvedPath;
}

async function loadImageSourceAsBase64(
  source: string,
  workspaceRoot: string
): Promise<string> {
  if (/^https?:\/\//i.test(source)) {
    const bytes = await fetchImageBytes(source);
    return bytes.toString("base64");
  }

  const dataUrlMatch = source.match(/^data:.*?;base64,(.+)$/);
  if (dataUrlMatch) {
    return dataUrlMatch[1];
  }

  const resolvedPath = path.isAbsolute(source)
    ? source
    : path.resolve(workspaceRoot, source);
  const bytes = await readFile(resolvedPath);
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes`);
  }
  return bytes.toString("base64");
}

/**
 * Reads an html-figma layer tree from a JSON file inside the workspace.
 *
 * Symlinks are resolved before the containment check so a workspace-local link
 * cannot point the read outside the working directory; the size is checked
 * before the read so an oversized file is rejected without allocating it.
 */
async function loadLayersJson(
  source: string,
  workspaceRoot: string
): Promise<Record<string, unknown>> {
  const resolvedRoot = await realpath(path.resolve(workspaceRoot));
  const lexicalPath = path.resolve(resolvedRoot, source);
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(lexicalPath);
  } catch {
    throw new Error(`Layers source not found: ${source}`);
  }
  const relativePath = path.relative(resolvedRoot, resolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(
      `layers source must be inside the MCP server working directory: ${resolvedRoot}`
    );
  }
  const info = await stat(resolvedPath);
  if (!info.isFile()) {
    throw new Error(`Layers source is not a regular file: ${source}`);
  }
  if (info.size > MAX_LAYERS_JSON_BYTES) {
    throw new Error(`Layers JSON exceeds ${MAX_LAYERS_JSON_BYTES} bytes`);
  }
  const bytes = await readFile(resolvedPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Layers source is not valid JSON: ${source}`);
  }
  // htmlToFigma() returns a single root LayerNode; tolerate a one-element array.
  const root = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!root || typeof root !== "object" || typeof (root as { type?: unknown }).type !== "string") {
    throw new Error(
      "Layers JSON must be an html-figma LayerNode tree (object with a `type` field)"
    );
  }
  return root as Record<string, unknown>;
}

/**
 * Re-encodes the PNG exports in a screenshot payload as WEBP.
 *
 * Only WEBP requests take this path, and the plugin answered those with PNG
 * bytes, so each entry is re-encoded and relabelled.
 * @param data - Screenshot payload from the plugin.
 * @returns The same payload with WEBP exports.
 */
async function reencodeExportsAsWebp(data: unknown): Promise<unknown> {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid screenshot response from plugin");
  }
  const payload = data as { exports?: unknown };
  if (!Array.isArray(payload.exports)) {
    throw new Error("Invalid screenshot response from plugin");
  }
  const exports = await Promise.all(
    payload.exports.map(async (entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const item = entry as { base64?: unknown };
      if (typeof item.base64 !== "string") return entry;
      const webp = await encodeWebp(Buffer.from(item.base64, "base64"));
      return { ...entry, format: "WEBP", base64: webp.toString("base64") };
    })
  );
  return { ...payload, exports };
}

function getSingleScreenshotExport(data: unknown): ScreenshotExport {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid screenshot response from plugin");
  }

  const exports = (data as { exports?: unknown }).exports;
  if (!Array.isArray(exports) || exports.length === 0) {
    throw new Error("No screenshot export returned by plugin");
  }

  const first = exports[0];
  if (
    !first ||
    typeof first !== "object" ||
    typeof (first as { nodeId?: unknown }).nodeId !== "string" ||
    typeof (first as { nodeName?: unknown }).nodeName !== "string" ||
    typeof (first as { base64?: unknown }).base64 !== "string" ||
    typeof (first as { width?: unknown }).width !== "number" ||
    typeof (first as { height?: unknown }).height !== "number"
  ) {
    throw new Error("Malformed screenshot export payload");
  }

  const screenshot = first as ScreenshotExport;
  return screenshot;
}

/** MIME types for the raster formats an export can come back as. */
const IMAGE_MIME_BY_FORMAT: Record<string, string> = {
  PNG: "image/png",
  JPG: "image/jpeg",
  WEBP: "image/webp",
};

/**
 * Converts a screenshot payload into MCP content parts.
 *
 * Raster exports become `image` content so the client passes them to the
 * model as vision input — base64 inside a text block measured ~20x more
 * expensive for the same picture, and multi-megabyte payloads were
 * truncated by the client anyway, leaving the model blind. SVG comes back
 * decoded (it is source, not a picture); PDF only as metadata, because it
 * cannot be rendered inline and its base64 would blow up the context.
 * @param data - `{ exports: [...] }` from get_screenshot or a single export from get_image.
 * @returns One content part per export plus a trailing JSON metadata line.
 */
export function screenshotContent(data: unknown): ToolResultContent[] {
  const entries = collectScreenshotExports(data);
  const content: ToolResultContent[] = [];
  const meta: unknown[] = [];

  for (const entry of entries) {
    if (entry.format === "SVG") {
      content.push({
        type: "text",
        text: Buffer.from(entry.base64, "base64").toString("utf8"),
      });
    } else if (entry.format !== "PDF") {
      content.push({
        type: "image",
        data: entry.base64,
        mimeType: IMAGE_MIME_BY_FORMAT[entry.format] ?? "image/png",
      });
    }
    meta.push({
      nodeId: entry.nodeId,
      nodeName: entry.nodeName,
      format: entry.format,
      width: entry.width,
      height: entry.height,
      bytes: Buffer.from(entry.base64, "base64").length,
      ...(entry.format === "PDF"
        ? {
            note:
              "PDF cannot be rendered inline; use get_image with outputPath to save it to disk",
          }
        : {}),
    });
  }

  content.push({ type: "text", text: JSON.stringify(meta) });
  return content;
}

/**
 * Normalises the two screenshot payload shapes (`{ exports: [...] }` and a
 * single export object) into a validated list.
 * @param data - Payload from the plugin.
 * @returns The exports it contains.
 */
function collectScreenshotExports(data: unknown): ScreenshotExport[] {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid screenshot response from plugin");
  }
  const container = data as { exports?: unknown; base64?: unknown };
  const list = Array.isArray(container.exports)
    ? container.exports
    : typeof container.base64 === "string"
      ? [data]
      : null;
  if (!list || list.length === 0) {
    throw new Error("No screenshot export returned by plugin");
  }
  return list.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as { base64?: unknown }).base64 !== "string" ||
      typeof (entry as { nodeId?: unknown }).nodeId !== "string"
    ) {
      throw new Error("Malformed screenshot export payload");
    }
    const e = entry as {
      nodeId: string;
      nodeName?: string;
      format?: string;
      base64: string;
      width?: number;
      height?: number;
    };
    return {
      nodeId: e.nodeId,
      nodeName: typeof e.nodeName === "string" ? e.nodeName : e.nodeId,
      format: (e.format ?? "PNG") as ExportFormat,
      base64: e.base64,
      width: typeof e.width === "number" ? e.width : 0,
      height: typeof e.height === "number" ? e.height : 0,
    };
  });
}

async function saveScreenshotItemToFile(
  sender: ScreenshotSender,
  item: SaveScreenshotItemInput,
  index: number,
  workspaceRoot: string,
  defaultFormat?: ExportFormat,
  defaultScale?: number
): Promise<SaveScreenshotItemResult> {
  let resolvedOutputPath = item.outputPath;

  try {
    resolvedOutputPath = resolveAndValidateOutputPath(
      item.outputPath,
      workspaceRoot
    );
    const inferredFormat = inferFormatFromPath(resolvedOutputPath);
    const resolvedFormat = resolveExportFormat(
      item.format ?? defaultFormat,
      inferredFormat
    );
    const resolvedScale = resolveScale(item.scale, defaultScale);

    const params: Record<string, unknown> = {
      format: wireFormatFor(resolvedFormat),
    };
    if (resolvedScale !== undefined) {
      params.scale = resolvedScale;
    }

    const resp = await sender.sendWithParams(
      "get_screenshot",
      [item.nodeId],
      params
    );
    if (resp.error) {
      throw new Error(resp.error);
    }

    const screenshotExport = getSingleScreenshotExport(resp.data);
    const bytesWritten = await writeExportToFile(
      screenshotExport.base64,
      resolvedOutputPath,
      resolvedFormat
    );

    return {
      index,
      nodeId: screenshotExport.nodeId,
      nodeName: screenshotExport.nodeName,
      outputPath: resolvedOutputPath,
      format: resolvedFormat,
      width: screenshotExport.width,
      height: screenshotExport.height,
      bytesWritten,
      success: true,
    };
  } catch (err) {
    return {
      index,
      nodeId: item.nodeId,
      outputPath: resolvedOutputPath,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function writeBase64ToFile(
  base64: string,
  outputPath: string
): Promise<number> {
  const bytes = Buffer.from(base64, "base64");
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await writeFile(outputPath, bytes, { flag: "wx" });
  } catch (err) {
    if (isNodeError(err) && err.code === "EEXIST") {
      throw new Error(`File already exists at outputPath: ${outputPath}`);
    }
    throw err;
  }
  return bytes.length;
}

/**
 * Writes an export to disk, re-encoding to WEBP when that format was asked for.
 *
 * The bytes the plugin returned are PNG for a WEBP request, so the caller's
 * format — not the payload's — decides both the encoding and the extension.
 * @param base64 - Bytes returned by the plugin.
 * @param outputPath - Destination file path.
 * @param format - Format the caller asked for.
 * @returns Number of bytes written.
 */
async function writeExportToFile(
  base64: string,
  outputPath: string,
  format: ExportFormat
): Promise<number> {
  if (format !== "WEBP") {
    return writeBase64ToFile(base64, outputPath);
  }
  const webp = await encodeWebp(Buffer.from(base64, "base64"));
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await writeFile(outputPath, webp, { flag: "wx" });
  } catch (err) {
    if (isNodeError(err) && err.code === "EEXIST") {
      throw new Error(`File already exists at outputPath: ${outputPath}`);
    }
    throw err;
  }
  return webp.length;
}

function resolveScale(
  itemScale?: number,
  defaultScale?: number
): number | undefined {
  const resolvedScale = itemScale ?? defaultScale;
  if (resolvedScale === undefined || resolvedScale <= 0) {
    return undefined;
  }
  return resolvedScale;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error;
}
