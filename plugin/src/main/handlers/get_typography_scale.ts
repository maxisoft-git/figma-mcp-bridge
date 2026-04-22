import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode } from "../serializer";

type TypographyEntry = {
  fontFamily: string;
  fontStyle: string;
  fontSizes: number[];
  count: number;
};

function collectFromTree(node: SceneNode): Array<{ fontFamily?: string; fontStyle?: string; fontSize?: number | string }> {
  const entries: Array<{ fontFamily?: string; fontStyle?: string; fontSize?: number | string }> = [];

  const serialized = serializeNode(node);
  if (node.type === "TEXT") {
    const styles = serialized.styles;
    if (styles) {
      entries.push({
        fontFamily: (styles as Record<string, unknown>).fontFamily as string | undefined,
        fontStyle: (styles as Record<string, unknown>).fontStyle as string | undefined,
        fontSize: (styles as Record<string, unknown>).fontSize as number | string | undefined,
      });
    }
  }

  if ("children" in node) {
    for (const child of (node as unknown as { children: SceneNode[] }).children) {
      entries.push(...collectFromTree(child));
    }
  }

  return entries;
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

  const allEntries: Array<{ fontFamily?: string; fontStyle?: string; fontSize?: number | string }> = [];
  for (const node of rootNodes) {
    allEntries.push(...collectFromTree(node));
  }

  const fontMap = new Map<string, TypographyEntry>();
  for (const entry of allEntries) {
    if (!entry.fontFamily || entry.fontFamily === "mixed") continue;
    const key = `${entry.fontFamily}::${entry.fontStyle ?? "Regular"}`;
    const existing = fontMap.get(key);
    const size = typeof entry.fontSize === "number" ? entry.fontSize : undefined;
    if (existing) {
      existing.count++;
      if (size && !existing.fontSizes.includes(size)) {
        existing.fontSizes.push(size);
      }
    } else {
      fontMap.set(key, {
        fontFamily: entry.fontFamily,
        fontStyle: entry.fontStyle ?? "Regular",
        fontSizes: size ? [size] : [],
        count: 1,
      });
    }
  }

  const scale = [...fontMap.values()].map((entry) => ({
    ...entry,
    fontSizes: entry.fontSizes.sort((a, b) => a - b),
  }));

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      textNodeCount: allEntries.length,
      fontFamilies: scale.length,
      scale,
    },
  };
}
