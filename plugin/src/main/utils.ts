import { PLUGIN_VERSION } from "./version";

export const parseHexColor = (hex: string): RGB => {
  const normalized = hex.trim().replace(/^#/, "");
  if (normalized.length !== 3 && normalized.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  return {
    r: parseInt(expanded.slice(0, 2), 16) / 255,
    g: parseInt(expanded.slice(2, 4), 16) / 255,
    b: parseInt(expanded.slice(4, 6), 16) / 255,
  };
};

export const isSceneNode = (node: BaseNode | null): node is SceneNode =>
  node !== null && node.type !== "DOCUMENT" && node.type !== "PAGE";

export const isTextNode = (node: BaseNode | null): node is TextNode =>
  node !== null && node.type === "TEXT";

export const getSceneNodeById = async (nodeId: string): Promise<SceneNode> => {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!isSceneNode(node)) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  return node;
};

export const getTextNodeById = async (nodeId: string): Promise<TextNode> => {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!isTextNode(node)) {
    throw new Error(`Text node not found: ${nodeId}`);
  }
  return node;
};

export const supportsChildren = (node: BaseNode): node is BaseNode & ChildrenMixin =>
  "appendChild" in node;

export const getParentNodeById = async (
  parentId: string
): Promise<BaseNode & ChildrenMixin> => {
  const parent = await figma.getNodeByIdAsync(parentId);
  if (!parent || parent.type === "DOCUMENT" || !supportsChildren(parent)) {
    throw new Error(`Parent does not support children: ${parentId}`);
  }
  return parent;
};

export const setSolidFill = (
  node: SceneNode,
  fillHex: string,
  fillOpacity?: number
): void => {
  if (!("fills" in node)) {
    throw new Error(`Node does not support fills: ${node.id}`);
  }

  node.fills = [
    {
      type: "SOLID",
      color: parseHexColor(fillHex),
      opacity: fillOpacity ?? 1,
    },
  ];
};

export const applyTextFill = (
  node: TextNode,
  fillHex: string,
  fillOpacity?: number
): void => {
  node.fills = [
    {
      type: "SOLID",
      color: parseHexColor(fillHex),
      opacity: fillOpacity ?? 1,
    },
  ];
};

export const loadFontsForTextNode = async (node: TextNode): Promise<void> => {
  const fonts = new Map<string, FontName>();

  if (node.characters.length > 0) {
    for (const font of node.getRangeAllFontNames(0, node.characters.length)) {
      fonts.set(`${font.family}::${font.style}`, font);
    }
  } else if (typeof node.fontName !== "symbol") {
    fonts.set(`${node.fontName.family}::${node.fontName.style}`, node.fontName);
  } else {
    throw new Error(
      `Cannot determine font for empty mixed-font text node: ${node.id}`
    );
  }

  await Promise.all([...fonts.values()].map((font) => figma.loadFontAsync(font)));
};

export const ensureFont = async (family: string, style: string): Promise<FontName> => {
  const font: FontName = { family, style };
  await figma.loadFontAsync(font);
  return font;
};

export const positionNode = (
  node: SceneNode,
  x: unknown,
  y: unknown
): void => {
  if ("x" in node && typeof x === "number") {
    node.x = x;
  }
  if ("y" in node && typeof y === "number") {
    node.y = y;
  }
};

export const resizeNodeIfSupported = (
  node: SceneNode,
  width: unknown,
  height: unknown
): void => {
  if (
    typeof width !== "number" &&
    typeof height !== "number"
  ) {
    return;
  }
  if (!("resize" in node) || typeof node.resize !== "function") {
    throw new Error(`Node does not support resizing: ${node.id}`);
  }
  const nextWidth = typeof width === "number" ? width : node.width;
  const nextHeight = typeof height === "number" ? height : node.height;
  node.resize(nextWidth, nextHeight);
};

export const appendToParentIfProvided = async (
  node: SceneNode,
  parentId: unknown
): Promise<void> => {
  if (typeof parentId !== "string") {
    return;
  }
  const parent = await getParentNodeById(parentId);
  parent.appendChild(node);
};

