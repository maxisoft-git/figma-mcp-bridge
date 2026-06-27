/**
 * In-memory snapshot of mutable node state for undo support.
 *
 * Stores a JSON-serializable representation of selected fields. Snapshots
 * auto-expire after 10 minutes. Limited to N most-recent snapshots to
 * keep memory bounded.
 */

const MAX_SNAPSHOTS = 32;
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

export interface NodeSnapshot {
  nodeId: string;
  name: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fills: unknown;
  strokes: unknown;
  cornerRadius: number | null;
  textCharacters: string | null;
}

export interface Snapshot {
  id: string;
  createdAt: number;
  nodeIds: string[];
  state: NodeSnapshot[];
}

const STORE = new Map<string, Snapshot>();
let counter = 0;

function gc(): void {
  const cutoff = Date.now() - SNAPSHOT_TTL_MS;
  for (const [id, s] of STORE) {
    if (s.createdAt < cutoff) STORE.delete(id);
  }
  // bound by count
  if (STORE.size > MAX_SNAPSHOTS) {
    const sorted = [...STORE.values()].sort((a, b) => a.createdAt - b.createdAt);
    while (STORE.size > MAX_SNAPSHOTS) {
      const s = sorted.shift();
      if (!s) break;
      STORE.delete(s.id);
    }
  }
}

function snapshotNode(node: SceneNode): NodeSnapshot {
  const snap: NodeSnapshot = {
    nodeId: node.id,
    name: node.name,
    visible: (node as SceneNode & { visible?: boolean }).visible ?? true,
    x: (node as { x?: number }).x ?? 0,
    y: (node as { y?: number }).y ?? 0,
    width: (node as { width?: number }).width ?? 0,
    height: (node as { height?: number }).height ?? 0,
    rotation: (node as { rotation?: number }).rotation ?? 0,
    opacity: (node as { opacity?: number }).opacity ?? 1,
    fills: "fills" in node ? (node as GeometryMixin).fills : null,
    strokes: "strokes" in node ? (node as GeometryMixin).strokes : null,
    cornerRadius: "cornerRadius" in node ? ((node as { cornerRadius?: number }).cornerRadius ?? null) : null,
    textCharacters: node.type === "TEXT" ? (node as TextNode).characters : null,
  };
  return snap;
}

export async function createSnapshot(nodeIds: string[]): Promise<string> {
  gc();
  const state: NodeSnapshot[] = [];
  for (const id of nodeIds) {
    const n = await figma.getNodeByIdAsync(id);
    if (n) state.push(snapshotNode(n as SceneNode));
  }
  const id = `snap-${Date.now().toString(36)}-${(counter++).toString(36)}`;
  STORE.set(id, { id, createdAt: Date.now(), nodeIds, state });
  return id;
}

export async function restoreSnapshot(snapshotId: string): Promise<{ restored: number; missing: number }> {
  const snap = STORE.get(snapshotId);
  if (!snap) return { restored: 0, missing: 0 };
  let restored = 0;
  let missing = 0;
  for (const s of snap.state) {
    const n = await figma.getNodeByIdAsync(s.nodeId);
    if (!n) {
      missing++;
      continue;
    }
    try {
      (n as SceneNode & { name?: string }).name = s.name;
      if ("visible" in n) (n as SceneNode & { visible: boolean }).visible = s.visible;
      if ("x" in n) (n as unknown as { x: number }).x = s.x;
      if ("y" in n) (n as unknown as { y: number }).y = s.y;
      if ("rotation" in n) (n as unknown as { rotation: number }).rotation = s.rotation;
      if ("opacity" in n) (n as BlendMixin).opacity = s.opacity;
      if ("fills" in n) (n as GeometryMixin).fills = s.fills as unknown as readonly Paint[];
      if ("strokes" in n) (n as GeometryMixin).strokes = s.strokes as unknown as readonly Paint[];
      if ("cornerRadius" in n && s.cornerRadius != null) {
        (n as unknown as { cornerRadius: number }).cornerRadius = s.cornerRadius;
      }
      if (n.type === "TEXT" && s.textCharacters != null) {
        (n as TextNode).characters = s.textCharacters;
      }
      restored++;
    } catch {
      missing++;
    }
  }
  return { restored, missing };
}

export function listSnapshots(): Array<{ id: string; createdAt: number; nodeCount: number }> {
  gc();
  return [...STORE.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => ({ id: s.id, createdAt: s.createdAt, nodeCount: s.nodeIds.length }));
}

export function deleteSnapshot(snapshotId: string): boolean {
  return STORE.delete(snapshotId);
}
