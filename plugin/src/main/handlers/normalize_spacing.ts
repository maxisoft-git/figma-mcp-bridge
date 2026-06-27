import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";
import { getManifest } from "../utils/ds-manifest";
import { valueToSemantic } from "../utils/ds-semantic";

type Strategy = "grid" | "manifest" | "semantic";

interface NormalizeSpacingParams {
  nodeIds: string[];
  /** "grid" snaps to Tailwind scale; "manifest" snaps to values in the design system; "semantic" rewrites bound variables to nearest semantic alias. */
  strategy: Strategy;
  /** Grid step for "grid" strategy. Default 4. */
  gridStep?: number;
  /** Tolerance for "manifest" / "semantic" snap. Default 2px. */
  tolerance?: number;
  /** Manifest id for "manifest" / "semantic" strategies. */
  manifestId?: string;
  /** When true (default false) only report changes without applying. */
  dryRun?: boolean;
}

interface SpacingChange {
  nodeId: string;
  field: "paddingTop" | "paddingBottom" | "paddingLeft" | "paddingRight" | "itemSpacing" | "counterAxisSpacing";
  from: number;
  to: number;
  semantic?: string;
}

function snapToGrid(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function snapToValue(value: number, candidates: number[], tolerance: number): number {
  let best = value;
  let bestDelta = tolerance + 1;
  for (const c of candidates) {
    const delta = Math.abs(value - c);
    if (delta < bestDelta) {
      best = c;
      bestDelta = delta;
    }
  }
  return bestDelta <= tolerance ? best : value;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as NormalizeSpacingParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "nodeIds is required" },
    };
  }
  if (!["grid", "manifest", "semantic"].includes(params.strategy)) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "strategy must be 'grid' | 'manifest' | 'semantic'" },
    };
  }
  if ((params.strategy === "manifest" || params.strategy === "semantic") && !params.manifestId) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "manifestId is required for 'manifest' / 'semantic' strategy" },
    };
  }

  const tolerance = params.tolerance ?? 2;
  const dryRun = params.dryRun ?? false;
  const gridStep = params.gridStep ?? 4;

  const manifest = params.manifestId ? await getManifest(params.manifestId) : null;
  if ((params.strategy === "manifest" || params.strategy === "semantic") && !manifest) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "NOT_FOUND", message: `Manifest not found: ${params.manifestId}` },
    };
  }

  // Collect candidate values from manifest for "manifest" snap.
  const candidates: number[] = [];
  if (manifest) {
    for (const v of Object.values(manifest.spacing)) {
      candidates.push(v.value);
    }
  }

  const changes: SpacingChange[] = [];
  let applied = 0;
  let skipped = 0;

  const fields: Array<SpacingChange["field"]> = [
    "paddingTop",
    "paddingBottom",
    "paddingLeft",
    "paddingRight",
    "itemSpacing",
  ];

  for (const nodeId of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(nodeId);
    } catch (err) {
      return {
        type: request.type,
        requestId: request.requestId,
        error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) },
      };
    }
    applyToNode(node, fields, params.strategy, gridStep, tolerance, candidates, manifest, dryRun, changes, () => applied++, () => skipped++);
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: { changed: changes.length, applied, skipped, changes: changes.slice(0, 50), dryRun },
  };
}

function applyToNode(
  node: SceneNode,
  fields: SpacingChange["field"][],
  strategy: Strategy,
  gridStep: number,
  tolerance: number,
  candidates: number[],
  manifest: ReturnType<typeof getManifest> | null,
  dryRun: boolean,
  changes: SpacingChange[],
  onApplied: () => void,
  onSkipped: () => void,
): void {
  // Only nodes that can be auto-layout frames have these fields.
  if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "INSTANCE") return;
  if (!("layoutMode" in node) || (node as FrameNode).layoutMode === "NONE") return;
  const f = node as FrameNode;

  for (const field of fields) {
    const current = f[field] as number;
    let next: number;
    if (strategy === "grid") {
      next = snapToGrid(current, gridStep);
    } else if (strategy === "manifest") {
      next = snapToValue(current, candidates, tolerance);
    } else {
      // semantic
      const { name, px } = valueToSemantic(current);
      next = Math.abs(px - current) <= tolerance ? px : current;
      if (next !== current) {
        changes.push({ nodeId: node.id, field, from: current, to: next, semantic: name });
        if (!dryRun) {
          try {
            (f as unknown as Record<string, number>)[field] = next;
            onApplied();
          } catch {
            onSkipped();
          }
        } else {
          onApplied();
        }
        continue;
      }
    }
    if (next !== current) {
      changes.push({ nodeId: node.id, field, from: current, to: next });
      if (!dryRun) {
        try {
          (f as unknown as Record<string, number>)[field] = next;
          onApplied();
        } catch {
          onSkipped();
        }
      } else {
        onApplied();
      }
    }
  }
}
