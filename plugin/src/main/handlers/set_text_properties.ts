import type { ServerRequest, PluginResponse } from "../types";
import {
  applyProps,
  getTextNodeById,
  resizeNodeIfSupported,
  applyTextFill,
  loadFontsForTextNode,
  numericProp,
  stringProp,
} from "../utils";
import { setTextPropertiesSchema, validateParams } from "../schemas";
import { createError, PluginErrorCode } from "../errors";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = validateParams(setTextPropertiesSchema, request.params ?? {});
  const node = await getTextNodeById(params.nodeId);
  await loadFontsForTextNode(node);
  const applied: Record<string, unknown> = {};

  if (params.fontFamily || params.fontStyle) {
    const currentFontName = typeof node.fontName === "symbol" ? null : node.fontName;
    const nextFamily = params.fontFamily ?? currentFontName?.family;
    const nextStyle = params.fontStyle ?? currentFontName?.style;
    if (!nextFamily || !nextStyle) {
      throw createError(
        PluginErrorCode.VALIDATION_ERROR,
        "fontFamily and fontStyle must resolve to a concrete font for set_text_properties",
      );
    }
    await figma.loadFontAsync({ family: nextFamily, style: nextStyle });
    node.fontName = { family: nextFamily, style: nextStyle };
    applied.fontName = node.fontName;
  }

  applyProps(node, params as unknown as Record<string, unknown>, [
    numericProp("fontSize"),
    stringProp("textAlignHorizontal"),
    stringProp("textAlignVertical"),
    stringProp("textAutoResize"),
  ], applied);

  if (typeof params.lineHeightPx === "number") {
    node.lineHeight = { unit: "PIXELS", value: params.lineHeightPx };
    applied.lineHeight = node.lineHeight;
  }
  if (typeof params.letterSpacingPx === "number") {
    node.letterSpacing = { unit: "PIXELS", value: params.letterSpacingPx };
    applied.letterSpacing = node.letterSpacing;
  }
  if (typeof params.fillHex === "string") {
    applyTextFill(node, params.fillHex, params.fillOpacity);
    applied.fillHex = params.fillHex;
    applied.fillOpacity = params.fillOpacity ?? 1;
  }
  if (typeof params.x === "number" || typeof params.y === "number") {
    if (params.x !== undefined) node.x = params.x;
    if (params.y !== undefined) node.y = params.y;
    applied.x = node.x;
    applied.y = node.y;
  }
  if (typeof params.width === "number" || typeof params.height === "number") {
    resizeNodeIfSupported(node, params.width, params.height);
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
