// --- Serialized paint types (discriminated union) ---
type SerializedSolidPaint = {
  type: "SOLID";
  color: string;
  opacity?: number;
};

type SerializedGradientPaint = {
  type:
    | "GRADIENT_LINEAR"
    | "GRADIENT_RADIAL"
    | "GRADIENT_ANGULAR"
    | "GRADIENT_DIAMOND";
  gradientStops: { color: string; opacity: number; position: number }[];
  gradientTransform: Transform;
  opacity?: number;
};

type SerializedImagePaint = {
  type: "IMAGE";
  scaleMode: string;
  imageHash?: string | null;
  imageTransform?: Transform;
  opacity?: number;
  imageData?: string;
};

type SerializedPaint =
  | SerializedSolidPaint
  | SerializedGradientPaint
  | SerializedImagePaint;

// --- Serialized effect types ---
type SerializedShadowEffect = {
  type: "DROP_SHADOW" | "INNER_SHADOW";
  color: string;
  opacity: number;
  offset: { x: number; y: number };
  radius: number;
  spread?: number;
  blendMode: string;
};

type SerializedBlurEffect = {
  type: "LAYER_BLUR" | "BACKGROUND_BLUR";
  radius: number;
};

type SerializedEffect = SerializedShadowEffect | SerializedBlurEffect;

// --- Serialized auto-layout ---
type SerializedAutoLayout = {
  direction: "HORIZONTAL" | "VERTICAL";
  gap: number;
  primaryAxisAlign: string;
  counterAxisAlign: string;
  primaryAxisSizing: string;
  counterAxisSizing: string;
  wrap?: string;
  counterAxisSpacing?: number;
};

// --- Serialized styles ---
type SerializedStyles = {
  opacity?: number;
  blendMode?: string;
  visible?: boolean;
  fills?: SerializedPaint[] | "mixed";
  strokes?: SerializedPaint[] | "mixed";
  strokeWeight?: number | "mixed";
  strokeAlign?: string;
  dashPattern?: number[];
  effects?: SerializedEffect[];
  cornerRadius?: number | "mixed";
  cornerRadii?: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  cornerSmoothing?: number;
  autoLayout?: SerializedAutoLayout;
  padding?: { top: number; right: number; bottom: number; left: number };
  clipsContent?: boolean;
  rotation?: number;
  constraints?: { horizontal: string; vertical: string };
  verticalTrim?: boolean;
  horizontalTrim?: boolean;
};

type SerializedBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SerializedNode = {
  id: string;
  name: string;
  type: string;
  bounds?: SerializedBounds;
  absoluteBounds?: SerializedBounds;
  characters?: string;
  styles?: SerializedStyles;
  styleReferences?: SerializedStyleReferences;
  boundVariables?: SerializedBoundVariables;
  children?: SerializedNode[];
  childCount?: number;
};

type SerializedStyleReferences = {
  fillStyleId?: StyleReferenceEntry;
  strokeStyleId?: StyleReferenceEntry;
  textStyleId?: StyleReferenceEntry;
  effectStyleId?: StyleReferenceEntry;
  gridStyleId?: StyleReferenceEntry;
};

type StyleReferenceEntry = {
  id: string;
  name: string;
  description?: string;
  key?: string;
  paints?: SerializedPaint[];
  text?: {
    fontName: { family: string; style: string } | "mixed";
    fontSize: number | "mixed";
    lineHeight: { value: number; unit: string } | { unit: string } | "mixed";
    letterSpacing: { value: number; unit: string } | "mixed";
  };
  effects?: SerializedEffect[];
  layoutGrids?: Array<{
    pattern: string;
    alignment?: string;
    count?: number;
    gutterSize?: number;
    offset?: number;
    sectionSize?: number;
    visible?: boolean;
  }>;
};

