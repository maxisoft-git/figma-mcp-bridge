import type { ServerRequest, PluginResponse } from "../types";
import { parseHexColor } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const name = typeof params.name === "string" ? params.name : "";
  const paints = Array.isArray(params.paints) ? params.paints : [];

  if (!name) {
    throw new Error("name is required for create_paint_style");
  }
  if (paints.length === 0) {
    throw new Error("paints array is required for create_paint_style");
  }

  const style = figma.createPaintStyle();
  style.name = name;

  const figmaPaints: Paint[] = paints.map((paint: unknown) => {
    const p = paint as Record<string, unknown>;
    if (p.type === "SOLID" && typeof p.color === "string") {
      return {
        type: "SOLID",
        color: parseHexColor(p.color),
        opacity: typeof p.opacity === "number" ? p.opacity : 1,
      } as Paint;
    }
    if (
      p.type === "GRADIENT_LINEAR" ||
      p.type === "GRADIENT_RADIAL" ||
      p.type === "GRADIENT_ANGULAR" ||
      p.type === "GRADIENT_DIAMOND"
    ) {
      return {
        type: p.type,
        gradientStops: Array.isArray(p.gradientStops)
          ? (p.gradientStops as Array<Record<string, unknown>>).map((stop) => ({
              color: parseHexColor(stop.color as string),
              position: stop.position as number,
            }))
          : [],
        gradientTransform: (p.gradientTransform as number[][]) ?? [
          [1, 0, 0],
          [0, 1, 0],
        ],
        opacity: typeof p.opacity === "number" ? p.opacity : 1,
      } as Paint;
    }
    throw new Error(`Unsupported paint type: ${p.type}`);
  });

  style.paints = figmaPaints;

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      styleId: style.id,
      name: style.name,
    },
  };
}