import type { ServerRequest, PluginResponse } from "../types";
import {
  ensureFont,
  applyTextFill,
  resizeNodeIfSupported,
  appendToParentIfProvided,
  positionNode,
} from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const text = figma.createText();

  const fontFamily =
    typeof params.fontFamily === "string" ? params.fontFamily : "Inter";
  const fontStyle =
    typeof params.fontStyle === "string" ? params.fontStyle : "Regular";
  text.fontName = await ensureFont(fontFamily, fontStyle);

  if (typeof params.name === "string") {
    text.name = params.name;
  }
  if (typeof params.characters === "string") {
    text.characters = params.characters;
  }
  if (typeof params.fontSize === "number") {
    text.fontSize = params.fontSize;
  }
  if (typeof params.fillHex === "string") {
    const fillOpacity =
      typeof params.fillOpacity === "number" ? params.fillOpacity : undefined;
    applyTextFill(text, params.fillHex, fillOpacity);
  }

  if (
    params.textAlignHorizontal === "LEFT" ||
    params.textAlignHorizontal === "CENTER" ||
    params.textAlignHorizontal === "RIGHT" ||
    params.textAlignHorizontal === "JUSTIFIED"
  ) {
    text.textAlignHorizontal = params.textAlignHorizontal;
  }

  if (
    params.textAutoResize === "NONE" ||
    params.textAutoResize === "WIDTH_AND_HEIGHT" ||
    params.textAutoResize === "HEIGHT" ||
    params.textAutoResize === "TRUNCATE"
  ) {
    text.textAutoResize = params.textAutoResize;
  }

  resizeNodeIfSupported(text, params.width, params.height);
  await appendToParentIfProvided(text, params.parentId);
  positionNode(text, params.x, params.y);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: text.id,
      nodeName: text.name,
      parentId: text.parent?.id,
      characters: text.characters,
      x: text.x,
      y: text.y,
      width: text.width,
      height: text.height,
    },
  };
}
