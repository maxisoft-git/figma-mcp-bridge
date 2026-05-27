import type { ServerRequest, PluginResponse } from "../types";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const name = typeof params.name === "string" ? params.name : "";
  const modes = Array.isArray(params.modes) ? params.modes : [];

  if (!name) {
    throw new Error("name is required for create_variable_collection");
  }
  if (modes.length === 0) {
    throw new Error("modes array is required for create_variable_collection");
  }

  const collection = figma.variables.createVariableCollection(name);

  for (let i = 0; i < modes.length; i++) {
    const modeName = modes[i] as string;
    if (i === 0) {
      collection.renameMode(collection.modes[0].modeId, modeName);
    } else {
      collection.addMode(modeName);
    }
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      collectionId: collection.id,
      name: collection.name,
      modes: collection.modes.map((m) => ({
        modeId: m.modeId,
        name: m.name,
      })),
    },
  };
}