import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  if (!request.nodeIds || request.nodeIds.length < 2) {
    throw new Error("nodeIds must contain at least 2 nodes for get_measurements");
  }

  const nodes = await Promise.all(request.nodeIds.map((id) => getSceneNodeById(id)));

  const boxes = nodes.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.type,
    x: "x" in n ? (n.x as number) : 0,
    y: "y" in n ? (n.y as number) : 0,
    width: "width" in n ? (n.width as number) : 0,
    height: "height" in n ? (n.height as number) : 0,
  }));

  const measurements: Array<{
    from: string;
    to: string;
    horizontal: number;
    vertical: number;
    direction: string;
  }> = [];

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];

      const horizontal = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
      const vertical = Math.max(0, Math.max(a.y - (a.height + b.y) > 0 ? a.y - (b.y + b.height) : 0, b.y - (a.y + a.height) > 0 ? b.y - (a.y + a.height) : 0));

      let direction: string;
      if (horizontal === 0 && vertical === 0) {
        direction = "overlapping";
      } else if (horizontal > vertical) {
        direction = b.x > a.x ? "right" : "left";
      } else {
        direction = b.y > a.y ? "below" : "above";
      }

      measurements.push({
        from: a.id,
        to: b.id,
        horizontal: Math.round(horizontal * 100) / 100,
        vertical: Math.round(vertical * 100) / 100,
        direction,
      });
    }
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: { measurements },
  };
}