type SerializedBoundVariables = {
  fills?: Array<{ index: number; property: "color"; id: string; name: string; resolvedType: string }>;
  strokes?: Array<{ index: number; property: "color"; id: string; name: string; resolvedType: string }>;
  cornerRadius?: Array<{ id: string; name: string; resolvedType: string }>;
  paddingLeft?: Array<{ id: string; name: string; resolvedType: string }>;
  paddingRight?: Array<{ id: string; name: string; resolvedType: string }>;
  paddingTop?: Array<{ id: string; name: string; resolvedType: string }>;
  paddingBottom?: Array<{ id: string; name: string; resolvedType: string }>;
  itemSpacing?: Array<{ id: string; name: string; resolvedType: string }>;
  width?: Array<{ id: string; name: string; resolvedType: string }>;
  height?: Array<{ id: string; name: string; resolvedType: string }>;
};

const isMixed = (value: unknown): value is symbol => typeof value === "symbol";

const toHex = (color: RGB): string => {
  const clamp = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value * 255)));
  const [r, g, b] = [clamp(color.r), clamp(color.g), clamp(color.b)];
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

const serializeGradientStops = (
  stops: readonly ColorStop[]
): { color: string; opacity: number; position: number }[] =>
  stops.map((stop) => ({
    color: toHex(stop.color),
    opacity: stop.color.a,
    position: stop.position,
  }));

const serializePaints = (
  paints: readonly Paint[] | symbol | undefined
): SerializedPaint[] | "mixed" => {
  if (isMixed(paints)) return "mixed";
  if (!paints || !Array.isArray(paints)) return [];

  return paints
    .filter((paint) => paint.visible !== false)
    .flatMap((paint): SerializedPaint[] => {
      switch (paint.type) {
        case "SOLID":
          return [
            {
              type: "SOLID",
              color: toHex(paint.color),
              opacity: paint.opacity,
            },
          ];
        case "GRADIENT_LINEAR":
        case "GRADIENT_RADIAL":
        case "GRADIENT_ANGULAR":
        case "GRADIENT_DIAMOND":
          return [
            {
              type: paint.type,
              gradientStops: serializeGradientStops(paint.gradientStops),
              gradientTransform: paint.gradientTransform,
              opacity: paint.opacity,
            },
          ];
        case "IMAGE":
          return [
            {
              type: "IMAGE",
              scaleMode: paint.scaleMode,
              imageHash: paint.imageHash,
              imageTransform: paint.imageTransform,
              opacity: paint.opacity,
            },
          ];
        default:
          return [];
      }
    });
};

const serializeEffects = (effects: readonly Effect[]): SerializedEffect[] =>
  effects
    .filter((effect) => effect.visible !== false)
    .flatMap((effect): SerializedEffect[] => {
      switch (effect.type) {
        case "DROP_SHADOW":
        case "INNER_SHADOW":
          return [
            {
              type: effect.type,
              color: toHex(effect.color),
              opacity: effect.color.a,
              offset: effect.offset,
              radius: effect.radius,
              spread: effect.spread,
              blendMode: effect.blendMode,
            },
          ];
        case "LAYER_BLUR":
        case "BACKGROUND_BLUR":
          return [{ type: effect.type, radius: effect.radius }];
        default:
          return [];
      }
    });

const serializeLineHeight = (lineHeight: LineHeight | symbol) => {
  if (isMixed(lineHeight)) return "mixed";
  if ("value" in lineHeight) {
    return { value: lineHeight.value, unit: lineHeight.unit };
  }
  return { unit: lineHeight.unit };
};

const serializeLetterSpacing = (letterSpacing: LetterSpacing | symbol) => {
  if (isMixed(letterSpacing)) return "mixed";
  return { value: letterSpacing.value, unit: letterSpacing.unit };
};

const getBounds = (node: SceneNode): SerializedBounds | undefined => {
  if ("x" in node && "y" in node && "width" in node && "height" in node) {
    return {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    };
  }
  return undefined;
};

