import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode } from "../serializer";

function gcd(a: number, b: number): number {
  a = Math.round(a * 100);
  b = Math.round(b * 100);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a / 100;
}

function collectSpacingFromTree(node: SceneNode): number[] {
  const spacings: number[] = [];
  const serialized = serializeNode(node);

  if (serialized.styles?.padding) {
    const p = serialized.styles.padding;
    spacings.push(p.top, p.right, p.bottom, p.left);
  }

  if (serialized.styles?.autoLayout) {
    const al = serialized.styles.autoLayout;
    spacings.push(al.gap);
    if (al.counterAxisSpacing !== undefined) {
      spacings.push(al.counterAxisSpacing);
    }
  }

  if ("children" in node) {
    for (const child of (node as unknown as { children: SceneNode[] }).children) {
      spacings.push(...collectSpacingFromTree(child));
    }
  }

  return spacings;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  let rootNodes: SceneNode[];

  if (request.nodeIds && request.nodeIds.length > 0) {
    rootNodes = await Promise.all(
      request.nodeIds.map((id) => figma.getNodeByIdAsync(id))
    ).then((nodes) =>
      nodes.filter(
        (n): n is SceneNode =>
          n !== null && n.type !== "DOCUMENT" && n.type !== "PAGE"
      )
    );
  } else {
    rootNodes = [...figma.currentPage.selection];
  }

  if (rootNodes.length === 0) {
    rootNodes = [figma.currentPage as unknown as SceneNode];
  }

  const allSpacings: number[] = [];
  for (const node of rootNodes) {
    allSpacings.push(...collectSpacingFromTree(node));
  }

  const unique = [...new Set(allSpacings.filter((s) => s > 0))].sort((a, b) => a - b);

  let baseUnit: number | null = null;
  if (unique.length > 0) {
    let currentGcd = unique[0];
    for (let i = 1; i < unique.length; i++) {
      currentGcd = gcd(currentGcd, unique[i]);
    }
    baseUnit = Math.round(currentGcd * 100) / 100;
  }

  const multiples = baseUnit
    ? unique.map((s) => Math.round((s / baseUnit) * 100) / 100)
    : [];

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      totalSpacingValues: allSpacings.length,
      uniqueValues: unique,
      baseUnit,
      multiples,
    },
  };
}
