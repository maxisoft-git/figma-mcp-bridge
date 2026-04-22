import type { ServerRequest, PluginResponse } from "../types";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const [paintStyles, textStyles, effectStyles, gridStyles] =
    await Promise.all([
      figma.getLocalPaintStylesAsync(),
      figma.getLocalTextStylesAsync(),
      figma.getLocalEffectStylesAsync(),
      figma.getLocalGridStylesAsync(),
    ]);
  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      paints: paintStyles.map((style) => ({
        id: style.id,
        name: style.name,
        paints: style.paints,
      })),
      text: textStyles.map((style) => ({
        id: style.id,
        name: style.name,
        fontSize: style.fontSize,
        fontName: style.fontName,
        textDecoration: style.textDecoration,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
      })),
      effects: effectStyles.map((style) => ({
        id: style.id,
        name: style.name,
        effects: style.effects,
      })),
      grids: gridStyles.map((style) => ({
        id: style.id,
        name: style.name,
        layoutGrids: style.layoutGrids,
      })),
    },
  };
}
