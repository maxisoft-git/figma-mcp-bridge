import type { ServerRequest, PluginResponse } from "../types";
import { setSolidFill, appendToParentIfProvided, positionNode } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const frame = figma.createFrame();

  if (typeof params.name === "string") {
    frame.name = params.name;
  }

  const width = typeof params.width === "number" ? params.width : 100;
  const height = typeof params.height === "number" ? params.height : 100;
  frame.resize(width, height);

  if (typeof params.fillHex === "string") {
    const fillOpacity =
      typeof params.fillOpacity === "number" ? params.fillOpacity : undefined;
    setSolidFill(frame, params.fillHex, fillOpacity);
  }

  await appendToParentIfProvided(frame, params.parentId);
  positionNode(frame, params.x, params.y);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: frame.id,
      nodeName: frame.name,
      parentId: frame.parent?.id,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    },
  };
}
