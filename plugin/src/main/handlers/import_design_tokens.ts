import type { ServerRequest, PluginResponse } from "../types";
import { storeManifest, type DesignManifest } from "../utils/ds-manifest";

interface ImportTokensParams {
  /** JSON string of the export (from export_design_tokens or external source). */
  json: string;
  /** When true, merge with an existing manifest of the same name. Default: store as new. */
  mergeInto?: string;
}

interface ImportResult {
  manifestId: string;
  colors: number;
  textStyles: number;
  spacing: number;
  radii: number;
  effects: number;
}

function isManifestShape(x: unknown): x is DesignManifest {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.colors === "object" && m.colors !== null &&
    typeof m.textStyles === "object" && m.textStyles !== null &&
    typeof m.spacing === "object" && m.spacing !== null &&
    typeof m.radii === "object" && m.radii !== null &&
    typeof m.effects === "object" && m.effects !== null
  );
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as ImportTokensParams;
  if (typeof params.json !== "string" || params.json.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "json is required" } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(params.json);
  } catch (err) {
    return { type: request.type, requestId: request.json.length > 0 ? request.requestId : "", error: { code: "VALIDATION_ERROR", message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` } };
  }
  const raw = parsed as { manifests?: unknown } | unknown;
  const candidates: unknown[] = Array.isArray((raw as { manifests?: unknown[] })?.manifests)
    ? (raw as { manifests: unknown[] }).manifests
    : isManifestShape(raw) ? [raw] : [];
  if (candidates.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "No manifests found in JSON" } };
  }
  const m = candidates[0]! as DesignManifest & { manifestId?: string };
  const id = await storeManifest({
    colors: m.colors ?? {},
    textStyles: m.textStyles ?? {},
    spacing: m.spacing ?? {},
    radii: m.radii ?? {},
    effects: m.effects ?? {},
  });
  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      manifestId: id,
      colors: Object.keys(m.colors ?? {}).length,
      textStyles: Object.keys(m.textStyles ?? {}).length,
      spacing: Object.keys(m.spacing ?? {}).length,
      radii: Object.keys(m.radii ?? {}).length,
      effects: Object.keys(m.effects ?? {}).length,
    } satisfies ImportResult,
  };
}
