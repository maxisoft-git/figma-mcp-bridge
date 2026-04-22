import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById } from "../utils";

type Alignment = "left" | "center_h" | "right" | "top" | "center_v" | "bottom" | "distribute_h" | "distribute_v";

const ALIGNMENTS: Alignment[] = ["left", "center_h", "right", "top", "center_v", "bottom", "distribute_h", "distribute_v"];

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  if (!request.nodeIds || request.nodeIds.length < 2) {
    throw new Error("nodeIds must contain at least 2 nodes for align_nodes");
  }
  const alignment = request.params?.alignment;
  if (!ALIGNMENTS.includes(alignment as Alignment)) {
    throw new Error(`alignment is required. Valid values: ${ALIGNMENTS.join(", ")}`);
  }

  const nodes = await Promise.all(request.nodeIds.map((id) => getSceneNodeById(id)));

  const boxes = nodes.map((n) => ({
    x: "x" in n ? (n.x as number) : 0,
    y: "y" in n ? (n.y as number) : 0,
    width: "width" in n ? (n.width as number) : 0,
    height: "height" in n ? (n.height as number) : 0,
    node: n,
  }));

  const results: Array<{ nodeId: string; x: number; y: number }> = [];

  switch (alignment as Alignment) {
    case "left": {
      const minX = Math.min(...boxes.map((b) => b.x));
      for (const b of boxes) {
        b.node.x = minX;
        results.push({ nodeId: b.node.id, x: b.node.x as number, y: b.node.y as number });
      }
      break;
    }
    case "right": {
      const maxRight = Math.max(...boxes.map((b) => b.x + b.width));
      for (const b of boxes) {
        b.node.x = maxRight - b.width;
        results.push({ nodeId: b.node.id, x: b.node.x as number, y: b.node.y as number });
      }
      break;
    }
    case "center_h": {
      const minX = Math.min(...boxes.map((b) => b.x));
      const maxRight = Math.max(...boxes.map((b) => b.x + b.width));
      const centerX = (minX + maxRight) / 2;
      for (const b of boxes) {
        b.node.x = centerX - b.width / 2;
        results.push({ nodeId: b.node.id, x: b.node.x as number, y: b.node.y as number });
      }
      break;
    }
    case "top": {
      const minY = Math.min(...boxes.map((b) => b.y));
      for (const b of boxes) {
        b.node.y = minY;
        results.push({ nodeId: b.node.id, x: b.node.x as number, y: b.node.y as number });
      }
      break;
    }
    case "bottom": {
      const maxBottom = Math.max(...boxes.map((b) => b.y + b.height));
      for (const b of boxes) {
        b.node.y = maxBottom - b.height;
        results.push({ nodeId: b.node.id, x: b.node.x as number, y: b.node.y as number });
      }
      break;
    }
    case "center_v": {
      const minY = Math.min(...boxes.map((b) => b.y));
      const maxBottom = Math.max(...boxes.map((b) => b.y + b.height));
      const centerY = (minY + maxBottom) / 2;
      for (const b of boxes) {
        b.node.y = centerY - b.height / 2;
        results.push({ nodeId: b.node.id, x: b.node.x as number, y: b.node.y as number });
      }
      break;
    }
    case "distribute_h": {
      if (boxes.length < 3) {
        throw new Error("distribute_h requires at least 3 nodes");
      }
      const sorted = [...boxes].sort((a, b) => a.x - b.x);
      const leftEdge = sorted[0].x;
      const rightEdge = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width;
      const totalWidth = sorted.reduce((sum, b) => sum + b.width, 0);
      const gap = (rightEdge - leftEdge - totalWidth) / (sorted.length - 1);
      let currentX = leftEdge;
      for (const b of sorted) {
        b.node.x = currentX;
        results.push({ nodeId: b.node.id, x: currentX, y: b.node.y as number });
        currentX += b.width + gap;
      }
      break;
    }
    case "distribute_v": {
      if (boxes.length < 3) {
        throw new Error("distribute_v requires at least 3 nodes");
      }
      const sorted = [...boxes].sort((a, b) => a.y - b.y);
      const topEdge = sorted[0].y;
      const bottomEdge = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
      const totalHeight = sorted.reduce((sum, b) => sum + b.height, 0);
      const gap = (bottomEdge - topEdge - totalHeight) / (sorted.length - 1);
      let currentY = topEdge;
      for (const b of sorted) {
        b.node.y = currentY;
        results.push({ nodeId: b.node.id, x: b.node.x as number, y: currentY });
        currentY += b.height + gap;
      }
      break;
    }
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: { alignment, alignedCount: results.length, results },
  };
}
