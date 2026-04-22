import type { ServerRequest, PluginResponse } from "../types";
import {
  decodeBase64ToBytes,
  appendToParentIfProvided,
  positionNode,
} from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  if (typeof params.imageBase64 !== "string" || params.imageBase64.length === 0) {
    throw new Error("imageBase64 is required for create_image");
  }

  const image = figma.createImage(decodeBase64ToBytes(params.imageBase64));
  const imageSize = await image.getSizeAsync();
  const node = figma.createRectangle();

  if (typeof params.name === "string") {
    node.name = params.name;
  }

  const aspectRatio = imageSize.width / imageSize.height;
  const width =
    typeof params.width === "number"
      ? params.width
      : typeof params.height === "number"
        ? params.height * aspectRatio
        : imageSize.width;
  const height =
    typeof params.height === "number"
      ? params.height
      : typeof params.width === "number"
        ? params.width / aspectRatio
        : imageSize.height;

  node.resize(width, height);
  node.fills = [
    {
      type: "IMAGE",
      imageHash: image.hash,
      scaleMode: params.scaleMode === "FIT" ? "FIT" : "FILL",
    },
  ];

  if (typeof params.cornerRadius === "number") {
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
      parentId: node.parent?.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      imageHash: image.hash,
    },
  };
}