export const decodeBase64ToBytes = (base64: string): Uint8Array => {
  try {
    return figma.base64Decode(base64);
  } catch {
    throw new Error("Invalid base64 image payload");
  }
};

export const getFileKey = (): string => {
  try {
    if (typeof figma.fileKey === "string" && figma.fileKey) {
      return figma.fileKey;
    }
  } catch {
    // fileKey may not be available in all contexts
  }
  return figma.root.name;
};

export const sendStatus = () => {
  figma.ui.postMessage({
    type: "plugin-status",
    payload: {
      fileName: figma.root.name,
      fileKey: getFileKey(),
      selectionCount: figma.currentPage.selection.length,
      pluginVersion: PLUGIN_VERSION,
    },
  });
};

export type PropRule<TNode extends SceneNode = SceneNode> = {
  key: string;
  guard: (value: unknown) => boolean;
  capability?: (node: TNode) => boolean;
  apply: (node: TNode, value: unknown) => void;
};

export class PropertyApplicationError extends Error {
  constructor(
    public readonly nodeId: string,
    public readonly property: string,
    message: string,
  ) {
    super(message);
    this.name = "PropertyApplicationError";
  }
}

export function applyProps<TNode extends SceneNode>(
  node: TNode,
  params: Record<string, unknown>,
  rules: PropRule<TNode>[],
  applied: Record<string, unknown>,
): void {
  for (const rule of rules) {
    const value = params[rule.key];
    if (value === undefined) continue;
    if (!rule.guard(value)) continue;
    if (rule.capability && !rule.capability(node)) {
      throw new PropertyApplicationError(
        node.id,
        rule.key,
        `Node does not support ${rule.key}: ${node.id}`,
      );
    }
    rule.apply(node, value);
    const next = (node as unknown as Record<string, unknown>)[rule.key];
    applied[rule.key] = next;
  }
}

export const numericProp = (key: string): PropRule => ({
  key,
  guard: (v) => typeof v === "number" && !Number.isNaN(v),
  capability: (n) => key in (n as object),
  apply: (n, v) => {
    (n as unknown as Record<string, unknown>)[key] = v;
  },
});

export const booleanProp = (key: string): PropRule => ({
  key,
  guard: (v) => typeof v === "boolean",
  capability: (n) => key in (n as object),
  apply: (n, v) => {
    (n as unknown as Record<string, unknown>)[key] = v;
  },
});

export const stringProp = (key: string): PropRule => ({
  key,
  guard: (v) => typeof v === "string",
  capability: (n) => key in (n as object),
  apply: (n, v) => {
    (n as unknown as Record<string, unknown>)[key] = v;
  },
});

export async function withTextFonts<T>(node: TextNode, fn: () => Promise<T>): Promise<T> {
  await loadFontsForTextNode(node);
  return fn();
}

export async function exportWithHiddenChildren(
  node: SceneNode,
  exportSettings: ExportSettings,
  exportFn: (settings: ExportSettings) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  if (!("children" in node) || node.children.length === 0) {
    return exportFn(exportSettings);
  }

  const saved: boolean[] = [];
  for (const child of node.children) {
    saved.push(child.visible !== false);
    child.visible = false;
  }
  try {
    return await exportFn(exportSettings);
  } finally {
    for (let i = 0; i < node.children.length; i++) {
      node.children[i].visible = saved[i];
    }
  }
}

export const serializeVariableValue = (value: VariableValue): unknown => {
  if (typeof value === "object" && value !== null) {
    if ("type" in value && value.type === "VARIABLE_ALIAS") {
      return { type: "VARIABLE_ALIAS", id: value.id };
    }
    if ("r" in value && "g" in value && "b" in value) {
      const color = value as RGBA;
      return {
        type: "COLOR",
        r: color.r,
        g: color.g,
        b: color.b,
        a: "a" in color ? color.a : 1,
      };
    }
  }
  return value;
};
