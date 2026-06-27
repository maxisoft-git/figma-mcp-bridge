import type { ServerRequest, PluginResponse } from "../types";
import { getManifest, listManifests, type DesignManifest } from "../utils/ds-manifest";

interface ExportTokensParams {
  /** Which manifest to export. "all" exports every stored manifest as one combined JSON. */
  manifestId?: string;
  /** When true, include a top-level "summary" with stats per manifest. Default true. */
  includeSummary?: boolean;
}

interface ExportedManifest extends DesignManifest {
  manifestId: string;
  createdAt?: number;
}

interface ExportTokensResult {
  json: string;
  bytes: number;
  manifestCount: number;
  summary: {
    manifestId: string;
    counts: {
      colors: number;
      textStyles: number;
      spacing: number;
      radii: number;
      effects: number;
    };
  }[];
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as ExportTokensParams;
  const includeSummary = params.includeSummary ?? true;

  const items: ExportedManifest[] = [];
  if (params.manifestId && params.manifestId !== "all") {
    const m = await getManifest(params.manifestId);
    if (!m) {
      return { type: request.type, requestId: request.requestId, error: { code: "NOT_FOUND", message: `Manifest not found: ${params.manifestId}` } };
    }
    items.push({ ...m, manifestId: params.manifestId });
  } else {
    const summaries = await listManifests();
    for (const s of summaries) {
      const m = await getManifest(s.id);
      if (m) items.push({ ...m, manifestId: s.id, createdAt: s.createdAt });
    }
  }

  if (items.length === 0) {
    return { type: request.type, requestId: request.requestId, data: { json: "[]", bytes: 2, manifestCount: 0, summary: [] } };
  }

  const summary = includeSummary
    ? items.map((m) => ({
        manifestId: m.manifestId,
        counts: {
          colors: Object.keys(m.colors).length,
          textStyles: Object.keys(m.textStyles).length,
          spacing: Object.keys(m.spacing).length,
          radii: Object.keys(m.radii).length,
          effects: Object.keys(m.effects).length,
        },
      }))
    : [];

  const json = JSON.stringify({ exportedAt: new Date().toISOString(), figmaPlugin: "figma-mcp-bridge", manifests: items }, null, 2);
  return { type: request.type, requestId: request.requestId, data: { json, bytes: json.length, manifestCount: items.length, summary } };
}
