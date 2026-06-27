import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

type BuiltinPreset = "ios" | "android" | "material" | "fluent";
type PresetName = BuiltinPreset | "custom";

interface PresetToken {
  name: string; // e.g. "color/primary/500"
  type: "COLOR" | "FLOAT" | "STRING";
  value: number | string | { r: number; g: number; b: number; a?: number };
}

interface ApplyStylePresetParams {
  nodeIds: string[];
  preset: PresetName;
  /** When preset='custom', provide a list of variables to create/apply. */
  customTokens?: PresetToken[];
  /** Optional manifest name for the created collection. Default: "<preset>-design-system". */
  collectionName?: string;
  /** Apply generated variables to the given nodes via fill/spacing binding. Default true. */
  applyToNodes?: boolean;
}

interface ApplyResult {
  collectionId: string;
  variablesCreated: number;
  variablesSkipped: number;
  appliedToNodes: number;
  preview: {
    name: string;
    type: string;
    fillsBoundTo: number;
    spacingBoundTo: number;
  }[];
}

const PRESETS: Record<BuiltinPreset, PresetToken[]> = {
  ios: [
    { name: "ios/colors/blue", type: "COLOR", value: { r: 0, g: 122/255, b: 1, a: 1 } },
    { name: "ios/colors/gray-6", type: "COLOR", value: { r: 142/255, g: 142/255, b: 147/255, a: 1 } },
    { name: "ios/colors/white", type: "COLOR", value: { r: 1, g: 1, b: 1, a: 1 } },
    { name: "ios/radius/sm", type: "FLOAT", value: 6 },
    { name: "ios/radius/md", type: "FLOAT", value: 10 },
    { name: "ios/radius/lg", type: "FLOAT", value: 16 },
    { name: "ios/spacing/xs", type: "FLOAT", value: 4 },
    { name: "ios/spacing/sm", type: "FLOAT", value: 8 },
    { name: "ios/spacing/md", type: "FLOAT", value: 16 },
    { name: "ios/spacing/lg", type: "FLOAT", value: 24 },
  ],
  android: [
    { name: "android/colors/primary", type: "COLOR", value: { r: 0.38, g: 0.49, b: 0.76, a: 1 } },
    { name: "android/colors/surface", type: "COLOR", value: { r: 1, g: 1, b: 1, a: 1 } },
    { name: "android/radius/sm", type: "FLOAT", value: 4 },
    { name: "android/radius/md", type: "FLOAT", value: 8 },
    { name: "android/radius/lg", type: "FLOAT", value: 12 },
    { name: "android/spacing/xs", type: "FLOAT", value: 4 },
    { name: "android/spacing/sm", type: "FLOAT", value: 8 },
    { name: "android/spacing/md", type: "FLOAT", value: 16 },
    { name: "android/spacing/lg", type: "FLOAT", value: 24 },
  ],
  material: [
    { name: "material/colors/primary", type: "COLOR", value: { r: 0.13, g: 0.32, b: 0.55, a: 1 } },
    { name: "material/colors/secondary", type: "COLOR", value: { r: 0.96, g: 0.26, b: 0.21, a: 1 } },
    { name: "material/colors/surface", type: "COLOR", value: { r: 1, g: 1, b: 1, a: 1 } },
    { name: "material/radius/sm", type: "FLOAT", value: 4 },
    { name: "material/radius/md", type: "FLOAT", value: 8 },
    { name: "material/radius/lg", type: "FLOAT", value: 16 },
    { name: "material/spacing/xs", type: "FLOAT", value: 4 },
    { name: "material/spacing/sm", type: "FLOAT", value: 8 },
    { name: "material/spacing/md", type: "FLOAT", value: 16 },
    { name: "material/spacing/lg", type: "FLOAT", value: 24 },
  ],
  fluent: [
    { name: "fluent/colors/accent", type: "COLOR", value: { r: 0, g: 90/255, b: 158/255, a: 1 } },
    { name: "fluent/colors/surface", type: "COLOR", value: { r: 242/255, g: 242/255, b: 242/255, a: 1 } },
    { name: "fluent/radius/sm", type: "FLOAT", value: 2 },
    { name: "fluent/radius/md", type: "FLOAT", value: 4 },
    { name: "fluent/radius/lg", type: "FLOAT", value: 8 },
    { name: "fluent/spacing/xs", type: "FLOAT", value: 4 },
    { name: "fluent/spacing/sm", type: "FLOAT", value: 8 },
    { name: "fluent/spacing/md", type: "FLOAT", value: 12 },
    { name: "fluent/spacing/lg", type: "FLOAT", value: 16 },
  ],
};

async function getOrCreateCollection(name: string): Promise<VariableCollection> {
  const all = await figma.variables.getLocalVariableCollectionsAsync();
  const existing = all.find((c) => c.name === name);
  if (existing) return existing;
  return figma.variables.createVariableCollection(name);
}

