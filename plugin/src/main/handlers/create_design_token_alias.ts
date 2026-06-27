import type { ServerRequest, PluginResponse } from "../types";

interface CreateTokenAliasParams {
  /** The new alias's name. e.g. "color/primary". */
  name: string;
  /** The variable to alias. */
  targetVariableId: string;
  /** Optional type override. Default: target's type. */
  type?: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  /** Optional collection override. Default: target's collection. */
  collectionId?: string;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as CreateTokenAliasParams;
  if (!params.name) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "name is required" } };
  }
  if (!params.targetVariableId) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "targetVariableId is required" } };
  }
  const allVars = await figma.variables.getLocalVariablesAsync();
  const target = allVars.find((v) => v.id === params.targetVariableId);
  if (!target) {
    return { type: request.type, requestId: request.requestId, error: { code: "NOT_FOUND", message: `Target variable not found: ${params.targetVariableId}` } };
  }
  const collectionId = params.collectionId ?? target.variableCollectionId;
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const col = collections.find((c) => c.id === collectionId);
  if (!col) {
    return { type: request.type, requestId: request.requestId, error: { code: "NOT_FOUND", message: `Collection not found: ${collectionId}` } };
  }
  try {
    const alias = figma.variables.createVariable(params.name, col, params.type ?? target.resolvedType);
    for (const m of col.modes) {
      alias.setValueForMode(m.modeId, { type: "VARIABLE_ALIAS", id: target.id } satisfies VariableAlias);
    }
    return {
      type: request.type,
      requestId: request.requestId,
      data: {
        variableId: alias.id,
        name: alias.name,
        type: alias.resolvedType,
        collectionId: col.id,
        targetVariableId: target.id,
        targetVariableName: target.name,
        modes: col.modes.length,
      },
    };
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "OPERATION_FAILED", message: err instanceof Error ? err.message : String(err) } };
  }
}
