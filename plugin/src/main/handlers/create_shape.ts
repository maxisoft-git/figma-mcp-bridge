import type { ServerRequest, PluginResponse } from "../types";
import {
  parseHexColor,
  setSolidFill,
  resizeNodeIfSupported,
  appendToParentIfProvided,
  positionNode,
} from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const shapeType = params.shapeType;
  let node: SceneNode;

  if (shapeType === "ELLIPSE") {
    node = figma.createEllipse();
  } else if (shapeType === "LINE") {
    node = figma.createLine();
  } else {
    node = figma.createRectangle();
  }

  if (typeof params.name === "string") {
    node.name = params.name;
  }

  resizeNodeIfSupported(node, params.width, params.height);

  if (typeof params.rotation === "number" && "rotation" in node) {
    node.rotation = params.rotation;
  }

  if (shapeType === "LINE") {
    if (!("strokes" in node)) {
      throw new Error(`Line node does not support strokes: ${node.id}`);
    }
    const strokeHex =
      typeof params.strokeHex === "string" ? params.strokeHex : "#000000";
    node.strokes = [
      {
        type: "SOLID",
        color: parseHexColor(strokeHex),
        opacity:
          typeof params.strokeOpacity === "number" ? params.strokeOpacity : 1,
      },
    ];
    if (
      "strokeWeight" in node &&
      typeof params.strokeWeight === "number"
    ) {
      node.strokeWeight = params.strokeWeight;
    }
  } else if (typeof params.fillHex === "string") {
    const fillOpacity =
      typeof params.fillOpacity === "number" ? params.fillOpacity : undefined;
    setSolidFill(node, params.fillHex, fillOpacity);
  }

  if (typeof params.cornerRadius === "number" && "cornerRadius" in node) {
    node.cornerRadius = params.cornerRadius;
  }

  await appendToParentIfProvided(node, params.parentId);
  positionNode(node, params.x, params.y);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      shapeType,
      parentId: node.parent?.id,
      x: "x" in node ? node.x : undefined,
      y: "y" in node ? node.y : undefined,
      width: "width" in node ? node.width : undefined,
      height: "height" in node ? node.height : undefined,
    },
  };
}