const serializeText = (node: TextNode, base: SerializedNode) => {
  let fontFamily: string | undefined;
  let fontStyle: string | undefined;
  if (typeof node.fontName === "symbol") {
    fontFamily = "mixed";
    fontStyle = "mixed";
  } else if (node.fontName) {
    fontFamily = node.fontName.family;
    fontStyle = node.fontName.style;
  }
  return {
    ...base,
    characters: node.characters,
    styles: {
      ...base.styles,
      fontSize: isMixed(node.fontSize) ? "mixed" : node.fontSize,
      fontFamily,
      fontStyle,
      fontWeight: isMixed(node.fontWeight) ? "mixed" : node.fontWeight,
      textDecoration: isMixed(node.textDecoration)
        ? "mixed"
        : node.textDecoration,
      lineHeight: serializeLineHeight(node.lineHeight),
      letterSpacing: serializeLetterSpacing(node.letterSpacing),
      textAlignHorizontal: isMixed(node.textAlignHorizontal)
        ? "mixed"
        : node.textAlignHorizontal,
      textAlignVertical: isMixed(node.textAlignVertical)
        ? "mixed"
        : node.textAlignVertical,
      textAutoResize: node.textAutoResize,
    },
  };
};

const serializeStyles = (node: SceneNode): SerializedStyles => {
  const styles: SerializedStyles = {};

  if ("opacity" in node) {
    styles.opacity = node.opacity as number;
  }
  if ("blendMode" in node) {
    styles.blendMode = node.blendMode as string;
  }
  if ("visible" in node) {
    styles.visible = node.visible;
  }

  if ("fills" in node) {
    styles.fills = serializePaints(node.fills);
  }
  if ("strokes" in node) {
    styles.strokes = serializePaints(node.strokes);
  }
  if ("strokeWeight" in node) {
    styles.strokeWeight = isMixed(node.strokeWeight)
      ? "mixed"
      : (node.strokeWeight as number);
  }
  if ("strokeAlign" in node) {
    styles.strokeAlign = node.strokeAlign as string;
  }
  if ("dashPattern" in node) {
    const pattern = node.dashPattern as readonly number[];
    if (pattern.length > 0) {
      styles.dashPattern = [...pattern];
    }
  }

  if ("effects" in node) {
    const effects = node.effects as readonly Effect[];
    if (effects.length > 0) {
      styles.effects = serializeEffects(effects);
    }
  }

  if ("cornerRadius" in node) {
    styles.cornerRadius = isMixed(node.cornerRadius)
      ? "mixed"
      : (node.cornerRadius as number);
  }
  if ("topLeftRadius" in node) {
    const tl = node.topLeftRadius as number;
    const tr = node.topRightRadius as number;
    const br = node.bottomRightRadius as number;
    const bl = node.bottomLeftRadius as number;
    if (tl !== tr || tr !== br || br !== bl) {
      styles.cornerRadii = {
        topLeft: tl,
        topRight: tr,
        bottomRight: br,
        bottomLeft: bl,
      };
    }
  }
  if ("cornerSmoothing" in node) {
    const smoothing = node.cornerSmoothing as number;
    if (smoothing > 0) {
      styles.cornerSmoothing = smoothing;
    }
  }

  if ("layoutMode" in node) {
    const mode = node.layoutMode as string;
    if (mode !== "NONE") {
      styles.autoLayout = {
        direction: mode as "HORIZONTAL" | "VERTICAL",
        gap: (node as FrameNode).itemSpacing,
        primaryAxisAlign: (node as FrameNode).primaryAxisAlignItems as string,
        counterAxisAlign: (node as FrameNode).counterAxisAlignItems as string,
        primaryAxisSizing: (node as FrameNode).primaryAxisSizingMode as string,
        counterAxisSizing: (node as FrameNode).counterAxisSizingMode as string,
        wrap: "layoutWrap" in node ? (node.layoutWrap as string) : undefined,
        counterAxisSpacing:
          "counterAxisSpacing" in node
            ? (node.counterAxisSpacing as number)
            : undefined,
      };
    }
  }

  if ("paddingLeft" in node) {
    const top = node.paddingTop as number;
    const right = node.paddingRight as number;
    const bottom = node.paddingBottom as number;
    const left = node.paddingLeft as number;
    if (top > 0 || right > 0 || bottom > 0 || left > 0) {
      styles.padding = { top, right, bottom, left };
    }
  }

  if ("clipsContent" in node) {
    styles.clipsContent = node.clipsContent as boolean;
  }
  if ("rotation" in node) {
    const rotation = node.rotation as number;
    if (rotation !== 0) {
      styles.rotation = rotation;
    }
  }
  if ("constraints" in node) {
    const c = node.constraints as Constraints;
    styles.constraints = { horizontal: c.horizontal, vertical: c.vertical };
  }
  if ("verticalTrim" in node) {
    const vt = node.verticalTrim as boolean;
    if (vt) {
      styles.verticalTrim = vt;
    }
  }
  if ("horizontalTrim" in node) {
    const ht = node.horizontalTrim as boolean;
    if (ht) {
      styles.horizontalTrim = ht;
    }
  }

  return styles;
};

