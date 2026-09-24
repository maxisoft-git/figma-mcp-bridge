import type { PluginResponse, ServerRequest } from "../types";
import { buildHtml, cssFor, resolveNode } from "../utils/dev-mode";

type Asset = {
  nodeId: string;
  name: string;
  kind: "image-fill" | "vector";
  imageHash?: string;
  scaleMode?: string;
};

type TextStyle = {
  nodeId: string;
  text: string;
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
  lineHeight?: { value?: number; unit: string };
  letterSpacing?: { value?: number; unit: string };
  textAlignHorizontal?: string;
  textAlignVertical?: string;
};

type LayoutNode = {
  nodeId: string;
  name: string;
  type: string;
  width: number;
  height: number;
  positioning?: "AUTO" | "ABSOLUTE";
  layout?: {
    direction: "HORIZONTAL" | "VERTICAL";
    gap: number;
    padding: { top: number; right: number; bottom: number; left: number };
    primaryAxisAlign: string;
    counterAxisAlign: string;
    primaryAxisSizing: string;
    counterAxisSizing: string;
  };
  children?: LayoutNode[];
};

const isContainer = (node: SceneNode): node is FrameNode | ComponentNode | InstanceNode =>
  node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE";

const hasChildren = (node: SceneNode): node is SceneNode & ChildrenMixin => "children" in node;

const imageFills = (node: SceneNode): ImagePaint[] => {
  if (!("fills" in node) || !Array.isArray(node.fills)) return [];
  return node.fills.filter(
    (paint): paint is ImagePaint => paint.type === "IMAGE" && paint.visible !== false && Boolean(paint.imageHash),
  );
};

function collectDetails(
  node: SceneNode,
  depth: number,
  maxDepth: number,
  assets: Asset[],
  typography: TextStyle[],
  warnings: string[],
): LayoutNode {
  for (const fill of imageFills(node)) {
    assets.push({
      nodeId: node.id,
      name: node.name,
      kind: "image-fill",
      imageHash: fill.imageHash ?? undefined,
      scaleMode: fill.scaleMode,
    });
  }
  if (node.type === "VECTOR") {
    assets.push({ nodeId: node.id, name: node.name, kind: "vector" });
  }

  if (node.type === "TEXT") {
    const text = node as TextNode;
    const font = text.fontName === figma.mixed ? undefined : text.fontName;
    typography.push({
      nodeId: text.id,
      text: text.characters,
      fontFamily: font?.family,
      fontStyle: font?.style,
      fontSize: typeof text.fontSize === "number" ? text.fontSize : undefined,
      lineHeight: text.lineHeight === figma.mixed ? undefined : text.lineHeight,
      letterSpacing: text.letterSpacing === figma.mixed ? undefined : text.letterSpacing,
      textAlignHorizontal: text.textAlignHorizontal,
      textAlignVertical: text.textAlignVertical,
    });
  }

  const result: LayoutNode = {
    nodeId: node.id,
    name: node.name,
    type: node.type,
    width: node.width,
    height: node.height,
  };

  if (isContainer(node)) {
    result.positioning = node.layoutPositioning;
    if (node.layoutMode !== "NONE") {
      result.layout = {
        direction: node.layoutMode,
        gap: node.itemSpacing,
        padding: {
          top: node.paddingTop,
          right: node.paddingRight,
          bottom: node.paddingBottom,
          left: node.paddingLeft,
        },
        primaryAxisAlign: node.primaryAxisAlignItems,
        counterAxisAlign: node.counterAxisAlignItems,
        primaryAxisSizing: node.primaryAxisSizingMode,
        counterAxisSizing: node.counterAxisSizingMode,
      };
    }
  }

  if (hasChildren(node) && depth < maxDepth) {
    result.children = node.children.map((child) => {
      if (child.width > node.width) {
        warnings.push(`Child "${child.name}" (${child.id}) is wider than parent "${node.name}".`);
      }
      if (child.height > node.height) {
        warnings.push(`Child "${child.name}" (${child.id}) is taller than parent "${node.name}".`);
      }
      return collectDetails(child as SceneNode, depth + 1, maxDepth, assets, typography, warnings);
    });
  }
  return result;
}

/**
 * Produce a compact, implementation-oriented representation of a Figma node.
 * Raw node data stays available through get_node; this handler prioritises the
 * pieces an engineer needs to reproduce and debug a layout.
 */
export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const node = await resolveNode(request.nodeIds?.[0]);
  const maxDepth = typeof request.params?.maxDepth === "number" ? request.params.maxDepth : 4;
  const includeHtml = request.params?.includeHtml !== false;
  const includeCss = request.params?.includeCss !== false;
  const assets: Asset[] = [];
  const typography: TextStyle[] = [];
  const warnings: string[] = [];
  const layout = collectDetails(node, 0, maxDepth, assets, typography, warnings);

  const [css, html] = await Promise.all([
    includeCss ? cssFor(node) : Promise.resolve(undefined),
    includeHtml ? buildHtml(node) : Promise.resolve(undefined),
  ]);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      node: { id: node.id, name: node.name, type: node.type, width: node.width, height: node.height },
      layout,
      typography,
      assets,
      warnings,
      css,
      html: html?.html,
      htmlTruncated: html?.truncated,
      htmlNodesVisited: html?.visited,
      assetRetrieval: "Use get_image for bitmap exports and get_dev_svg for vector exports by nodeId.",
    },
  };
}
