import type { ServerRequest, PluginResponse } from "../types";
import { ensureFont } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const name = typeof params.name === "string" ? params.name : "";

  if (!name) {
    throw new Error("name is required for create_text_style");
  }

  const style = figma.createTextStyle();
  style.name = name;

  const fontFamily = typeof params.fontFamily === "string" ? params.fontFamily : "Inter";
  const fontStyle = typeof params.fontStyle === "string" ? params.fontStyle : "Regular";

  await ensureFont(fontFamily, fontStyle);
  style.fontName = { family: fontFamily, style: fontStyle };

  if (typeof params.fontSize === "number") {
    style.fontSize = params.fontSize;
  }

  if (params.lineHeight) {
    const lh = params.lineHeight as Record<string, unknown>;
    if (typeof lh.value === "number" && typeof lh.unit === "string") {
      style.lineHeight = { value: lh.value, unit: lh.unit as "PIXELS" | "PERCENT" };
    } else if (typeof params.lineHeight === "number") {
      style.lineHeight = { value: params.lineHeight as number, unit: "PIXELS" };
    }
  }

  if (typeof params.letterSpacing === "number") {
    style.letterSpacing = { value: params.letterSpacing, unit: "PIXELS" };
  }

  if (typeof params.textDecoration === "string") {
    style.textDecoration = params.textDecoration as "NONE" | "UNDERLINE" | "STRIKETHROUGH";
  }

  if (typeof params.textCase === "string") {
    style.textCase = params.textCase as "ORIGINAL" | "UPPER" | "LOWER" | "TITLE";
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      styleId: style.id,
      name: style.name,
    },
  };
}