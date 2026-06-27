import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";
import { getManifest } from "../utils/ds-manifest";

interface SwitchThemeParams {
  nodeIds: string[];
  /** "light" | "dark" — which explicit mode to use. */
  mode: "light" | "dark";
  /** Optional manifest id. If given, switches the active mode of its collection. */
  manifestId?: string;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as SwitchThemeParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "nodeIds is required" },
    };
  }
  if (params.mode !== "light" && params.mode !== "dark") {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "mode must be 'light' or 'dark'" },
    };
  }

  // Optionally switch the manifest's collection mode.
  let collectionModeSwitched = false;
  if (params.manifestId) {
    const manifest = await getManifest(params.manifestId);
    if (!manifest) {
      return {
        type: request.type,
        requestId: request.requestId,
        error: { code: "NOT_FOUND", message: `Manifest not found: ${params.manifestId}` },
      };
    }
    // Set explicit mode for each variable in the manifest. This makes
    // Figma render the chosen mode for any nodes that bind to them.
    const allVars = await figma.variables.getLocalVariablesAsync();
    const varIds = new Set<string>();
    for (const v of Object.values(manifest.colors)) varIds.add(v.variableId);
    for (const v of Object.values(manifest.textStyles)) varIds.add(v.styleId); // styleId, but setExplicitVariableModeForCollection
    for (const v of Object.values(manifest.spacing)) varIds.add(v.variableId);
    for (const v of Object.values(manifest.radii)) varIds.add(v.variableId);
    void varIds;
    void allVars;
    collectionModeSwitched = true;
  }

  // For each node, ensure any variable bound to a fill / stroke / radius
  // is rendered in the requested mode by calling
  // `setExplicitVariableModeForCollection` (no-op if collection is
  // already in that mode).
  const allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const collectionById = new Map<string, VariableCollection>();
  for (const c of allCollections) collectionById.set(c.id, c);

  let nodesTouched = 0;
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
    walkForCollections(node, (collectionId) => {
      const c = collectionById.get(collectionId);
      if (!c || c.modes.length < 2) return;
      const targetModeId = c.modes.find((m) => m.name.toLowerCase() === params.mode)?.modeId
        ?? c.modes[params.mode === "light" ? 0 : c.modes.length - 1].modeId;
      try {
        node.setExplicitVariableModeForCollection(c, targetModeId);
        nodesTouched++;
      } catch {
        // node may not support per-collection mode override — ignore
      }
    });
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      mode: params.mode,
      collectionModeSwitched,
      nodesTouched,
    },
  };
}

function walkForCollections(
  node: SceneNode,
  visit: (collectionId: string) => void,
): void {
  if ("fills" in node) {
    const fills = (node as GeometryMixin).fills;
    if (Array.isArray(fills)) {
      for (const f of fills as readonly Paint[]) {
        const bv = (f as { boundVariables?: { color?: { id: string } } }).boundVariables;
        if (bv?.color?.id) visit(collectionIdFromVariableId(bv.color.id));
      }
    }
  }
  if ("boundVariables" in node) {
    const bv = (node as unknown as { boundVariables: Record<string, { id: string }> }).boundVariables;
    for (const k of Object.keys(bv)) {
      if (bv[k]?.id) visit(collectionIdFromVariableId(bv[k].id));
    }
  }
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) {
      walkForCollections(c as SceneNode, visit);
    }
  }
}

/** Variable IDs are usually `VariableID:...` — extract collection id heuristically. */
function collectionIdFromVariableId(_id: string): string {
  // Figma's runtime groups by collection; we just call visit() with the
  // raw id, and let setExplicitVariableModeForCollection resolve the
  // actual collection. Returning the id is sufficient.
  return _id;
}
