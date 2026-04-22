import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById, parseHexColor } from "../utils";
import { createError, PluginErrorCode } from "../errors";

type OverrideInput = {
  targetNodeId?: string;
  targetNodeName?: string;
  field: string;
  value: unknown;
};

function findOverrideTarget(instance: InstanceNode, override: OverrideInput) {
  if (override.targetNodeId) {
    const found = figma.getNodeById(override.targetNodeId);
    if (!found) throw createError(PluginErrorCode.NODE_NOT_FOUND, `Override target not found: ${override.targetNodeId}`);
    return found;
  }

  if (override.targetNodeName) {
    const found = instance.findOne((n) => n.name === override.targetNodeName);
    if (!found) throw createError(PluginErrorCode.NODE_NOT_FOUND, `Override target by name not found: ${override.targetNodeName}`);
    return found;
  }

  throw createError(PluginErrorCode.VALIDATION_ERROR, "targetNodeId or targetNodeName is required for each override");
}

async function applyOverride(
  instance: InstanceNode,
  override: OverrideInput
): Promise<{ field: string; applied: boolean; error?: ReturnType<typeof createError> }> {
  try {
    const target = findOverrideTarget(instance, override);
    const { field, value } = override;

    switch (field) {
      case "characters": {
        if (target.type !== "TEXT") {
          return { field, applied: false, error: createError(PluginErrorCode.UNSUPPORTED_OPERATION, "Target is not a text node") };
        }
        const textNode = target as TextNode;
        if (typeof textNode.fontName !== "symbol") {
          await figma.loadFontAsync(textNode.fontName);
        }
        textNode.characters = String(value);
        return { field, applied: true };
      }

      case "fills": {
        if (!("fills" in target)) {
          return { field, applied: false, error: createError(PluginErrorCode.UNSUPPORTED_OPERATION, "Target does not support fills") };
        }
        const fills = (target as SceneNode & { fills: Paint[] }).fills;
        if (typeof value === "string") {
          fills.splice(0, fills.length, { type: "SOLID", color: parseHexColor(value), opacity: 1 });
          return { field, applied: true };
        }
        if (Array.isArray(value)) {
          fills.splice(0, fills.length, ...(value as Paint[]));
          return { field, applied: true };
        }
        return { field, applied: false, error: createError(PluginErrorCode.VALIDATION_ERROR, "fills value must be a hex string or paint array") };
      }

      case "strokes": {
        if (!("strokes" in target)) {
          return { field, applied: false, error: createError(PluginErrorCode.UNSUPPORTED_OPERATION, "Target does not support strokes") };
        }
        const strokes = (target as SceneNode & { strokes: Paint[] }).strokes;
        if (typeof value === "string") {
          strokes.splice(0, strokes.length, { type: "SOLID", color: parseHexColor(value), opacity: 1 });
          return { field, applied: true };
        }
        if (Array.isArray(value)) {
          strokes.splice(0, strokes.length, ...(value as Paint[]));
          return { field, applied: true };
        }
        return { field, applied: false, error: createError(PluginErrorCode.VALIDATION_ERROR, "strokes value must be a hex string or paint array") };
      }

      case "opacity": {
        if (!("opacity" in target)) {
          return { field, applied: false, error: createError(PluginErrorCode.UNSUPPORTED_OPERATION, "Target does not support opacity") };
        }
        (target as SceneNode & { opacity: number }).opacity = Number(value);
        return { field, applied: true };
      }

      case "visible": {
        if (!("visible" in target)) {
          return { field, applied: false, error: createError(PluginErrorCode.UNSUPPORTED_OPERATION, "Target does not support visibility") };
        }
        (target as SceneNode & { visible: boolean }).visible = Boolean(value);
        return { field, applied: true };
      }

      case "name": {
        target.name = String(value);
        return { field, applied: true };
      }

      case "fontSize": {
        if (target.type !== "TEXT") {
          return { field, applied: false, error: createError(PluginErrorCode.UNSUPPORTED_OPERATION, "Target is not a text node") };
        }
        const textNode = target as TextNode;
        if (typeof textNode.fontName !== "symbol") {
          await figma.loadFontAsync(textNode.fontName);
        }
        textNode.fontSize = Number(value);
        return { field, applied: true };
      }

      case "fontFamily": {
        if (target.type !== "TEXT") {
          return { field, applied: false, error: createError(PluginErrorCode.UNSUPPORTED_OPERATION, "Target is not a text node") };
        }
        const textNode = target as TextNode;
        const fontName = { family: String(value), style: textNode.fontName && typeof textNode.fontName !== "symbol" ? textNode.fontName.style : "Regular" };
        await figma.loadFontAsync(fontName);
        textNode.fontName = fontName;
        return { field, applied: true };
      }

      case "fill": {
        if (!("fills" in target)) {
          return { field, applied: false, error: createError(PluginErrorCode.UNSUPPORTED_OPERATION, "Target does not support fills") };
        }
        const textNode = target as TextNode;
        if (typeof value === "string") {
          textNode.fills = [{ type: "SOLID", color: parseHexColor(value), opacity: 1 }];
          return { field, applied: true };
        }
        return { field, applied: false, error: createError(PluginErrorCode.VALIDATION_ERROR, "fill value must be a hex string") };
      }

      default:
        return { field, applied: false, error: createError(PluginErrorCode.VALIDATION_ERROR, `Unknown override field: ${field}`) };
    }
  } catch (err) {
    if ((err as { code?: string }).code) {
      return { field: override.field, applied: false, error: err as ReturnType<typeof createError> };
    }
    return {
      field: override.field,
      applied: false,
      error: createError(PluginErrorCode.OPERATION_FAILED, err instanceof Error ? err.message : String(err)),
    };
  }
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw createError(PluginErrorCode.VALIDATION_ERROR, "nodeIds is required for set_instance_properties");
  }

  const params = request.params ?? {};
  const overrides = params.overrides;

  if (!Array.isArray(overrides) || overrides.length === 0) {
    throw createError(PluginErrorCode.VALIDATION_ERROR, "overrides array is required for set_instance_properties");
  }

  const node = await getSceneNodeById(nodeId);
  if (node.type !== "INSTANCE") {
    throw createError(PluginErrorCode.UNSUPPORTED_OPERATION, `Node is not a component instance: ${nodeId}`);
  }

  const results = await Promise.all(
    (overrides as OverrideInput[]).map((o) => applyOverride(node, o))
  );

  const applied = results.filter((r) => r.applied).length;
  const failed = results.filter((r) => !r.applied);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      total: results.length,
      applied,
      failed: failed.length,
      results,
    },
  };
}