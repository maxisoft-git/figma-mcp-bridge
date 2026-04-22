import type { ServerRequest, PluginResponse } from "../types";
import { parseHexColor, getSceneNodeById } from "../utils";

type BatchOperation = {
  type: string;
  nodeId?: string;
  nodeIds?: string[];
  params?: Record<string, unknown>;
  ref?: string;
};

type CreatedRef = {
  ref: string;
  nodeId: string;
  nodeName: string;
};

type OperationResult = {
  type: string;
  success: boolean;
  nodeId?: string;
  nodeName?: string;
  data?: unknown;
  error?: string;
};

function isTmpRef(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("tmp:");
}

function resolveRefs(
  value: unknown,
  refs: Map<string, CreatedRef>
): unknown {
  if (typeof value === "string" && isTmpRef(value)) {
    const resolved = refs.get(value);
    if (!resolved) {
      throw new Error(`Unresolved tmp ref: ${value}`);
    }
    return resolved.nodeId;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveRefs(item, refs));
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveRefs(v, refs);
    }
    return result;
  }
  return value;
}

async function executeCreateFrame(
  params: Record<string, unknown>,
  refs: Map<string, CreatedRef>
): Promise<{ nodeId: string; nodeName: string; data: unknown }> {
  const resolved = resolveRefs(params, refs) as Record<string, unknown>;
  const frame = figma.createFrame();

  if (resolved.name) frame.name = String(resolved.name);
  const width = typeof resolved.width === "number" ? resolved.width : 100;
  const height = typeof resolved.height === "number" ? resolved.height : 100;
  frame.resize(width, height);

  if (resolved.fillHex) {
    const fillOpacity = typeof resolved.fillOpacity === "number" ? resolved.fillOpacity : 1;
    frame.fills = [{ type: "SOLID", color: parseHexColor(resolved.fillHex as string), opacity: fillOpacity }];
  }

  if (resolved.parentId && typeof resolved.parentId === "string") {
    const parent = await figma.getNodeByIdAsync(resolved.parentId as string);
    if (parent && "appendChild" in parent) {
      (parent as BaseNode & { appendChild: (n: SceneNode) => void }).appendChild(frame);
    }
  }

  if (typeof resolved.x === "number") frame.x = resolved.x;
  if (typeof resolved.y === "number") frame.y = resolved.y;

  return {
    nodeId: frame.id,
    nodeName: frame.name,
    data: { nodeId: frame.id, nodeName: frame.name, parentId: frame.parent?.id },
  };
}

async function executeCreateText(
  params: Record<string, unknown>,
  refs: Map<string, CreatedRef>
): Promise<{ nodeId: string; nodeName: string; data: unknown }> {
  const resolved = resolveRefs(params, refs) as Record<string, unknown>;
  const text = figma.createText();

  if (resolved.name) text.name = String(resolved.name);

  if (resolved.characters && typeof resolved.characters === "string") {
    if (typeof text.fontName !== "symbol") {
      await figma.loadFontAsync(text.fontName);
    }
    text.characters = resolved.characters;
  }

  if (resolved.fillHex) {
    const fillOpacity = typeof resolved.fillOpacity === "number" ? resolved.fillOpacity : 1;
    text.fills = [{ type: "SOLID", color: parseHexColor(resolved.fillHex as string), opacity: fillOpacity }];
  }

  if (resolved.fontSize && typeof resolved.fontSize === "number") {
    if (typeof text.fontName !== "symbol") {
      await figma.loadFontAsync(text.fontName);
    }
    text.fontSize = resolved.fontSize;
  }

  if (resolved.parentId && typeof resolved.parentId === "string") {
    const parent = await figma.getNodeByIdAsync(resolved.parentId as string);
    if (parent && "appendChild" in parent) {
      (parent as BaseNode & { appendChild: (n: SceneNode) => void }).appendChild(text);
    }
  }

  if (typeof resolved.x === "number") text.x = resolved.x;
  if (typeof resolved.y === "number") text.y = resolved.y;

  return {
    nodeId: text.id,
    nodeName: text.name,
    data: { nodeId: text.id, nodeName: text.name },
  };
}

