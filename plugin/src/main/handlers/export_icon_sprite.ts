import type { ServerRequest, PluginResponse } from "../types";
import { validationError } from "../errors";

const DEFAULT_NAME_PATTERN = /^(icon|ic[-_/])/i;
const DEFAULT_MAX_ICONS = 1000;
const DEFAULT_CONCURRENCY = 16;

type Scope = "page" | "selection" | "document";

interface SizeFilter {
  width: number;
  tolerance?: number;
}

interface ExportIconSpriteParams {
  scope?: Scope;
  pageId?: string;
  namePattern?: string;
  sizeFilter?: SizeFilter;
  includeHidden?: boolean;
  maxIcons?: number;
}

interface ExportedIcon {
  nodeId: string;
  name: string;
  width: number;
  height: number;
  svg: string;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as ExportIconSpriteParams;
  const scope = (params.scope ?? "page") as Scope;
  if (scope !== "page" && scope !== "selection" && scope !== "document") {
    throw validationError(`Invalid scope: ${scope}. Use 'page' | 'selection' | 'document'.`);
  }

  let pattern: RegExp;
  if (params.namePattern) {
    try {
      pattern = new RegExp(params.namePattern, "i");
    } catch (err) {
      throw validationError(`Invalid namePattern regex: ${(err as Error).message}`);
    }
  } else {
    pattern = DEFAULT_NAME_PATTERN;
  }

  const includeHidden = params.includeHidden === true;
  const maxIcons = typeof params.maxIcons === "number" && params.maxIcons > 0 ? params.maxIcons : DEFAULT_MAX_ICONS;
  const sizeFilter = params.sizeFilter;

  const roots: SceneNode[] = [];
  if (scope === "selection") {
    roots.push(...(figma.currentPage.selection as SceneNode[]));
  } else if (scope === "document") {
    for (const page of figma.root.children) {
      if (!includeHidden && page.visible === false) continue;
      roots.push(page as unknown as SceneNode);
    }
  } else {
    if (params.pageId) {
      const page = await figma.getNodeByIdAsync(params.pageId);
      if (!page || page.type !== "PAGE") {
        throw validationError(`Page not found: ${params.pageId}`);
      }
      roots.push(page as unknown as SceneNode);
    } else {
      roots.push(figma.currentPage as unknown as SceneNode);
    }
  }

  const candidates: SceneNode[] = [];
  for (const root of roots) {
    walk(root, (n) => {
      if (candidates.length >= maxIcons) return;
      if (!includeHidden && (n as SceneNode).visible === false) return;
      if (!pattern.test(n.name)) return;
      if (!isIconShape(n)) return;
      if (sizeFilter && !sizeMatches(n, sizeFilter)) return;
      candidates.push(n);
    });
  }

  const exported = await exportConcurrently(candidates, DEFAULT_CONCURRENCY);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      scope,
      totalFound: exported.length,
      truncated: candidates.length >= maxIcons,
      icons: exported,
    },
  };
}

function walk(node: SceneNode, visit: (n: SceneNode) => void): void {
  visit(node);
  if ("children" in node) {
    for (const child of (node as ChildrenMixin).children) {
      walk(child as SceneNode, visit);
    }
  }
}

function isIconShape(node: SceneNode): boolean {
  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") return true;
  if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
    const children = (node as FrameNode).children;
    if (children.length === 0) return false;
    for (const c of children) {
      if (c.type !== "VECTOR" && c.type !== "BOOLEAN_OPERATION") return false;
    }
    return true;
  }
  return false;
}

function sizeMatches(node: SceneNode, filter: SizeFilter): boolean {
  const tolerance = filter.tolerance ?? 1;
  const w = (node as SceneNode).width;
  const h = (node as SceneNode).height;
  return (
    Math.abs(w - filter.width) <= tolerance && Math.abs(h - filter.width) <= tolerance
  );
}

async function exportConcurrently(
  nodes: SceneNode[],
  concurrency: number,
): Promise<ExportedIcon[]> {
  const results: ExportedIcon[] = new Array(nodes.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= nodes.length) return;
      const node = nodes[idx]!;
      try {
        const svg = await (node as SceneNode & { exportAsync: (s: ExportSettings) => Promise<string> }).exportAsync({
          format: "SVG_STRING",
        });
        results[idx] = {
          nodeId: node.id,
          name: node.name,
          width: node.width,
          height: node.height,
          svg,
        };
      } catch (err) {
        // Skip nodes that fail to export (e.g. unsupported geometry).
        results[idx] = {
          nodeId: node.id,
          name: node.name,
          width: node.width,
          height: node.height,
          svg: `<!-- export failed: ${(err as Error).message} -->`,
        };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, nodes.length) }, () => worker());
  await Promise.all(workers);
  return results.filter((r): r is ExportedIcon => r !== undefined);
}