export type SerializeOptions = {
  includeHidden?: boolean;
  depth?: number;
  currentDepth?: number;
  includeImageData?: boolean;
  enrich?: boolean;
};

export const serializeNode = (
  node: SceneNode,
  options?: SerializeOptions
): SerializedNode => {
  const base: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    bounds: getBounds(node),
    absoluteBounds: getAbsoluteBounds(node),
    styles: serializeStyles(node),
  };

  if (options?.enrich) {
    base.styleReferences = collectStyleReferences(node);
    base.boundVariables = collectBoundVariables(node);
  }

  if (node.type === "TEXT") {
    return serializeText(node, base);
  }

  if ("children" in node) {
    const children = options?.includeHidden
      ? node.children
      : node.children.filter((child) => child.visible !== false);
    const effectiveDepth = options?.depth ?? Infinity;
    const nextDepth = (options?.currentDepth ?? 0) + 1;
    if (nextDepth > effectiveDepth) {
      return {
        ...base,
        children: undefined,
        childCount: children.length,
      };
    }
    return {
      ...base,
      children: children.map((child) =>
        serializeNode(child, {
          ...options,
          currentDepth: nextDepth,
        })
      ),
    };
  }

  return base;
};

const getAbsoluteBounds = (node: SceneNode): SerializedBounds | undefined => {
  const box = node.absoluteBoundingBox;
  if (!box) return undefined;
  return { x: box.x, y: box.y, width: box.width, height: box.height };
};

function collectStyleReferences(node: SceneNode): SerializedStyleReferences | undefined {
  const refs: SerializedStyleReferences = {};
  let hasAny = false;

  if ("fillStyleId" in node) {
    const id = node.fillStyleId;
    if (typeof id === "string" && id) {
      refs.fillStyleId = { id, name: "(unresolved)" };
      hasAny = true;
    }
  }
  if ("strokeStyleId" in node) {
    const id = node.strokeStyleId;
    if (typeof id === "string" && id) {
      refs.strokeStyleId = { id, name: "(unresolved)" };
      hasAny = true;
    }
  }
  if ("textStyleId" in node) {
    const id = node.textStyleId;
    if (typeof id === "string" && id) {
      refs.textStyleId = { id, name: "(unresolved)" };
      hasAny = true;
    }
  }
  if ("effectStyleId" in node) {
    const id = node.effectStyleId;
    if (typeof id === "string" && id) {
      refs.effectStyleId = { id, name: "(unresolved)" };
      hasAny = true;
    }
  }
  if ("gridStyleId" in node) {
    const id = node.gridStyleId;
    if (typeof id === "string" && id) {
      refs.gridStyleId = { id, name: "(unresolved)" };
      hasAny = true;
    }
  }

  return hasAny ? refs : undefined;
}

