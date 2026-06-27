import type { ServerRequest, PluginResponse } from "../types";

export async function handle(_request: ServerRequest): Promise<PluginResponse> {
  const sel = figma.currentPage.selection;
  const chain: Array<{ id: string; name: string; type: string }> = [];
  if (sel.length > 0) {
    let cur: SceneNode | null = sel[0]!;
    while (cur) {
      chain.push({ id: cur.id, name: cur.name, type: cur.type });
      cur = (cur.parent as SceneNode | null) ?? null;
    }
  }
  return { type: _request.type, requestId: _request.requestId, data: { chain, selectionCount: sel.length } };
}
