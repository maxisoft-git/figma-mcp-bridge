import type { ServerRequest, PluginResponse } from "../types";
import { isSceneNode } from "../utils";
import { createError, PluginErrorCode } from "../errors";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  if (request.params?.confirm !== true) {
    throw createError(PluginErrorCode.VALIDATION_ERROR, "delete_nodes requires confirm: true");
  }
  if (!request.nodeIds || request.nodeIds.length === 0) {
    throw createError(PluginErrorCode.VALIDATION_ERROR, "nodeIds is required for delete_nodes");
  }

  const results = await Promise.all(
    request.nodeIds.map(async (nodeId) => {
      try {
        const node = await figma.getNodeByIdAsync(nodeId);
        if (!isSceneNode(node)) {
          return {
            nodeId,
            success: false,
            error: createError(PluginErrorCode.NODE_NOT_FOUND, `Node not found: ${nodeId}`),
          };
        }
        node.remove();
        return {
          nodeId,
          nodeName: node.name,
          success: true,
        };
      } catch (err) {
        return {
          nodeId,
          success: false,
          error: createError(
            PluginErrorCode.OPERATION_FAILED,
            err instanceof Error ? err.message : String(err)
          ),
        };
      }
    })
  );

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      total: results.length,
      deletedCount: succeeded,
      failedCount: failed,
      results,
    },
  };
}