export async function resolveStyleReferences(
  node: SerializedNode,
): Promise<SerializedNode> {
  if (!node.styleReferences) return node;

  await Promise.all([
    node.styleReferences.fillStyleId
      ? resolveAndApplyStyle(node.styleReferences, "fillStyleId")
      : Promise.resolve(),
    node.styleReferences.strokeStyleId
      ? resolveAndApplyStyle(node.styleReferences, "strokeStyleId")
      : Promise.resolve(),
    node.styleReferences.textStyleId
      ? resolveAndApplyStyle(node.styleReferences, "textStyleId")
      : Promise.resolve(),
    node.styleReferences.effectStyleId
      ? resolveAndApplyStyle(node.styleReferences, "effectStyleId")
      : Promise.resolve(),
    node.styleReferences.gridStyleId
      ? resolveAndApplyStyle(node.styleReferences, "gridStyleId")
      : Promise.resolve(),
  ]);

  if (node.children) {
    await Promise.all(node.children.map(resolveStyleReferences));
  }

  return node;
}

async function resolveAndApplyStyle(
  refs: SerializedStyleReferences,
  kind: keyof SerializedStyleReferences,
): Promise<void> {
  const ref = refs[kind];
  if (!ref) return;
  try {
    const style = await figma.getStyleByIdAsync(ref.id);
    if (!style) return;
    ref.name = style.name;
    if ("description" in style) ref.description = style.description;
    if (style.type === "PAINT") {
      ref.paints = (style as PaintStyle).paints
        .filter((p) => p.visible !== false)
        .map((p) => serializePaint(p))
        .filter((p): p is SerializedPaint => p !== null);
    } else if (style.type === "TEXT") {
      const ts = style as TextStyle;
      ref.text = {
        fontName: isMixed(ts.fontName)
          ? "mixed"
          : { family: ts.fontName.family, style: ts.fontName.style },
        fontSize: isMixed(ts.fontSize) ? "mixed" : ts.fontSize,
        lineHeight: serializeLineHeight(ts.lineHeight),
        letterSpacing: serializeLetterSpacing(ts.letterSpacing),
      };
    } else if (style.type === "EFFECT") {
      ref.effects = serializeEffects((style as EffectStyle).effects);
    } else if (style.type === "GRID") {
      ref.layoutGrids = (style as GridStyle).layoutGrids.map((g) => ({
        pattern: g.pattern,
        alignment: g.alignment,
        count: g.count,
        gutterSize: g.gutterSize,
        offset: g.offset,
        sectionSize: g.sectionSize,
        visible: g.visible,
      }));
    }
  } catch {
    // style not found, leave as unresolved
  }
}

function serializePaint(paint: Paint): SerializedPaint | null {
  if (paint.type === "SOLID") {
    return { type: "SOLID", color: toHex(paint.color), opacity: paint.opacity };
  }
  if (
    paint.type === "GRADIENT_LINEAR" ||
    paint.type === "GRADIENT_RADIAL" ||
    paint.type === "GRADIENT_ANGULAR" ||
    paint.type === "GRADIENT_DIAMOND"
  ) {
    return {
      type: paint.type,
      gradientStops: serializeGradientStops(paint.gradientStops),
      gradientTransform: paint.gradientTransform,
      opacity: paint.opacity,
    };
  }
  if (paint.type === "IMAGE") {
    return {
      type: "IMAGE",
      scaleMode: paint.scaleMode,
      imageHash: paint.imageHash,
      imageTransform: paint.imageTransform,
      opacity: paint.opacity,
    };
  }
  return null;
}

