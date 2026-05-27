import type { ServerRequest, PluginResponse } from "../types";
import { parseHexColor } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const name = typeof params.name === "string" ? params.name : "";
  const effects = Array.isArray(params.effects) ? params.effects : [];

  if (!name) {
    throw new Error("name is required for create_effect_style");
  }
  if (effects.length === 0) {
    throw new Error("effects array is required for create_effect_style");
  }

  const style = figma.createEffectStyle();
  style.name = name;

  const figmaEffects: Effect[] = effects.map((effect: unknown) => {
    const e = effect as Record<string, unknown>;
    const type = e.type as string;

    if (type === "DROP_SHADOW" || type === "INNER_SHADOW") {
      return {
        type,
        color: parseHexColor(e.color as string),
        offset: (e.offset as { x: number; y: number }) ?? { x: 0, y: 0 },
        radius: (e.radius as number) ?? 0,
        spread: (e.spread as number) ?? 0,
        visible: true,
        blendMode: (e.blendMode as BlendMode) ?? "NORMAL",
      } as Effect;
    }

    if (type === "LAYER_BLUR" || type === "BACKGROUND_BLUR") {
      return {
        type,
        radius: (e.radius as number) ?? 0,
        visible: true,
      } as Effect;
    }

    throw new Error(`Unsupported effect type: ${type}`);
  });

  style.effects = figmaEffects;

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      styleId: style.id,
      name: style.name,
    },
  };
}