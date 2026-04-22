import type { ServerRequest, PluginResponse } from "../types";
import {
  getTextNodeById,
  loadFontsForTextNode,
  ensureFont,
  applyTextFill,
  positionNode,
  resizeNodeIfSupported,
} from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw new Error("nodeIds is required for set_text_properties");
  }

  const node = await getTextNodeById(nodeId);
  const params = request.params ?? {};
  const applied: Record<string, unknown> = {};

  await loadFontsForTextNode(node);

  if (typeof params.fontFamily === "string" || typeof params.fontStyle === "string") {
    const currentFontName =
      typeof node.fontName === "symbol" ? null : node.fontName;
    const nextFamily =
      typeof params.fontFamily === "string"
        ? params.fontFamily
        : currentFontName?.family;
    const nextStyle =
      typeof params.fontStyle === "string"
        ? params.fontStyle
        : currentFontName?.style;

    if (!nextFamily || !nextStyle) {
      throw new Error(
        "fontFamily and fontStyle must resolve to a concrete font for set_text_properties"
      );
    }

    node.fontName = await ensureFont(nextFamily, nextStyle);
    applied.fontName = node.fontName;
  }

  if (typeof params.fontSize === "number") {
    node.fontSize = params.fontSize;
    applied.fontSize = node.fontSize;
  }

  if (
    params.textAlignHorizontal === "LEFT" ||
    params.textAlignHorizontal === "CENTER" ||
    params.textAlignHorizontal === "RIGHT" ||
    params.textAlignHorizontal === "JUSTIFIED"
  ) {
    node.textAlignHorizontal = params.textAlignHorizontal;
    applied.textAlignHorizontal = node.textAlignHorizontal;
  }

  if (
    params.textAlignVertical === "TOP" ||
    params.textAlignVertical === "CENTER" ||
    params.textAlignVertical === "BOTTOM"
  ) {
    node.textAlignVertical = params.textAlignVertical;
    applied.textAlignVertical = node.textAlignVertical;
  }

  if (
    params.textAutoResize === "NONE" ||
    params.textAutoResize === "WIDTH_AND_HEIGHT" ||
    params.textAutoResize === "HEIGHT" ||
    params.textAutoResize === "TRUNCATE"
  ) {
    node.textAutoResize = params.textAutoResize;
    applied.textAutoResize = node.textAutoResize;
  }

  if (typeof params.lineHeightPx === "number") {
    node.lineHeight = {
      unit: "PIXELS",
      value: params.lineHeightPx,
    };
    applied.lineHeight = node.lineHeight;
  }

  if (typeof params.letterSpacingPx === "number") {
    node.letterSpacing = {
      unit: "PIXELS",
      value: params.letterSpacingPx,
    };
    applied.letterSpacing = node.letterSpacing;
  }

  if (typeof params.fillHex === "string") {
    const fillOpacity =
      typeof params.fillOpacity === "number" ? params.fillOpacity : undefined;
    applyTextFill(node, params.fillHex, fillOpacity);
    applied.fillHex = params.fillHex;
    applied.fillOpacity = fillOpacity ?? 1;
  }

  if (typeof params.x === "number" || typeof params.y === "number") {
    positionNode(node, params.x, params.y);
    applied.x = node.x;
    applied.y = node.y;
  }

  resizeNodeIfSupported(node, params.width, params.height);
  if (typeof params.width === "number" || typeof params.height === "number") {
    applied.width = node.width;
    applied.height = node.height;
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      applied,
    },
  };
}