async function executeCreateShape(
  params: Record<string, unknown>,
  refs: Map<string, CreatedRef>
): Promise<{ nodeId: string; nodeName: string; data: unknown }> {
  const resolved = resolveRefs(params, refs) as Record<string, unknown>;
  const shapeType = (resolved.shapeType as string) ?? "RECTANGLE";
  const shape = figma.createShapeWithText();
  shape.shapeType = shapeType as "RECTANGLE" | "ELLIPSE" | "LINE";

  if (resolved.name) shape.name = String(resolved.name);

  const width = typeof resolved.width === "number" ? resolved.width : 100;
  const height = typeof resolved.height === "number" ? resolved.height : 100;
  shape.resize(width, height);

  if (resolved.fillHex) {
    const fillOpacity = typeof resolved.fillOpacity === "number" ? resolved.fillOpacity : 1;
    shape.fills = [{ type: "SOLID", color: parseHexColor(resolved.fillHex as string), opacity: fillOpacity }];
  }

  if (resolved.parentId && typeof resolved.parentId === "string") {
    const parent = await figma.getNodeByIdAsync(resolved.parentId as string);
    if (parent && "appendChild" in parent) {
      (parent as BaseNode & { appendChild: (n: SceneNode) => void }).appendChild(shape);
    }
  }

  if (typeof resolved.x === "number") shape.x = resolved.x;
  if (typeof resolved.y === "number") shape.y = resolved.y;

  return {
    nodeId: shape.id,
    nodeName: shape.name,
    data: { nodeId: shape.id, nodeName: shape.name },
  };
}

async function executeSetPosition(
  nodeId: string,
  params: Record<string, unknown>,
  refs: Map<string, CreatedRef>
): Promise<{ nodeId: string; data: unknown }> {
  const resolved = resolveRefs(params, refs) as Record<string, unknown>;
  const node = await getSceneNodeById(nodeId);

  if (typeof resolved.x === "number") node.x = resolved.x;
  if (typeof resolved.y === "number") node.y = resolved.y;

  return { nodeId: node.id, data: { x: node.x, y: node.y } };
}

async function executeSetSize(
  nodeId: string,
  params: Record<string, unknown>,
  refs: Map<string, CreatedRef>
): Promise<{ nodeId: string; data: unknown }> {
  const resolved = resolveRefs(params, refs) as Record<string, unknown>;
  const node = await getSceneNodeById(nodeId);

  if (!("resize" in node)) {
    throw new Error(`Node does not support resize: ${nodeId}`);
  }

  const width = typeof resolved.width === "number" ? resolved.width : node.width;
  const height = typeof resolved.height === "number" ? resolved.height : node.height;
  node.resize(width, height);

  return { nodeId: node.id, data: { width: node.width, height: node.height } };
}

async function executeSetFills(
  nodeId: string,
  params: Record<string, unknown>,
  refs: Map<string, CreatedRef>
): Promise<{ nodeId: string; data: unknown }> {
  const resolved = resolveRefs(params, refs) as Record<string, unknown>;
  const node = await getSceneNodeById(nodeId);

  if (!("fills" in node)) {
    throw new Error(`Node does not support fills: ${nodeId}`);
  }

  if (resolved.fillHex && typeof resolved.fillHex === "string") {
    const fillOpacity = typeof resolved.fillOpacity === "number" ? resolved.fillOpacity : 1;
    (node as SceneNode & { fills: Paint[] }).fills = [
      { type: "SOLID", color: parseHexColor(resolved.fillHex), opacity: fillOpacity }
    ];
  } else if (Array.isArray(resolved.fills)) {
    (node as SceneNode & { fills: Paint[] }).fills = resolved.fills as Paint[];
  }

  return { nodeId: node.id, data: { fills: (node as SceneNode & { fills: unknown }).fills } };
}

async function executeSetStrokes(
  nodeId: string,
  params: Record<string, unknown>,
  refs: Map<string, CreatedRef>
): Promise<{ nodeId: string; data: unknown }> {
  const resolved = resolveRefs(params, refs) as Record<string, unknown>;
  const node = await getSceneNodeById(nodeId);

  if (!("strokes" in node)) {
    throw new Error(`Node does not support strokes: ${nodeId}`);
  }

  if (resolved.strokeHex && typeof resolved.strokeHex === "string") {
    const strokeOpacity = typeof resolved.strokeOpacity === "number" ? resolved.strokeOpacity : 1;
    (node as SceneNode & { strokes: Paint[] }).strokes = [
      { type: "SOLID", color: parseHexColor(resolved.strokeHex), opacity: strokeOpacity }
    ];
  } else if (Array.isArray(resolved.strokes)) {
    (node as SceneNode & { strokes: Paint[] }).strokes = resolved.strokes as Paint[];
  }

  if (typeof resolved.strokeWeight === "number" && "strokeWeight" in node) {
    (node as SceneNode & { strokeWeight: number }).strokeWeight = resolved.strokeWeight;
  }

  return { nodeId: node.id, data: { strokes: (node as SceneNode & { strokes: unknown }).strokes } };
}

async function executeSetCornerRadius(
  nodeId: string,
  params: Record<string, unknown>,
  refs: Map<string, CreatedRef>
): Promise<{ nodeId: string; data: unknown }> {
  const resolved = resolveRefs(params, refs) as Record<string, unknown>;
  const node = await getSceneNodeById(nodeId);

  if (!("cornerRadius" in node)) {
    throw new Error(`Node does not support cornerRadius: ${nodeId}`);
  }

  const radius = typeof resolved.cornerRadius === "number" ? resolved.cornerRadius : 0;
  (node as SceneNode & { cornerRadius: number }).cornerRadius = radius;

  return { nodeId: node.id, data: { cornerRadius: radius } };
}

