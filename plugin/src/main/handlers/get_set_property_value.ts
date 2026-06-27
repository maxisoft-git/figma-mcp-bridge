import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface GetPropertyParams {
  nodeIds: string[];
  property: string;
  /** Optional: include bound variable id (default true). */
  includeVariable?: boolean;
}

interface SetPropertyParams {
  nodeIds: string[];
  property: string;
  /** Value: number, string, boolean, or {r,g,b,a} for fills. */
  value: number | string | boolean | { r: number; g: number; b: number; a?: number };
  /** When true, only return changes without writing. */
  dryRun?: boolean;
}

interface PropertyReadResult {
  nodeId: string;
  property: string;
  value: unknown;
  boundVariable?: string;
}

interface PropertyWriteResult {
  nodeId: string;
  property: string;
  from: unknown;
  to: unknown;
  applied: boolean;
}

function rgbToHex(c: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

function getPropertyValue(node: SceneNode, property: string): { value: unknown; boundVariable?: string } {
  switch (property) {
    case "name":
      return { value: node.name };
    case "x":
      return { value: (node as { x: number }).x };
    case "y":
      return { value: (node as { y: number }).y };
    case "width":
      return { value: (node as { width: number }).width };
    case "height":
      return { value: (node as { height: number }).height };
    case "rotation":
      return { value: (node as { rotation: number }).rotation };
    case "opacity":
      return { value: (node as { opacity: number }).opacity };
    case "visible":
      return { value: (node as { visible: boolean }).visible };
    case "cornerRadius": {
      const v = (node as { cornerRadius?: number }).cornerRadius;
      if (v === undefined) return { value: null };
      return { value: v };
    }
    case "paddingTop":
    case "paddingBottom":
    case "paddingLeft":
    case "paddingRight":
    case "itemSpacing":
    case "counterAxisSpacing":
      if (!("layoutMode" in node)) return { value: null };
      return { value: (node as unknown as Record<string, number>)[property] };
    case "characters":
      if (node.type === "TEXT") return { value: (node as TextNode).characters };
      return { value: null };
    case "fill": {
      if (!("fills" in node)) return { value: null };
      const fills = (node as GeometryMixin).fills;
      if (!Array.isArray(fills) || fills.length === 0) return { value: null };
      const first = fills[0]!;
      if (first.type === "SOLID") {
        const hex = rgbToHex(first.color);
        const bv = (first as { boundVariables?: { color?: { id: string } } }).boundVariables;
        return { value: hex, boundVariable: bv?.color?.id };
      }
      return { value: first.type };
    }
    case "fontSize":
      if (node.type === "TEXT") return { value: (node as TextNode).fontSize };
      return { value: null };
    case "fontName":
      if (node.type === "TEXT") {
        const f = (node as TextNode).fontName as FontName;
        return { value: { family: f.family, style: f.style } };
      }
      return { value: null };
    default:
      return { value: null };
  }
}

function setPropertyValue(
  node: SceneNode,
  property: string,
  value: number | string | boolean | { r: number; g: number; b: number; a?: number },
): { previous: unknown; applied: boolean } {
  try {
    switch (property) {
      case "name":
        node.name = String(value);
        return { previous: undefined, applied: true };
      case "x":
        (node as unknown as { x: number }).x = Number(value);
        return { previous: undefined, applied: true };
      case "y":
        (node as unknown as { y: number }).y = Number(value);
        return { previous: undefined, applied: true };
      case "width":
        if (!("resize" in node)) return { previous: undefined, applied: false };
        (node as { resize: (w: number, h: number) => void }).resize(Number(value), (node as { height: number }).height);
        return { previous: undefined, applied: true };
      case "height":
        if (!("resize" in node)) return { previous: undefined, applied: false };
        (node as { resize: (w: number, h: number) => void }).resize((node as { width: number }).width, Number(value));
        return { previous: undefined, applied: true };
      case "rotation":
        (node as unknown as { rotation: number }).rotation = Number(value);
        return { previous: undefined, applied: true };
      case "opacity":
        if (!("opacity" in node)) return { previous: undefined, applied: false };
        (node as BlendMixin).opacity = Number(value);
        return { previous: undefined, applied: true };
      case "visible":
        (node as unknown as { visible: boolean }).visible = Boolean(value);
        return { previous: undefined, applied: true };
      case "cornerRadius":
        if (!("cornerRadius" in node)) return { previous: undefined, applied: false };
        (node as unknown as { cornerRadius: number }).cornerRadius = Number(value);
        return { previous: undefined, applied: true };
      case "paddingTop":
      case "paddingBottom":
      case "paddingLeft":
      case "paddingRight":
      case "itemSpacing":
      case "counterAxisSpacing":
        if (!("layoutMode" in node)) return { previous: undefined, applied: false };
        (node as unknown as Record<string, number>)[property] = Number(value);
        return { previous: undefined, applied: true };
      case "characters":
        if (node.type !== "TEXT") return { previous: undefined, applied: false };
        (node as TextNode).characters = String(value);
        return { previous: undefined, applied: true };
      case "fill":
        if (!("fills" in node)) return { previous: undefined, applied: false };
        if (typeof value === "object" && value !== null && "r" in value) {
          const c = value as { r: number; g: number; b: number; a?: number };
          (node as GeometryMixin).fills = [{ type: "SOLID", color: { r: c.r, g: c.g, b: c.b }, opacity: c.a ?? 1 } as unknown as Paint];
        } else if (typeof value === "string") {
          const hex = value.replace("#", "");
          if (!/^[0-9a-fA-F]{6}$/.test(hex)) return { previous: undefined, applied: false };
          (node as GeometryMixin).fills = [{ type: "SOLID", color: { r: parseInt(hex.slice(0, 2), 16) / 255, g: parseInt(hex.slice(2, 4), 16) / 255, b: parseInt(hex.slice(4, 6), 16) / 255 } } as unknown as Paint];
        } else {
          return { previous: undefined, applied: false };
        }
        return { previous: undefined, applied: true };
      case "fontSize":
        if (node.type !== "TEXT") return { previous: undefined, applied: false };
        (node as TextNode).fontSize = Number(value);
        return { previous: undefined, applied: true };
      default:
        return { previous: undefined, applied: false };
    }
  } catch {
    return { previous: undefined, applied: false };
  }
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as GetPropertyParams & SetPropertyParams & { mode?: "get" | "set" };
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  if (!params.property) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "property is required" } };
  }
  const mode = params.mode ?? "get";
  const includeVar = params.includeVariable ?? true;

  if (mode === "get") {
    const out: PropertyReadResult[] = [];
    for (const id of params.nodeIds) {
      let node: SceneNode;
      try {
        node = await resolveNode(id);
      } catch (err) {
        return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
      }
      const r = getPropertyValue(node, params.property);
      const item: PropertyReadResult = { nodeId: node.id, property: params.property, value: r.value };
      if (r.boundVariable && includeVar) item.boundVariable = r.boundVariable;
      out.push(item);
    }
    return { type: request.type, requestId: request.requestId, data: { items: out } };
  }

  if (params.value === undefined) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "value is required for mode='set'" } };
  }
  const dryRun = params.dryRun ?? false;
  const out: PropertyWriteResult[] = [];
  for (const id of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(id);
    } catch (err) {
      return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
    }
    const before = getPropertyValue(node, params.property);
    const result = dryRun ? { previous: before.value, applied: false } : setPropertyValue(node, params.property, params.value);
    const after = dryRun ? before.value : getPropertyValue(node, params.property).value;
    out.push({ nodeId: node.id, property: params.property, from: before.value, to: after, applied: result.applied });
  }
  return { type: request.type, requestId: request.requestId, data: { items: out, dryRun } };
}
