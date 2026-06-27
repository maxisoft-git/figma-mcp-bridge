import type { ServerRequest, PluginResponse } from "../types";

type VariableType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";

interface ListVariablesParams {
  /** Filter by variable name substring. */
  nameFilter?: string;
  /** Filter by type. */
  type?: VariableType;
  /** Maximum number of variables to return. Default 200. */
  limit?: number;
}

interface GetVariableCollectionParams {
  collectionId: string;
  modeId?: string;
}

interface SetVariableValueParams {
  variableId: string;
  modeId: string;
  value: number | string | boolean | { r: number; g: number; b: number; a?: number };
}

interface CreateVariableAliasParams {
  name: string;
  targetVariableId: string;
  type?: VariableType;
}

interface VariableSummary {
  id: string;
  name: string;
  type: VariableType;
  valuesByMode: Record<string, unknown>;
  collectionName: string;
  collectionId: string;
}

interface CollectionSummary {
  id: string;
  name: string;
  modes: Array<{ id: string; name: string }>;
  variableCount: number;
  variables: VariableSummary[];
}

function isVariableType(s: string): s is VariableType {
  return s === "COLOR" || s === "FLOAT" || s === "STRING" || s === "BOOLEAN";
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as ListVariablesParams & { mode?: "list" | "get" | "set" | "alias"; collectionId?: string; modeId?: string; variableId?: string; value?: unknown; targetVariableId?: string; name?: string; type?: string };

  // Dispatch by mode
  if (params.mode === "get") {
    return getCollection(params as unknown as GetVariableCollectionParams);
  }
  if (params.mode === "set") {
    return setValue(params as unknown as SetVariableValueParams);
  }
  if (params.mode === "alias") {
    return createAlias(params as unknown as CreateVariableAliasParams);
  }
  // default: list
  return listVars(params);
}

async function listVars(p: ListVariablesParams): Promise<PluginResponse> {
  const limit = p.limit ?? 200;
  const filterType = p.type && isVariableType(p.type) ? p.type : undefined;
  const allVars = await figma.variables.getLocalVariablesAsync();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const colById = new Map(collections.map((c) => [c.id, c] as const));
  let matched = allVars;
  if (p.nameFilter) {
    const q = p.nameFilter.toLowerCase();
    matched = matched.filter((v) => v.name.toLowerCase().includes(q));
  }
  if (filterType) {
    matched = matched.filter((v) => v.resolvedType === filterType);
  }
  matched = matched.slice(0, limit);

  const items: VariableSummary[] = matched.map((v) => {
    const col = colById.get(v.variableCollectionId);
    const valuesByMode: Record<string, unknown> = {};
    if (col) {
      for (const m of col.modes) {
        valuesByMode[m.modeId] = v.valuesByMode[m.modeId];
      }
    }
    return {
      id: v.id,
      name: v.name,
      type: v.resolvedType,
      valuesByMode,
      collectionName: col?.name ?? "",
      collectionId: v.variableCollectionId,
    };
  });
  return { type: "inspect_variables", requestId: "_req", data: { count: items.length, items } };
}

async function getCollection(p: GetVariableCollectionParams): Promise<PluginResponse> {
  if (!p.collectionId) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "VALIDATION_ERROR", message: "collectionId is required for mode='get'" } };
  }
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const col = collections.find((c) => c.id === p.collectionId);
  if (!col) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "NOT_FOUND", message: `Collection not found: ${p.collectionId}` } };
  }
  const allVars = await figma.variables.getLocalVariablesAsync();
  const variables = allVars.filter((v) => v.variableCollectionId === col.id);
  const mode = p.modeId ?? col.defaultModeId;
  return {
    type: "inspect_variables",
    requestId: "_req",
    data: {
      collection: {
        id: col.id,
        name: col.name,
        modes: col.modes.map((m) => ({ id: m.modeId, name: m.name })),
        variableCount: variables.length,
        variables: variables.map((v) => ({
          id: v.id,
          name: v.name,
          type: v.resolvedType,
          valuesByMode: Object.fromEntries(
            col.modes.map((m) => [m.modeId, v.valuesByMode[m.modeId]]),
          ),
          collectionName: col.name,
          collectionId: col.id,
        })),
      },
      mode,
    } satisfies { collection: CollectionSummary; mode: string },
  };
}

async function setValue(p: SetVariableValueParams): Promise<PluginResponse> {
  if (!p.variableId) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "VALIDATION_ERROR", message: "variableId is required for mode='set'" } };
  }
  if (!p.modeId) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "VALIDATION_ERROR", message: "modeId is required for mode='set'" } };
  }
  if (p.value === undefined) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "VALIDATION_ERROR", message: "value is required for mode='set'" } };
  }
  const allVars = await figma.variables.getLocalVariablesAsync();
  const v = allVars.find((vv) => vv.id === p.variableId);
  if (!v) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "NOT_FOUND", message: `Variable not found: ${p.variableId}` } };
  }
  const previous = v.valuesByMode[p.modeId];
  try {
    if (v.resolvedType === "COLOR" && typeof p.value === "object" && p.value !== null) {
      const c = p.value as { r: number; g: number; b: number; a?: number };
      v.setValueForMode(p.modeId, { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 });
    } else {
      v.setValueForMode(p.modeId, p.value as VariableValue);
    }
  } catch (err) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "OPERATION_FAILED", message: err instanceof Error ? err.message : String(err) } };
  }
  return {
    type: "inspect_variables",
    requestId: "_req",
    data: { variableId: p.variableId, modeId: p.modeId, previous, current: v.valuesByMode[p.modeId] },
  };
}

async function createAlias(p: CreateVariableAliasParams): Promise<PluginResponse> {
  if (!p.name) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "VALIDATION_ERROR", message: "name is required for mode='alias'" } };
  }
  if (!p.targetVariableId) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "VALIDATION_ERROR", message: "targetVariableId is required for mode='alias'" } };
  }
  const allVars = await figma.variables.getLocalVariablesAsync();
  const target = allVars.find((v) => v.id === p.targetVariableId);
  if (!target) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "NOT_FOUND", message: `Target variable not found: ${p.targetVariableId}` } };
  }
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const col = collections.find((c) => c.id === target.variableCollectionId);
  if (!col) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "NOT_FOUND", message: "Target variable's collection not found" } };
  }
  try {
    const alias = figma.variables.createVariable(p.name, col, p.type ?? target.resolvedType);
    alias.setValueForMode(col.defaultModeId, {
      type: "VARIABLE_ALIAS",
      id: target.id,
    } satisfies VariableAlias);
    return {
      type: "inspect_variables",
      requestId: "_req",
      data: {
        variableId: alias.id,
        name: alias.name,
        type: alias.resolvedType,
        collectionId: col.id,
        targetVariableId: target.id,
        targetVariableName: target.name,
      },
    };
  } catch (err) {
    return { type: "inspect_variables", requestId: "_req", error: { code: "OPERATION_FAILED", message: err instanceof Error ? err.message : String(err) } };
  }
}