async function executeSetTextContent(
  nodeId: string,
  params: Record<string, unknown>,
  refs: Map<string, CreatedRef>
): Promise<{ nodeId: string; data: unknown }> {
  const resolved = resolveRefs(params, refs) as Record<string, unknown>;
  const node = await getSceneNodeById(nodeId);

  if (node.type !== "TEXT") {
    throw new Error(`Node is not a TEXT node: ${nodeId}`);
  }

  const textNode = node as TextNode;
  if (typeof textNode.fontName !== "symbol") {
    await figma.loadFontAsync(textNode.fontName);
  }

  const characters = resolved.characters !== undefined ? String(resolved.characters) : "";
  textNode.characters = characters;

  return { nodeId: node.id, data: { characters: textNode.characters } };
}

async function executeSetTextStyle(
  nodeId: string,
  params: Record<string, unknown>,
  refs: Map<string, CreatedRef>
): Promise<{ nodeId: string; data: unknown }> {
  const resolved = resolveRefs(params, refs) as Record<string, unknown>;
  const node = await getSceneNodeById(nodeId);

  if (node.type !== "TEXT") {
    throw new Error(`Node is not a TEXT node: ${nodeId}`);
  }

  const textNode = node as TextNode;

  if (resolved.fontFamily || resolved.fontStyle) {
    const family = resolved.fontFamily ? String(resolved.fontFamily) : (
      typeof textNode.fontName !== "symbol" ? textNode.fontName.family : "Inter"
    );
    const style = resolved.fontStyle ? String(resolved.fontStyle) : (
      typeof textNode.fontName !== "symbol" ? textNode.fontName.style : "Regular"
    );
    await figma.loadFontAsync({ family, style });
    textNode.fontName = { family, style };
  }

  if (typeof resolved.fontSize === "number") {
    if (typeof textNode.fontName !== "symbol") {
      await figma.loadFontAsync(textNode.fontName);
    }
    textNode.fontSize = resolved.fontSize;
  }

  if (resolved.textAlignHorizontal) {
    textNode.textAlignHorizontal = resolved.textAlignHorizontal as "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  }

  if (resolved.lineHeightPx && typeof resolved.lineHeightPx === "number") {
    if (typeof textNode.fontName !== "symbol") {
      await figma.loadFontAsync(textNode.fontName);
    }
    textNode.lineHeight = { value: resolved.lineHeightPx, unit: "PIXELS" };
  }

  return { nodeId: node.id, data: { fontName: textNode.fontName, fontSize: textNode.fontSize } };
}

async function executeAppendChildren(
  parentId: string,
  nodeIds: string[] | undefined,
  refs: Map<string, CreatedRef>
): Promise<{ nodeId: string; data: unknown }> {
  if (!nodeIds || nodeIds.length === 0) {
    throw new Error("nodeIds is required for append_children");
  }

  const parent = await figma.getNodeByIdAsync(parentId);
  if (!parent || !("appendChild" in parent)) {
    throw new Error(`Parent does not support children: ${parentId}`);
  }

  const results: { nodeId: string; name: string }[] = [];
  for (const childId of nodeIds) {
    const resolvedId = resolveRefs(childId, refs) as string;
    const child = await figma.getNodeByIdAsync(resolvedId);
    if (child && "appendChild" in parent) {
      (parent as BaseNode & { appendChild: (n: SceneNode) => void }).appendChild(child as SceneNode);
      results.push({ nodeId: child.id, name: child.name });
    }
  }

  return { nodeId: parentId, data: { appended: results } };
}

async function executeDeleteNode(
  nodeId: string
): Promise<{ nodeId: string; data: unknown }> {
  const node = await getSceneNodeById(nodeId);
  const name = node.name;
  node.remove();
  return { nodeId: nodeId, data: { deleted: name } };
}

async function executeFindNodes(
  params: Record<string, unknown>
): Promise<{ data: unknown }> {
  const nameFilter = params.name as string | undefined;
  const typeFilter = params.type as string | undefined;

  const matches = figma.currentPage.findAll((n) => {
    if (nameFilter && !n.name.includes(nameFilter)) return false;
    if (typeFilter && n.type !== typeFilter) return false;
    return true;
  });

  return {
    data: matches.slice(0, 100).map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
    })),
  };
}

