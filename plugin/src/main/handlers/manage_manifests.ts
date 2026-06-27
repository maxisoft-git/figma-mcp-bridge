import type { ServerRequest, PluginResponse } from "../types";
import { listManifests, deleteManifest, type ManifestSummary } from "../utils/ds-manifest";

interface ManifestOpsParams {
  mode: "list" | "delete";
  manifestId?: string;
}

/** Single handler exposed as `manage_manifests` (mode=list|delete). */
export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as ManifestOpsParams;
  const mode = params.mode;

  if (mode === "delete") {
    if (!params.manifestId) {
      return {
        type: request.type,
        requestId: request.requestId,
        error: { code: "VALIDATION_ERROR", message: "manifestId is required when mode='delete'" },
      };
    }
    const deleted = await deleteManifest(params.manifestId);
    return {
      type: request.type,
      requestId: request.requestId,
      data: { manifestId: params.manifestId, deleted },
    };
  }

  // mode === "list" (default)
  const items: ManifestSummary[] = await listManifests();
  return {
    type: request.type,
    requestId: request.requestId,
    data: { count: items.length, items },
  };
}
