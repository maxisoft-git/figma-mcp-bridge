import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface UpdateInstancesParams {
  /** Master component id to derive overrides from. */
  masterId: string;
  /**
   * Map of override key → new value. Key formats:
   *   "text:<instance-name>"       → sets characters on TEXT node with that name
   *   "fill:<instance-name>"        → sets fills on node with that name
   *   "opacity:<instance-name>"     → sets opacity
   *   "rotation:<instance-name>"    → sets rotation
   *   "visible:<instance-name>"      → sets visibility
   *   "<name>"                       → shortcut for text:<name>
   */
  overrides: Record<string, string | number | boolean>;
  /** Optional explicit list of instance ids to update. If empty → all instances of masterId on current page. */
  instanceIds?: string[];
  dryRun?: boolean;
}

interface UpdateResult {
  instancesScanned: number;
  instancesUpdated: number;
  changes: Array<{ instanceId: string; key: string; from: string; to: string }>;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as UpdateInstancesParams;
  if (!params.masterId) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "masterId is required" },
    };
  }
  if (!params.overrides || Object.keys(params.overrides).length === 0) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "overrides is required (at least one entry)" },
    };
  }
  const dryRun = params.dryRun ?? false;
  let master: ComponentNode | null = null;
  try {
    const n = await resolveNode(params.masterId);
    if (n.type !== "COMPONENT") {
      return {
        type: request.type,
        requestId: request.requestId,
        error: { code: "VALIDATION_ERROR", message: `masterId is not a COMPONENT (got ${n.type})` },
      };
    }
    master = n as ComponentNode;
  } catch (err) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) },
    };
  }

  // Resolve target instances.
  let targets: InstanceNode[];
  if (params.instanceIds && params.instanceIds.length > 0) {
    targets = [];
    for (const id of params.instanceIds) {
      const n = await figma.getNodeByIdAsync(id);
      if (n?.type === "INSTANCE") targets.push(n as InstanceNode);
    }
  } else {
    targets = figma.currentPage.findAllWithCriteria({
      types: ["INSTANCE"],
    }).filter((n): n is InstanceNode => n.type === "INSTANCE" && n.mainComponent?.id === master.id);
  }

  const result: UpdateResult = { instancesScanned: targets.length, instancesUpdated: 0, changes: [] };
  for (const inst of targets) {
    let touched = false;
    for (const [rawKey, value] of Object.entries(params.overrides)) {
      const { kind, name } = parseKey(rawKey);
      const target = inst.findOne((n) => n.name === name);
      if (!target) continue;
      const ok = applyOverride(target, kind, value, dryRun);
      if (ok.changed) {
        touched = true;
        if (result.changes.length < 50) {
          result.changes.push({ instanceId: inst.id, key: rawKey, from: ok.from, to: ok.to });
        }
      }
    }
    if (touched) result.instancesUpdated++;
  }
  return { type: request.type, requestId: request.requestId, data: { ...result, dryRun } };
}

function parseKey(raw: string): { kind: "text" | "fill" | "opacity" | "rotation" | "visible"; name: string } {
  const i = raw.indexOf(":");
  if (i === -1) return { kind: "text", name: raw };
  const head = raw.slice(0, i).toLowerCase();
  const name = raw.slice(i + 1);
  if (head === "fill") return { kind: "fill", name };
  if (head === "opacity") return { kind: "opacity", name };
  if (head === "rotation") return { kind: "rotation", name };
  if (head === "visible") return { kind: "visible", name };
  return { kind: "text", name: raw };
}

function applyOverride(
  node: SceneNode,
  kind: "text" | "fill" | "opacity" | "rotation" | "visible",
  value: string | number | boolean,
  dryRun: boolean,
): { changed: boolean; from: string; to: string } {
  if (kind === "text" && node.type === "TEXT") {
    const before = node.characters;
    if (before === value) return { changed: false, from: before, to: String(value) };
    if (!dryDryRunSafe(dryRun)) {
      try {
        node.characters = String(value);
      } catch {
        return { changed: false, from: before, to: String(value) };
      }
    }
    return { changed: true, from: before, to: String(value) };
  }
  if (kind === "fill" && "fills" in node) {
    const before = JSON.stringify((node as GeometryMixin).fills);
    const after = [{ type: "SOLID" as const, color: hexToRgb(String(value)) }];
    if (!dryDryRunSafe(dryRun)) {
      try {
        (node as GeometryMixin).fills = after as unknown as Paint[];
      } catch {
        return { changed: false, from: before, to: JSON.stringify(after) };
      }
    }
    return { changed: true, from: before, to: JSON.stringify(after) };
  }
  if (kind === "opacity" && "opacity" in node) {
    const before = (node as BlendMixin).opacity;
    const n = Number(value);
    if (!dryDryRunSafe(dryRun)) {
      try {
        (node as BlendMixin).opacity = n;
      } catch {
        return { changed: false, from: String(before), to: String(n) };
      }
    }
    return { changed: true, from: String(before), to: String(n) };
  }
  if (kind === "rotation" && "rotation" in node) {
    const before = (node as SceneNode & { rotation: number }).rotation;
    const n = Number(value);
    if (!dryDryRunSafe(dryRun)) {
      try {
        (node as unknown as { rotation: number }).rotation = n;
      } catch {
        return { changed: false, from: String(before), to: String(n) };
      }
    }
    return { changed: true, from: String(before), to: String(n) };
  }
  if (kind === "visible" && "visible" in node) {
    const before = (node as SceneNode & { visible: boolean }).visible;
    const v = Boolean(value);
    if (!dryDryRunSafe(dryRun)) {
      try {
        (node as unknown as { visible: boolean }).visible = v;
      } catch {
        return { changed: false, from: String(before), to: String(v) };
      }
    }
    return { changed: true, from: String(before), to: String(v) };
  }
  return { changed: false, from: "", to: String(value) };
}

function dryDryRunSafe(dryRun: boolean): boolean {
  return dryRun;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}
