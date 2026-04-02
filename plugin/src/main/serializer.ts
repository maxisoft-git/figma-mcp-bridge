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
  characters?: string;
  styles?: Record<string, unknown>;
  children?: SerializedNode[];
  childCount?: number;
};

const isMixed = (value: unknown): value is symbol => typeof value === "symbol";

const toHex = (color: RGB): string => {
  const clamp = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value * 255)));
  const [r, g, b] = [clamp(color.r), clamp(color.g), clamp(color.b)];
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

const serializeGradientStops = (stops: readonly ColorStop[]) =>
  stops.map((stop) => ({
    color: toHex(stop.color),
    opacity: stop.color.a,
    position: stop.position,
  }));

const serializeTransform = (
  transform: Transform
): [[number, number, number], [number, number, number]] => [
  [transform[0][0], transform[0][1], transform[0][2]],
  [transform[1][0], transform[1][1], transform[1][2]],
];

const serializePaints = (paints: readonly Paint[] | symbol | undefined) => {
  if (isMixed(paints) || !paints || !Array.isArray(paints)) {
    return isMixed(paints) ? "mixed" : [];
  }
  return paints
    .filter((paint) => paint.visible !== false)
    .map((paint) => {
      const base: Record<string, unknown> = {
        type: paint.type,
        opacity: paint.opacity,
      };
      if (paint.type === "SOLID" && "color" in paint) {
        base.color = toHex(paint.color);
      } else if (
        paint.type === "GRADIENT_LINEAR" ||
        paint.type === "GRADIENT_RADIAL" ||
        paint.type === "GRADIENT_ANGULAR" ||
        paint.type === "GRADIENT_DIAMOND"
      ) {
        base.gradientStops = serializeGradientStops(paint.gradientStops);
        base.gradientTransform = serializeTransform(paint.gradientTransform);
      } else if (paint.type === "IMAGE") {
        base.scaleMode = paint.scaleMode;
        if (paint.imageHash) base.imageHash = paint.imageHash;
        if (paint.imageTransform)
          base.imageTransform = serializeTransform(paint.imageTransform);
      }
      return base;
    });
};

const serializeLineHeight = (lineHeight: LineHeight | symbol) => {
  if (isMixed(lineHeight)) return "mixed";
  if ("value" in lineHeight) {
    return { value: lineHeight.value, unit: lineHeight.unit };
  }
  return { unit: lineHeight.unit }; // AUTO case
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
      textAlignVertical: node.textAlignVertical,
      textAutoResize: node.textAutoResize,
    },
  };
};

const serializeEffects = (effects: readonly Effect[]) =>
  effects
    .filter((e) => e.visible !== false)
    .map((effect) => {
      const base: Record<string, unknown> = { type: effect.type };
      if ("color" in effect && effect.color) {
        base.color = toHex(effect.color);
        base.opacity = effect.color.a;
      }
      if ("offset" in effect && effect.offset) {
        base.offset = { x: effect.offset.x, y: effect.offset.y };
      }
      if ("radius" in effect) base.radius = effect.radius;
      if ("spread" in effect) base.spread = effect.spread;
      if ("blendMode" in effect) base.blendMode = effect.blendMode;
      return base;
    });

const serializeStyles = (node: SceneNode) => {
  const styles: Record<string, unknown> = {};

  // Opacity & blend
  if ("opacity" in node) styles.opacity = node.opacity;
  if ("blendMode" in node) styles.blendMode = node.blendMode;
  if ("visible" in node) styles.visible = node.visible;

  // Fills & strokes
  if ("fills" in node) {
    styles.fills = serializePaints(node.fills);
  }
  if ("strokes" in node) {
    styles.strokes = serializePaints(node.strokes);
  }
  if ("strokeWeight" in node) {
    styles.strokeWeight = isMixed(node.strokeWeight)
      ? "mixed"
      : node.strokeWeight;
  }
  if ("strokeAlign" in node) styles.strokeAlign = node.strokeAlign;
  if ("dashPattern" in node && node.dashPattern.length > 0) {
    styles.dashPattern = [...node.dashPattern];
  }

  // Effects (shadows, blurs)
  if ("effects" in node) {
    const effects = (node as BlendMixin).effects;
    if (effects.length > 0) {
      styles.effects = serializeEffects(effects);
    }
  }

  // Corner radius
  if ("cornerRadius" in node) {
    styles.cornerRadius = isMixed(node.cornerRadius)
      ? "mixed"
      : node.cornerRadius;
  }
  if ("topLeftRadius" in node) {
    const n = node as RectangleCornerMixin;
    if (
      n.topLeftRadius !== n.topRightRadius ||
      n.topLeftRadius !== n.bottomRightRadius ||
      n.topLeftRadius !== n.bottomLeftRadius
    ) {
      styles.cornerRadii = {
        topLeft: n.topLeftRadius,
        topRight: n.topRightRadius,
        bottomRight: n.bottomRightRadius,
        bottomLeft: n.bottomLeftRadius,
      };
    }
  }
  if ("cornerSmoothing" in node && (node as CornerMixin).cornerSmoothing > 0) {
    styles.cornerSmoothing = (node as CornerMixin).cornerSmoothing;
  }

  // Auto-layout
  if ("layoutMode" in node && (node as AutoLayoutMixin).layoutMode !== "NONE") {
    const n = node as AutoLayoutMixin;
    styles.autoLayout = {
      direction: n.layoutMode,
      gap: n.itemSpacing,
      primaryAxisAlign: n.primaryAxisAlignItems,
      counterAxisAlign: n.counterAxisAlignItems,
      primaryAxisSizing: n.primaryAxisSizingMode,
      counterAxisSizing: n.counterAxisSizingMode,
      ...(n.layoutWrap !== "NO_WRAP" ? { wrap: n.layoutWrap } : {}),
      ...(n.counterAxisSpacing !== null
        ? { counterAxisSpacing: n.counterAxisSpacing }
        : {}),
    };
  }

  // Padding (only when non-zero)
  if ("paddingLeft" in node) {
    const n = node as AutoLayoutMixin;
    if (n.paddingTop || n.paddingRight || n.paddingBottom || n.paddingLeft) {
      styles.padding = {
        top: n.paddingTop,
        right: n.paddingRight,
        bottom: n.paddingBottom,
        left: n.paddingLeft,
      };
    }
  }

  // Clipping
  if ("clipsContent" in node) {
    styles.clipsContent = (node as BaseFrameMixin).clipsContent;
  }

  // Rotation
  if ("rotation" in node && (node as DimensionAndPositionMixin).rotation !== 0) {
    styles.rotation = (node as DimensionAndPositionMixin).rotation;
  }

  // Constraints
  if ("constraints" in node) {
    const c = (node as ConstraintMixin).constraints;
    styles.constraints = { horizontal: c.horizontal, vertical: c.vertical };
  }

  return styles;
};

export const serializeNode = (node: SceneNode): SerializedNode => {
  const base: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    bounds: getBounds(node),
    styles: serializeStyles(node),
  };

  if (node.type === "TEXT") {
    return serializeText(node, base);
  }

  if ("children" in node) {
    return {
      ...base,
      children: node.children.map((child) => serializeNode(child)),
    };
  }

  return base;
};
