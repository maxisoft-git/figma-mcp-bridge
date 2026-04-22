import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode } from "../serializer";

const toHex = (r: number, g: number, b: number): string => {
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v * 255)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

function collectColorsFromNode(node: SceneNode): string[] {
  const colors: string[] = [];
  const serialized = serializeNode(node);

  if (serialized.styles?.fills && serialized.styles.fills !== "mixed") {
    for (const fill of serialized.styles.fills) {
      if (fill.type === "SOLID" && "color" in fill) {
        colors.push((fill as { color: string }).color);
      }
    }
  }

  if (serialized.styles?.strokes && serialized.styles.strokes !== "mixed") {
    for (const stroke of serialized.styles.strokes) {
      if (stroke.type === "SOLID" && "color" in stroke) {
        colors.push((stroke as { color: string }).color);
      }
    }
  }

  if (serialized.styles?.effects) {
    for (const effect of serialized.styles.effects) {
      if ("color" in effect) {
        colors.push((effect as { color: string }).color);
      }
    }
  }

  return colors;
}

function collectFromTree(node: SceneNode): string[] {
  const colors = collectColorsFromNode(node);
  if ("children" in node) {
    for (const child of (node as unknown as { children: SceneNode[] }).children) {
      colors.push(...collectFromTree(child));
    }
  }
  return colors;
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

  const allColors: string[] = [];
  for (const node of rootNodes) {
    allColors.push(...collectFromTree(node));
  }

  const uniqueColors = [...new Set(allColors)].sort();

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      totalColors: allColors.length,
      uniqueColors: uniqueColors.length,
      palette: uniqueColors,
    },
  };
}
