import type { ServerRequest, PluginResponse } from "../types";
import { appendToParentIfProvided, positionNode } from "../utils";
import { addLayersToFrame } from "../../html-figma/figma";

type LayerTree = { type?: unknown; width?: unknown; height?: unknown; children?: unknown };

/** Count every node in an html-figma layer tree, for the partial-import warning. */
const countLayers = (layer: unknown): number => {
  if (!layer || typeof layer !== "object") return 0;
  const children = (layer as { children?: unknown }).children;
  let total = 1;
  if (Array.isArray(children)) {
    for (const child of children) total += countLayers(child);
  }
  return total;
};

/**
 * Renders an html-figma `htmlToFigma()` serialization as editable Figma nodes
 * inside a new wrapper frame (frames, text, rectangles, SVG vectors).
 */
export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const root = params.layers as LayerTree | undefined;
  if (!root || typeof root !== "object" || typeof root.type !== "string") {
    throw new Error(
      "layers (an html-figma LayerNode tree) is required for import_html_layers"
    );
  }

  const wrapper = figma.createFrame();
  wrapper.name =
    typeof params.name === "string" && params.name.length > 0 ? params.name : "imported layers";
  const rootWidth = typeof root.width === "number" ? root.width : 100;
  const rootHeight = typeof root.height === "number" ? root.height : 100;
  wrapper.resize(Math.max(rootWidth, 1), Math.max(rootHeight, 1));
  wrapper.fills = [];
  wrapper.clipsContent = true;
  // Same contract as the create_* tools: when parentId is given the wrapper is
  // appended into it and x/y are relative to that parent.
  await appendToParentIfProvided(wrapper, params.parentId);
  positionNode(wrapper, params.x, params.y);

  // html-figma catches per-layer render errors internally and keeps going, so a
  // failed layer would otherwise be silent. Count the tree up front and compare
  // with how many layers actually rendered.
  const expectedLayerCount = countLayers(root);

  let layerCount = 0;
  await addLayersToFrame([root as never], wrapper, () => {
    layerCount += 1;
  });

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: wrapper.id,
      nodeName: wrapper.name,
      parentId: wrapper.parent?.id,
      x: wrapper.x,
      y: wrapper.y,
      width: wrapper.width,
      height: wrapper.height,
      layerCount,
      expectedLayerCount,
      ...(layerCount < expectedLayerCount
        ? {
            warning: `Partial import: ${expectedLayerCount - layerCount} of ${expectedLayerCount} layers failed to render (see the plugin console for per-layer errors). Delete node ${wrapper.id} and retry if completeness matters.`,
          }
        : {}),
    },
  };
}
