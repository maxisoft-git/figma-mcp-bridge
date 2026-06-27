import type { ServerRequest, PluginResponse } from "../types";
import { createSnapshot, restoreSnapshot, listSnapshots, deleteSnapshot } from "../utils/snapshots";

interface SnapshotParams {
  mode: "create" | "restore" | "list" | "delete";
  nodeIds?: string[];
  snapshotId?: string;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as SnapshotParams;
  if (!params.mode) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "mode is required" } };
  }
  if (params.mode === "create") {
    if (!params.nodeIds || params.nodeIds.length === 0) {
      return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required for 'create'" } };
    }
    const id = await createSnapshot(params.nodeIds);
    return { type: request.type, requestId: request.requestId, data: { snapshotId: id, mode: "create" } };
  }
  if (params.mode === "restore") {
    if (!params.snapshotId) {
      return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "snapshotId is required for 'restore'" } };
    }
    const result = await restoreSnapshot(params.snapshotId);
    return { type: request.type, requestId: request.requestId, data: { ...result, mode: "restore" } };
  }
  if (params.mode === "list") {
    return { type: request.type, requestId: request.requestId, data: { items: listSnapshots(), mode: "list" } };
  }
  // delete
  if (!params.snapshotId) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "snapshotId is required for 'delete'" } };
  }
  const ok = deleteSnapshot(params.snapshotId);
  return { type: request.type, requestId: request.requestId, data: { deleted: ok, mode: "delete" } };
}
