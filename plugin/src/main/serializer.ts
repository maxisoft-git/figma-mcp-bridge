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
    },
  };
};

const serializeStyles = (node: SceneNode) => {
  const styles: Record<string, unknown> = {};
  if ("fills" in node) {
    styles.fills = serializePaints(node.fills);
  }
  if ("strokes" in node) {
    styles.strokes = serializePaints(node.strokes);
  }
  if ("cornerRadius" in node) {
    styles.cornerRadius = isMixed(node.cornerRadius)
      ? "mixed"
      : node.cornerRadius;
  }
  if ("paddingLeft" in node) {
    styles.padding = {
      top: node.paddingTop,
      right: node.paddingRight,
      bottom: node.paddingBottom,
      left: node.paddingLeft,
    };
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
