import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";
import { getManifest } from "../utils/ds-manifest";
import { detectMime } from "../utils/dev-mode";

interface AnalyzeParams {
  nodeIds: string[];
  /** Optional manifest to compare against. */
  manifestId?: string;
  /** Max width of the rendered preview. Default 800. */
  maxWidth?: number;
}

interface Deviation {
  nodeId: string;
  property: "fill" | "spacing" | "radius" | "font";
  current: string;
  expected?: string;
  severity: "info" | "warning" | "error";
}

interface AnalyzeResult {
  previews: Array<{ nodeId: string; mime: string; bytes: number }>;
  deviations: Deviation[];
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as AnalyzeParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  const manifest = params.manifestId ? await getManifest(params.manifestId) : null;
  const maxWidth = params.maxWidth ?? 800;
  const result: AnalyzeResult = { previews: [], deviations: [] };

  for (const nodeId of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(nodeId);
    } catch (err) {
      return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
    }
    // Render a preview screenshot.
    try {
      const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
      result.previews.push({ nodeId, mime: detectMime(bytes), bytes: bytes.length });
    } catch {
      result.previews.push({ nodeId, mime: "image/png", bytes: 0 });
    }
    // Compare hardcoded values against the manifest.
    if (manifest) {
      walkForDeviations(node, (n, prop, value) => {
        if (prop === "fill" && "fills" in n) {
          const fills = (n as GeometryMixin).fills;
          if (Array.isArray(fills)) {
            for (const f of fills as readonly Paint[]) {
              if (f.type === "SOLID") {
                const hex = rgbToHex(f.color);
                if (!manifest.colors[hex.toLowerCase()]) {
                  result.deviations.push({
                    nodeId: n.id,
                    property: "fill",
                    current: hex,
                    expected: Object.keys(manifest.colors).join(", "),
                    severity: "warning",
                  });
                }
              }
            }
          }
        }
        if (prop === "radius" && (n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE")) {
          const f = n as FrameNode;
          if (typeof f.cornerRadius === "number" && f.cornerRadius > 0) {
            if (!manifest.radii[String(f.cornerRadius)]) {
              result.deviations.push({
                nodeId: n.id,
                property: "radius",
                current: String(f.cornerRadius),
                expected: Object.keys(manifest.radii).join(", "),
                severity: "info",
              });
            }
          }
        }
        if (prop === "spacing" && (n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE")) {
          const f = n as FrameNode;
          if (f.layoutMode && f.layoutMode !== "NONE") {
            for (const field of ["itemSpacing", "counterAxisSpacing", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"] as const) {
              const v = f[field] as number;
              if (v > 0 && !manifest.spacing[String(v)]) {
                result.deviations.push({
                  nodeId: n.id,
                  property: "spacing",
                  current: `${field}=${v}`,
                  expected: Object.keys(manifest.spacing).join(", "),
                  severity: "info",
                });
              }
            }
          }
        }
      });
    }
  }

  return { type: request.type, requestId: request.requestId, data: { ...result, manifestId: params.manifestId ?? null, maxWidth } };
}

function walkForDeviations(
  node: SceneNode,
  visit: (n: SceneNode, prop: "fill" | "radius" | "spacing", value: unknown) => void,
): void {
  visit(node, "fill", null);
  visit(node, "radius", null);
  visit(node, "spacing", null);
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) walkForDeviations(c as SceneNode, visit);
  }
}

function rgbToHex(c: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}
