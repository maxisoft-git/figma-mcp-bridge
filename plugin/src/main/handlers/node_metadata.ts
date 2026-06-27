import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface MetadataParams {
  nodeIds: string[];
  /** Key under which to store the data (use unique namespace per use case). */
  key: string;
  /** JSON-serializable value to store. */
  value: unknown;
}

interface GetMetadataParams {
  nodeIds: string[];
  key: string;
}

interface SetMetadataResult {
  stored: number;
  failed: number;
}

interface GetMetadataResult {
  items: Array<{ nodeId: string; name: string; value: unknown }>;
}

export async function handleSet(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as MetadataParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  if (typeof params.key !== "string" || params.key.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "key is required" } };
  }
  const json = JSON.stringify(params.value);
  const result: SetMetadataResult = { stored: 0, failed: 0 };
  for (const id of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(id);
    } catch {
      result.failed++;
      continue;
    }
    try {
      node.setSharedPluginData("figma-mcp-bridge", params.key, json);
      result.stored++;
    } catch {
      result.failed++;
    }
  }
  return { type: request.type, requestId: request.requestId, data: result };
}

export async function handleGet(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as GetMetadataParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  if (typeof params.key !== "string" || params.key.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "key is required" } };
  }
  const items: GetMetadataResult["items"] = [];
  for (const id of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(id);
    } catch {
      continue;
    }
    const raw = node.getSharedPluginData("figma-mcp-bridge", params.key);
    if (raw) {
      try {
        items.push({ nodeId: node.id, name: node.name, value: JSON.parse(raw) });
      } catch {
        items.push({ nodeId: node.id, name: node.name, value: raw });
      }
    }
  }
  return { type: request.type, requestId: request.requestId, data: { items } };
}
