import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface DiffParams {
  /** Two node ids whose frames will be compared. */
  nodeIdA: string;
  nodeIdB: string;
  /** When true, recurse into children that share the same name. */
  recurse?: boolean;
}

interface FrameDiff {
  path: string;
  prop: string;
  from: unknown;
  to: unknown;
}

interface DiffResult {
  diffs: FrameDiff[];
  totalCount: number;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as DiffParams;
  if (!params.nodeIdA || !params.nodeIdB) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIdA and nodeIdB are required" } };
  }
  const recurse = params.recurse ?? true;
  let a: SceneNode, b: SceneNode;
  try {
    a = await resolveNode(params.nodeIdA);
    b = await resolveNode(params.nodeIdB);
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
  }

  const diffs: FrameDiff[] = [];
  diffNode(a, b, "", diffs);
  return {
    type: request.type,
    requestId: request.requestId,
    data: { diffs: diffs.slice(0, 200), totalCount: diffs.length },
  };
}

function diffNode(
  a: SceneNode,
  b: SceneNode,
  path: string,
  diffs: FrameDiff[],
): void {
  const props = [
    "name", "x", "y", "rotation", "opacity",
    "layoutMode", "primaryAxisSizingMode", "counterAxisSizingMode",
    "itemSpacing", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
  ];
  for (const p of props) {
    const va = (a as unknown as Record<string, unknown>)[p];
    const vb = (b as unknown as Record<string, unknown>)[p];
    if (va !== vb) {
      diffs.push({ path: path ? `${path}` : "/", prop: p, from: va, to: vb });
    }
  }
  if (!("children" in a) || !("children" in b)) return;
  const aChildren = (a as ChildrenMixin).children as SceneNode[];
  const bChildren = (b as ChildrenMixin).children as SceneNode[];
  const aByName = new Map(aChildren.map((c) => [c.name, c] as const));
  const bByName = new Map(bChildren.map((c) => [c.name, c] as const));
  for (const [name, aChild] of aByName) {
    const bChild = bByName.get(name);
    if (bChild) {
      diffNode(aChild, bChild, `${path}/${name}`, diffs);
    } else {
      diffs.push({ path: `${path}/${name}`, prop: "removed", from: aChild.id, to: null });
    }
  }
  for (const [name] of bByName) {
    if (!aByName.has(name)) {
      diffs.push({ path: `${path}/${name}`, prop: "added", from: null, to: "new" });
    }
  }
}
