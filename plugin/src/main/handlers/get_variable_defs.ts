import type { ServerRequest, PluginResponse } from "../types";
import { serializeVariableValue } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const collections =
    await figma.variables.getLocalVariableCollectionsAsync();
  const variableData = await Promise.all(
    collections.map(async (collection) => {
      const variables = await Promise.all(
        collection.variableIds.map((id) =>
          figma.variables.getVariableByIdAsync(id)
        )
      );
      return {
        id: collection.id,
        name: collection.name,
        modes: collection.modes.map((mode) => ({
          modeId: mode.modeId,
          name: mode.name,
        })),
        variables: variables
          .filter((v): v is Variable => v !== null)
          .map((variable) => ({
            id: variable.id,
            name: variable.name,
            resolvedType: variable.resolvedType,
            valuesByMode: Object.fromEntries(
              Object.entries(variable.valuesByMode).map(
                ([modeId, value]) => [
                  modeId,
                  serializeVariableValue(value),
                ]
              )
            ),
          })),
      };
    })
  );
  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      collections: variableData,
    },
  };
}