async function executeOperation(
  op: BatchOperation,
  refs: Map<string, CreatedRef>
): Promise<OperationResult> {
  try {
    const resolvedNodeId = op.nodeId ? resolveRefs(op.nodeId, refs) as string : undefined;
    const resolvedNodeIds = op.nodeIds ? resolveRefs(op.nodeIds, refs) as string[] : undefined;
    const resolvedParams = op.params ? resolveRefs(op.params, refs) as Record<string, unknown> : {};

    switch (op.type) {
      case "create_frame": {
        const result = await executeCreateFrame(resolvedParams, refs);
        if (op.ref) {
          refs.set(op.ref, { ref: op.ref, nodeId: result.nodeId, nodeName: result.nodeName });
        }
        return { type: op.type, success: true, nodeId: result.nodeId, nodeName: result.nodeName, data: result.data };
      }
      case "create_text": {
        const result = await executeCreateText(resolvedParams, refs);
        if (op.ref) {
          refs.set(op.ref, { ref: op.ref, nodeId: result.nodeId, nodeName: result.nodeName });
        }
        return { type: op.type, success: true, nodeId: result.nodeId, nodeName: result.nodeName, data: result.data };
      }
      case "create_rectangle":
      case "create_shape": {
        const result = await executeCreateShape(resolvedParams, refs);
        if (op.ref) {
          refs.set(op.ref, { ref: op.ref, nodeId: result.nodeId, nodeName: result.nodeName });
        }
        return { type: op.type, success: true, nodeId: result.nodeId, nodeName: result.nodeName, data: result.data };
      }
      case "set_position": {
        if (!resolvedNodeId) throw new Error("nodeId is required for set_position");
        const result = await executeSetPosition(resolvedNodeId, resolvedParams, refs);
        return { type: op.type, success: true, nodeId: result.nodeId, data: result.data };
      }
      case "set_size": {
        if (!resolvedNodeId) throw new Error("nodeId is required for set_size");
        const result = await executeSetSize(resolvedNodeId, resolvedParams, refs);
        return { type: op.type, success: true, nodeId: result.nodeId, data: result.data };
      }
      case "set_fills": {
        if (!resolvedNodeId) throw new Error("nodeId is required for set_fills");
        const result = await executeSetFills(resolvedNodeId, resolvedParams, refs);
        return { type: op.type, success: true, nodeId: result.nodeId, data: result.data };
      }
      case "set_strokes": {
        if (!resolvedNodeId) throw new Error("nodeId is required for set_strokes");
        const result = await executeSetStrokes(resolvedNodeId, resolvedParams, refs);
        return { type: op.type, success: true, nodeId: result.nodeId, data: result.data };
      }
      case "set_corner_radius": {
        if (!resolvedNodeId) throw new Error("nodeId is required for set_corner_radius");
        const result = await executeSetCornerRadius(resolvedNodeId, resolvedParams, refs);
        return { type: op.type, success: true, nodeId: result.nodeId, data: result.data };
      }
      case "set_text_content": {
        if (!resolvedNodeId) throw new Error("nodeId is required for set_text_content");
        const result = await executeSetTextContent(resolvedNodeId, resolvedParams, refs);
        return { type: op.type, success: true, nodeId: result.nodeId, data: result.data };
      }
      case "set_text_style": {
        if (!resolvedNodeId) throw new Error("nodeId is required for set_text_style");
        const result = await executeSetTextStyle(resolvedNodeId, resolvedParams, refs);
        return { type: op.type, success: true, nodeId: result.nodeId, data: result.data };
      }
      case "append_children": {
        if (!resolvedNodeId) throw new Error("parentId is required for append_children");
        const result = await executeAppendChildren(resolvedNodeId, resolvedNodeIds, refs);
        return { type: op.type, success: true, nodeId: result.nodeId, data: result.data };
      }
      case "delete_node": {
        if (!resolvedNodeId) throw new Error("nodeId is required for delete_node");
        const result = await executeDeleteNode(resolvedNodeId);
        return { type: op.type, success: true, nodeId: result.nodeId, data: result.data };
      }
      case "find_nodes": {
        const result = await executeFindNodes(resolvedParams);
        return { type: op.type, success: true, data: result.data };
      }
      default:
        return { type: op.type, success: false, error: `Unknown operation type: ${op.type}` };
    }
  } catch (err) {
    return {
      type: op.type,
      success: false,
      nodeId: op.nodeId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const operations = params.operations;

  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("operations array is required for batch_mutation");
  }

  if (operations.length > 100) {
    throw new Error("batch_mutation supports maximum 100 operations");
  }

  const refs = new Map<string, CreatedRef>();
  const results: OperationResult[] = [];
  let failedStepIndex: number | undefined;

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i] as BatchOperation;
    const result = await executeOperation(op, refs);
    results.push(result);

    if (!result.success && failedStepIndex === undefined) {
      failedStepIndex = i;
      break;
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const createdRefs = [...refs.entries()].map(([, v]) => v);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      executedCount: succeeded,
      failedCount: failed,
      failedStepIndex,
      createdRefs,
      results,
    },
  };
}