function collectBoundVariables(node: SceneNode): SerializedBoundVariables | undefined {
  const result: SerializedBoundVariables = {};
  let hasAny = false;

  const collectFromPaints = (
    paints: readonly Paint[] | symbol | undefined,
    kind: "fills" | "strokes",
  ): void => {
    if (isMixed(paints) || !Array.isArray(paints)) return;
    const entries: Array<{ index: number; property: "color"; id: string; name: string; resolvedType: string }> = [];
    paints.forEach((paint, index) => {
      const bv = (paint as { boundVariables?: Record<string, { type: string; id: string } | undefined> })
        .boundVariables;
      const colorVar = bv?.color;
      if (colorVar && colorVar.type === "VARIABLE_ALIAS") {
        const v = figma.variables.getVariableById(colorVar.id);
        if (v) {
          entries.push({
            index,
            property: "color",
            id: v.id,
            name: v.name,
            resolvedType: v.resolvedType,
          });
        }
      }
    });
    if (entries.length > 0) {
      result[kind] = entries;
      hasAny = true;
    }
  };

  if ("fills" in node) collectFromPaints(node.fills as readonly Paint[] | symbol, "fills");
  if ("strokes" in node) collectFromPaints(node.strokes as readonly Paint[] | symbol, "strokes");

  const collectScalarVar = (
    key: "cornerRadius" | "paddingLeft" | "paddingRight" | "paddingTop" | "paddingBottom" | "itemSpacing" | "width" | "height",
  ): void => {
    if (!(key in node)) return;
    const nodeWithBv = node as unknown as Record<string, unknown>;
    const bv = (nodeWithBv[`${key}BoundVariables`] ?? nodeWithBv.boundVariables) as
      | Record<string, { type: string; id: string } | undefined>
      | undefined;
    if (!bv) return;
    const directAlias = bv[key];
    if (!directAlias || directAlias.type !== "VARIABLE_ALIAS") return;
    const v = figma.variables.getVariableById(directAlias.id);
    if (!v) return;
    result[key] = [{ id: v.id, name: v.name, resolvedType: v.resolvedType }];
    hasAny = true;
  };

  collectScalarVar("cornerRadius");
  collectScalarVar("paddingLeft");
  collectScalarVar("paddingRight");
  collectScalarVar("paddingTop");
  collectScalarVar("paddingBottom");
  collectScalarVar("itemSpacing");
  collectScalarVar("width");
  collectScalarVar("height");

  return hasAny ? result : undefined;
}

function isMixedArray(value: unknown): value is "mixed" {
  return value === "mixed";
}

function isPaintArray(
  value: SerializedPaint[] | "mixed" | undefined,
): value is SerializedPaint[] {
  return Array.isArray(value);
}

function collectImageHashes(node: SerializedNode): string[] {
  const hashes = new Set<string>();
  const traverse = (n: SerializedNode) => {
    if (n.styles?.fills && isPaintArray(n.styles.fills)) {
      for (const fill of n.styles.fills) {
        if (fill.type === "IMAGE" && fill.imageHash) {
          hashes.add(fill.imageHash);
        }
      }
    }
    if (n.styles?.strokes && isPaintArray(n.styles.strokes)) {
      for (const stroke of n.styles.strokes) {
        if (stroke.type === "IMAGE" && stroke.imageHash) {
          hashes.add(stroke.imageHash);
        }
      }
    }
    if (n.children) {
      for (const child of n.children) {
        traverse(child);
      }
    }
  };
  traverse(node);
  return [...hashes];
}

function enrichNodeWithImageData(
  node: SerializedNode,
  hashToData: Map<string, string>
): void {
  const applyToPaint = (paint: SerializedPaint) => {
    if (paint.type === "IMAGE" && paint.imageHash) {
      const data = hashToData.get(paint.imageHash);
      if (data) {
        paint.imageData = data;
      }
    }
  };

  if (node.styles?.fills && isPaintArray(node.styles.fills)) {
    for (const fill of node.styles.fills) {
      applyToPaint(fill);
    }
  }
  if (node.styles?.strokes && isPaintArray(node.styles.strokes)) {
    for (const stroke of node.styles.strokes) {
      applyToPaint(stroke);
    }
  }
  if (node.children) {
    for (const child of node.children) {
      enrichNodeWithImageData(child, hashToData);
    }
  }
}

export async function enrichWithImageData(
  node: SerializedNode
): Promise<SerializedNode> {
  const hashes = collectImageHashes(node);
  if (hashes.length === 0) {
    return node;
  }

  const hashToData = new Map<string, string>();
  await Promise.all(
    hashes.map(async (hash) => {
      try {
        const image = figma.getImageByHash(hash);
        if (image) {
          const bytes = await image.getBytesAsync();
          hashToData.set(hash, figma.base64Encode(bytes));
        }
      } catch {
        // image not available, skip
      }
    })
  );

  enrichNodeWithImageData(node, hashToData);
  return node;
}
