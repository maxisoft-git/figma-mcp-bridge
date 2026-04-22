import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById, parseHexColor } from "../utils";

type GradientStopInput = {
  color: string;
  opacity?: number;
  position: number;
};

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw new Error("nodeIds is required for set_gradient_fill");
  }

  const node = await getSceneNodeById(nodeId);
  const params = request.params ?? {};

  if (!("fills" in node)) {
    throw new Error(`Node does not support fills: ${nodeId}`);
  }

  const gradientType = params.gradientType as string;
  if (!["GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"].includes(gradientType)) {
    throw new Error("gradientType is required: GRADIENT_LINEAR, GRADIENT_RADIAL, GRADIENT_ANGULAR, GRADIENT_DIAMOND");
  }

  const rawStops = params.stops;
  if (!Array.isArray(rawStops) || rawStops.length < 2) {
    throw new Error("stops array with at least 2 entries is required");
  }

  const stops: ColorStop[] = (rawStops as GradientStopInput[]).map((s) => {
    const rgb = parseHexColor(s.color);
    return {
      color: { ...rgb, a: s.opacity ?? 1 },
      position: s.position,
    };
  });

  const defaultTransform: Transform = [
    [0, 1, 0],
    [0, 0, 0],
  ];

  const fill: GradientPaint = {
    type: gradientType as "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND",
    gradientStops: stops,
    gradientTransform: (params.transform as Transform) ?? defaultTransform,
    opacity: typeof params.opacity === "number" ? params.opacity : 1,
  };

  const currentFills = (node.fills as readonly Paint[]) ?? [];
  node.fills = [...currentFills, fill];

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      gradientType,
      stopsCount: stops.length,
    },
  };
}