function isColor(v: unknown): v is { r: number; g: number; b: number; a?: number } {
  return typeof v === "object" && v !== null && "r" in (v as Record<string, unknown>);
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as ApplyStylePresetParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  const validPresets = ["ios", "android", "material", "fluent", "custom"];
  if (!validPresets.includes(params.preset)) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: `preset must be one of: ${validPresets.join(", ")}` } };
  }
  if (params.preset === "custom" && !params.customTokens) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "customTokens is required when preset='custom'" } };
  }
  const tokens: PresetToken[] = params.preset === "custom" ? params.customTokens! : PRESETS[params.preset as BuiltinPreset];
  const collectionName = params.collectionName ?? `${params.preset}-design-system`;
  const applyToNodes = params.applyToNodes ?? true;

  const collection = await getOrCreateCollection(collectionName);
  const defaultMode = collection.modes[0]!.modeId;
  const allVars = await figma.variables.getLocalVariablesAsync();
  const byName = new Map(allVars.map((v) => [v.name, v] as const));

  let variablesCreated = 0;
  let variablesSkipped = 0;
  const colorByValue = new Map<string, string>(); // hex → variableId
  const radiusByValue = new Map<number, string>();
  const spacingByValue = new Map<number, string>();

  for (const t of tokens) {
    const existing = byName.get(t.name);
    if (existing) {
      variablesSkipped++;
      if (t.type === "COLOR" && isColor(t.value)) {
        colorByValue.set(rgbToHex(t.value), existing.id);
      } else if (t.type === "FLOAT") {
        const n = Number(t.value);
        if (t.name.toLowerCase().includes("radius")) radiusByValue.set(n, existing.id);
        if (t.name.toLowerCase().includes("spacing")) spacingByValue.set(n, existing.id);
      }
      continue;
    }
    const v = figma.variables.createVariable(t.name, collection, t.type);
    try {
      if (t.type === "COLOR" && isColor(t.value)) {
        v.setValueForMode(defaultMode, { r: t.value.r, g: t.value.g, b: t.value.b, a: t.value.a ?? 1 });
        colorByValue.set(rgbToHex(t.value), v.id);
      } else if (t.type === "FLOAT") {
        v.setValueForMode(defaultMode, Number(t.value));
        const n = Number(t.value);
        if (t.name.toLowerCase().includes("radius")) radiusByValue.set(n, v.id);
        if (t.name.toLowerCase().includes("spacing")) spacingByValue.set(n, v.id);
      } else {
        v.setValueForMode(defaultMode, String(t.value));
      }
      variablesCreated++;
    } catch (err) {
      return { type: request.type, requestId: request.requestId, error: { code: "OPERATION_FAILED", message: err instanceof Error ? err.message : String(err) } };
    }
  }

  const preview: ApplyResult["preview"] = [];
  let appliedToNodes = 0;
  if (applyToNodes) {
    for (const id of params.nodeIds) {
      let node: SceneNode;
      try {
        node = await resolveNode(id);
      } catch (err) {
        return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
      }
      let fillsBound = 0;
      if ("fills" in node) {
        const fills = (node as GeometryMixin).fills;
        if (Array.isArray(fills) && fills.length > 0) {
          const first = fills[0]!;
          if (first.type === "SOLID") {
            const hex = rgbToHex(first.color);
            const vid = colorByValue.get(hex);
            if (vid) {
              try {
                (node as GeometryMixin).setBoundVariable("fills", { type: "VARIABLE_ALIAS", id: vid });
                fillsBound++;
              } catch {
                // ignore
              }
            }
          }
        }
      }
      let spacingBound = 0;
      if ("itemSpacing" in node) {
        const f = node as FrameNode;
        const r = f.itemSpacing;
        const vid = spacingByValue.get(r);
        if (vid) {
          try {
            f.setBoundVariable("itemSpacing", { type: "VARIABLE_ALIAS", id: vid });
            spacingBound++;
          } catch {
            // ignore
          }
        }
      }
      if ("cornerRadius" in node) {
        const v = (node as { cornerRadius?: number }).cornerRadius;
        if (typeof v === "number") {
          const vid = radiusByValue.get(v);
          if (vid) {
            try {
              (node as unknown as { setBoundVariable: (k: string, a: VariableAlias) => void }).setBoundVariable("topLeftRadius", { type: "VARIABLE_ALIAS", id: vid });
              spacingBound++;
            } catch {
              // ignore
            }
          }
        }
      }
      preview.push({ name: node.name, type: node.type, fillsBoundTo: fillsBound, spacingBoundTo: spacingBound });
      appliedToNodes++;
    }
  } else {
    for (const id of params.nodeIds) {
      let n: SceneNode;
      try {
        n = await resolveNode(id);
      } catch {
        continue;
      }
      preview.push({ name: n.name, type: n.type, fillsBoundTo: 0, spacingBoundTo: 0 });
      appliedToNodes++;
    }
  }

  return { type: request.type, requestId: request.requestId, data: { collectionId: collection.id, variablesCreated, variablesSkipped, appliedToNodes, preview } satisfies ApplyResult };
}

function rgbToHex(c: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}
