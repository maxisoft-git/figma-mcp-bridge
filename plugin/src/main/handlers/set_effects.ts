import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById, parseHexColor } from "../utils";

type EffectInput = {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
  color?: string;
  opacity?: number;
  offset?: { x: number; y: number };
  radius: number;
  spread?: number;
  blendMode?: string;
  visible?: boolean;
};

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw new Error("nodeIds is required for set_effects");
  }

  const node = await getSceneNodeById(nodeId);
  const params = request.params ?? {};

  if (!("effects" in node)) {
    throw new Error(`Node does not support effects: ${nodeId}`);
  }

  const mode = params.mode;
  if (mode === "clear") {
    node.effects = [];
    return {
      type: request.type,
      requestId: request.requestId,
      data: {
        nodeId: node.id,
        nodeName: node.name,
        applied: { mode: "clear", effectsCount: 0 },
      },
    };
  }

  const rawEffects = params.effects;
  if (!Array.isArray(rawEffects) || rawEffects.length === 0) {
    throw new Error("effects array or mode:'clear' is required");
  }

  const newEffects: Effect[] = rawEffects.map((e: EffectInput) => {
    const visible = e.visible !== false;

    switch (e.type) {
      case "DROP_SHADOW":
      case "INNER_SHADOW": {
        const color = e.color ? parseHexColor(e.color) : { r: 0, g: 0, b: 0 };
        return {
          type: e.type,
          color: { ...color, a: e.opacity ?? 0.25 },
          offset: e.offset ?? { x: 0, y: 4 },
          radius: e.radius ?? 4,
          spread: e.spread ?? 0,
          blendMode: (e.blendMode as BlendMode) ?? "NORMAL",
          visible,
        } as ShadowEffect;
      }
      case "LAYER_BLUR":
        return {
          type: "LAYER_BLUR",
          radius: e.radius ?? 4,
          visible,
        } as BlurEffect;
      case "BACKGROUND_BLUR":
        return {
          type: "BACKGROUND_BLUR",
          radius: e.radius ?? 4,
          visible,
        } as BlurEffect;
      default:
        throw new Error(`Unknown effect type: ${e.type}`);
    }
  });

  if (mode === "replace") {
    node.effects = newEffects;
  } else {
    node.effects = [...(node.effects as Effect[]), ...newEffects];
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      applied: {
        mode: mode === "replace" ? "replace" : "append",
        effectsCount: (node.effects as Effect[]).length,
      },
    },
  };
}
