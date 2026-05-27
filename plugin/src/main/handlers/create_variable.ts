import type { ServerRequest, PluginResponse } from "../types";
import { parseHexColor } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const name = typeof params.name === "string" ? params.name : "";
  const collectionId = typeof params.collectionId === "string" ? params.collectionId : "";
  const resolvedType = params.type as "COLOR" | "FLOAT" | "STRING" | "BOOLEAN" | undefined;
  const valuesByMode = params.valuesByMode as Record<string, unknown> | undefined;

  if (!name) {
    throw new Error("name is required for create_variable");
  }
  if (!collectionId) {
    throw new Error("collectionId is required for create_variable");
  }
  if (!resolvedType) {
    throw new Error("type is required for create_variable (COLOR, FLOAT, STRING, or BOOLEAN)");
  }
  if (!valuesByMode || Object.keys(valuesByMode).length === 0) {
    throw new Error("valuesByMode is required for create_variable");
  }

  const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
  if (!collection) {
    throw new Error(`Variable collection not found: ${collectionId}`);
  }

  const variable = figma.variables.createVariable(name, collectionId, resolvedType);

  const modeMap = new Map<string, string>();
  for (const mode of collection.modes) {
    modeMap.set(mode.name, mode.modeId);
    modeMap.set(mode.modeId, mode.modeId);
  }

  for (const [modeKey, rawValue] of Object.entries(valuesByMode)) {
    const modeId = modeMap.get(modeKey);
    if (!modeId) {
      throw new Error(`Mode "${modeKey}" not found in collection "${collection.name}". Available modes: ${collection.modes.map((m) => m.name).join(", ")}`);
    }

    let value: VariableValue;
    if (resolvedType === "COLOR" && typeof rawValue === "string") {
      const color = parseHexColor(rawValue);
      value = { r: color.r, g: color.g, b: color.b, a: 1 };
    } else if (resolvedType === "FLOAT" && typeof rawValue === "number") {
      value = rawValue;
    } else if (resolvedType === "STRING" && typeof rawValue === "string") {
      value = rawValue;
    } else if (resolvedType === "BOOLEAN" && typeof rawValue === "boolean") {
      value = rawValue;
    } else {
      throw new Error(`Invalid value "${rawValue}" for type ${resolvedType}`);
    }

    variable.setValueForMode(modeId, value);
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      variableId: variable.id,
      name: variable.name,
      type: variable.resolvedType,
      collectionId,
    },
  };
}