import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Node } from "./node.js";
import { Follower } from "./follower.js";
import {
  createFrameInput,
  createImageInput,
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

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type ExportFormat = "PNG" | "SVG" | "JPG" | "PDF";

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
    "Get a specific Figma node by ID. Must use colon format, e.g. '4029:12345', never use hyphens. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_node.shape,
    async ({ nodeId, fileKey, includeHidden, includeImageData }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (includeHidden) params.includeHidden = true;
      if (includeImageData) params.includeImageData = true;
      return renderResponse(() =>
        node.sendWithParams("get_node", [nodeId], params, fileKey)
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
    "get_variable_defs",
    "Get all local variable definitions including variable collections, modes, and variable values. Variables are Figma's system for design tokens (colors, numbers, strings, booleans). When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_variable_defs.shape,
    async ({ fileKey }): Promise<ToolResult> => {
      return renderResponse(() => node.send("get_variable_defs", undefined, fileKey));
    }
  );

  server.tool(
    "get_screenshot",
    "Export a screenshot of the selected nodes or specific nodes by ID. Returns base64-encoded image data. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_screenshot.shape,
    async ({ nodeIds, format, scale, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (format) params.format = format;
      if (scale !== undefined && scale > 0) params.scale = scale;
      return renderResponse(() =>
        node.sendWithParams("get_screenshot", nodeIds, params, fileKey)
      );
    }
  );

  server.tool(
    "get_image",
    "Export a specific node as an image. Set backgroundOnly to export only the background fill of a frame without its children. If outputPath is provided, saves the image to disk instead of returning base64. When multiple files are connected, specify fileKey.",
    toolInputSchemas.get_image.shape,
    async ({ nodeId, format, scale, backgroundOnly, outputPath, fileKey }): Promise<ToolResult> => {
      const params: Record<string, unknown> = {};
      if (format) params.format = format;
      if (scale !== undefined && scale > 0) params.scale = scale;
      if (backgroundOnly) params.backgroundOnly = true;

      const resp = await node.sendWithParams("get_image", [nodeId], params, fileKey);
      if (resp.error) {
        return { content: [{ type: "text", text: resp.error }], isError: true };
      }

      const data = resp.data as { base64?: string; nodeId: string; nodeName: string; format: string; scale: number; width: number; height: number };

      if (outputPath && data.base64) {
        try {
          const resolvedPath = resolveAndValidateOutputPath(outputPath, process.cwd());
          const bytesWritten = await writeBase64ToFile(data.base64, resolvedPath);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                nodeId: data.nodeId,
                nodeName: data.nodeName,
                format: data.format,
                scale: data.scale,
                width: data.width,
                height: data.height,
                outputPath: resolvedPath,
                bytesWritten,
              }),
            }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
            isError: true,
          };
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
      };
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
    const resp = await fetch(source);
    if (!resp.ok) {
      throw new Error(`Failed to fetch image: ${resp.status} ${resp.statusText}`);
    }
    const bytes = Buffer.from(await resp.arrayBuffer());
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
  return bytes.toString("base64");
}

function inferFormatFromPath(outputPath: string): ExportFormat | null {
  const ext = path.extname(outputPath).toLowerCase();
  switch (ext) {
    case ".png":
      return "PNG";
    case ".svg":
      return "SVG";
    case ".jpg":
    case ".jpeg":
      return "JPG";
    case ".pdf":
      return "PDF";
    default:
      return null;
  }
}

function resolveExportFormat(
  format: ExportFormat | undefined,
  inferredFormat: ExportFormat | null
): ExportFormat {
  if (format && inferredFormat && format !== inferredFormat) {
    throw new Error(
      `format ${format} conflicts with outputPath extension (${inferredFormat})`
    );
  }
  return format ?? inferredFormat ?? "PNG";
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

    const params: Record<string, unknown> = { format: resolvedFormat };
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
    const bytesWritten = await writeBase64ToFile(
      screenshotExport.base64,
      resolvedOutputPath
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
