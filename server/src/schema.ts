import { z } from "zod";

/** Figma node IDs use colon-separated format, e.g. "4029:12345". Composite IDs for instances use semicolons, e.g. "4029:12345;4029:67890". */
export const figmaNodeId = z
  .string()
  .regex(/^\d+:\d+(;\d+:\d+)*$/, "Node ID must use colon format, e.g. '4029:12345', or composite format for instances, e.g. '4029:12345;4029:67890'");
const exportFormat = z.enum(["PNG", "SVG", "JPG", "PDF"]);
const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color must be a hex value like '#FFAA00'");
const textAlignHorizontal = z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]);
const textAlignVertical = z.enum(["TOP", "CENTER", "BOTTOM"]);
const textAutoResize = z.enum(["NONE", "WIDTH_AND_HEIGHT", "HEIGHT", "TRUNCATE"]);
const shapeType = z.enum(["RECTANGLE", "ELLIPSE", "LINE"]);
const imageScaleMode = z.enum(["FILL", "FIT"]);

const fileKeyField = z
  .string()
  .optional()
  .describe(
    "The fileKey of the Figma file to query. Required when multiple files are connected. Use list_files to see connected files."
  );

export const setNodePropertiesInput = z.object({
  nodeId: figmaNodeId.describe("The node ID to update"),
  name: z.string().optional().describe("Optional new node name"),
  x: z.number().optional().describe("Optional x position"),
  y: z.number().optional().describe("Optional y position"),
  width: z.number().positive().optional().describe("Optional width"),
  height: z.number().positive().optional().describe("Optional height"),
  rotation: z.number().optional().describe("Optional rotation in degrees"),
  opacity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Optional opacity from 0 to 1"),
  visible: z.boolean().optional().describe("Optional visibility"),
  cornerRadius: z
    .number()
    .min(0)
    .optional()
    .describe("Optional corner radius"),
  verticalTrim: z.boolean().optional().describe("Optional vertical trim (trims content vertically)"),
  horizontalTrim: z.boolean().optional().describe("Optional horizontal trim (trims content horizontally)"),
  solidFillHex: hexColor
    .optional()
    .describe("Optional solid fill color as hex"),
  solidFillOpacity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Optional solid fill opacity from 0 to 1"),
  fileKey: fileKeyField,
});

export const createFrameInput = z.object({
  name: z.string().optional().describe("Optional frame name"),
  parentId: figmaNodeId
    .optional()
    .describe("Optional parent node ID to append the frame into"),
  x: z.number().optional().describe("Optional x position"),
  y: z.number().optional().describe("Optional y position"),
  width: z.number().positive().optional().describe("Frame width"),
  height: z.number().positive().optional().describe("Frame height"),
  fillHex: hexColor
    .optional()
    .describe("Optional solid fill color as hex"),
  fillOpacity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Optional solid fill opacity from 0 to 1"),
  fileKey: fileKeyField,
});

export const setTextPropertiesShape = z.object({
  nodeId: figmaNodeId.describe("The text node ID to update"),
  fontFamily: z.string().optional().describe("Optional font family"),
  fontStyle: z.string().optional().describe("Optional font style"),
  fontSize: z.number().positive().optional().describe("Optional font size"),
  textAlignHorizontal: textAlignHorizontal
    .optional()
    .describe("Optional horizontal alignment"),
  textAlignVertical: textAlignVertical
    .optional()
    .describe("Optional vertical alignment"),
  textAutoResize: textAutoResize
    .optional()
    .describe("Optional text auto-resize mode"),
  lineHeightPx: z
    .number()
    .positive()
    .optional()
    .describe("Optional line height in pixels"),
  letterSpacingPx: z
    .number()
    .optional()
    .describe("Optional letter spacing in pixels"),
  fillHex: hexColor.optional().describe("Optional text fill color as hex"),
  fillOpacity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Optional text fill opacity from 0 to 1"),
  x: z.number().optional().describe("Optional x position"),
  y: z.number().optional().describe("Optional y position"),
  width: z.number().positive().optional().describe("Optional width"),
  height: z.number().positive().optional().describe("Optional height"),
  fileKey: fileKeyField,
});

export const setTextPropertiesInput = setTextPropertiesShape
  .refine(
    (value) =>
      value.fontFamily !== undefined ||
      value.fontStyle !== undefined ||
      value.fontSize !== undefined ||
      value.textAlignHorizontal !== undefined ||
      value.textAlignVertical !== undefined ||
      value.textAutoResize !== undefined ||
      value.lineHeightPx !== undefined ||
      value.letterSpacingPx !== undefined ||
      value.fillHex !== undefined ||
      value.fillOpacity !== undefined ||
      value.x !== undefined ||
      value.y !== undefined ||
      value.width !== undefined ||
      value.height !== undefined,
    "At least one text property must be provided",
  )
  .refine(
    (value) => value.fillOpacity === undefined || value.fillHex !== undefined,
    "fillHex is required when fillOpacity is provided",
  );

export const createTextShape = z.object({
  name: z.string().optional().describe("Optional text node name"),
  parentId: figmaNodeId
    .optional()
    .describe("Optional parent node ID to append the text into"),
  characters: z.string().optional().describe("Initial text content"),
  fontFamily: z.string().optional().describe("Font family, defaults to Inter"),
  fontStyle: z.string().optional().describe("Font style, defaults to Regular"),
  fontSize: z.number().positive().optional().describe("Optional font size"),
  textAlignHorizontal: textAlignHorizontal
    .optional()
    .describe("Optional horizontal alignment"),
  textAutoResize: textAutoResize
    .optional()
    .describe("Optional text auto-resize mode"),
  fillHex: hexColor.optional().describe("Optional text fill color as hex"),
  fillOpacity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Optional text fill opacity from 0 to 1"),
  x: z.number().optional().describe("Optional x position"),
  y: z.number().optional().describe("Optional y position"),
  width: z.number().positive().optional().describe("Optional width"),
  height: z.number().positive().optional().describe("Optional height"),
  fileKey: fileKeyField,
});

export const createTextInput = createTextShape
  .refine(
    (value) => value.fillOpacity === undefined || value.fillHex !== undefined,
    "fillHex is required when fillOpacity is provided",
  );

export const createShapeShape = z.object({
  shapeType: shapeType.describe("Shape type to create"),
  name: z.string().optional().describe("Optional shape name"),
  parentId: figmaNodeId
    .optional()
    .describe("Optional parent node ID to append the shape into"),
  x: z.number().optional().describe("Optional x position"),
  y: z.number().optional().describe("Optional y position"),
  width: z.number().positive().optional().describe("Optional width"),
  height: z.number().positive().optional().describe("Optional height"),
  rotation: z.number().optional().describe("Optional rotation in degrees"),
  cornerRadius: z
    .number()
    .min(0)
    .optional()
    .describe("Optional corner radius for supported shapes"),
  fillHex: hexColor.optional().describe("Optional fill color as hex"),
  fillOpacity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Optional fill opacity from 0 to 1"),
  strokeHex: hexColor.optional().describe("Optional stroke color as hex"),
  strokeOpacity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Optional stroke opacity from 0 to 1"),
  strokeWeight: z
    .number()
    .positive()
    .optional()
    .describe("Optional stroke weight"),
  fileKey: fileKeyField,
});

export const createShapeInput = createShapeShape
  .refine(
    (value) => value.fillOpacity === undefined || value.fillHex !== undefined,
    "fillHex is required when fillOpacity is provided",
  )
  .refine(
    (value) => value.strokeOpacity === undefined || value.strokeHex !== undefined,
    "strokeHex is required when strokeOpacity is provided",
  );

export const createImageInput = z.object({
  source: z
    .string()
    .min(1)
    .describe(
      "Image source. Accepts a local file path (absolute or relative to the MCP server cwd), an http/https URL, or a data URI."
    ),
  name: z.string().optional().describe("Optional image node name"),
  parentId: figmaNodeId
    .optional()
    .describe("Optional parent node ID to append the image into"),
  x: z.number().optional().describe("Optional x position"),
  y: z.number().optional().describe("Optional y position"),
  width: z.number().positive().optional().describe("Optional width"),
  height: z.number().positive().optional().describe("Optional height"),
  cornerRadius: z
    .number()
    .min(0)
    .optional()
    .describe("Optional corner radius"),
  scaleMode: imageScaleMode
    .optional()
    .describe("How the image should fit its bounds: FILL (default) or FIT"),
  fileKey: fileKeyField,
});

export const toolInputSchemas = {
  get_document: z.object({
    fileKey: fileKeyField,
    includeHidden: z.boolean().optional().describe("Include hidden nodes in the tree (default false)"),
    includeImageData: z.boolean().optional().describe("Include actual image bytes for nodes with image fills (default false)"),
    enrich: z.boolean().optional().describe("Resolve style references and bound variables to human-readable names + values for accurate code generation (default false)"),
  }),

  get_selection: z.object({
    fileKey: fileKeyField,
    includeHidden: z.boolean().optional().describe("Include hidden children in the tree (default false)"),
    includeImageData: z.boolean().optional().describe("Include actual image bytes for nodes with image fills (default false)"),
    enrich: z.boolean().optional().describe("Resolve style references and bound variables to human-readable names + values for accurate code generation (default false)"),
  }),

  get_node: z.object({
    nodeId: figmaNodeId.describe("The node ID to fetch"),
    fileKey: fileKeyField,
    includeHidden: z.boolean().optional().describe("Include hidden children in the tree (default false)"),
    includeImageData: z.boolean().optional().describe("Include actual image bytes for nodes with image fills (default false)"),
    enrich: z.boolean().optional().describe("Resolve style references and bound variables to human-readable names + values for accurate code generation (default false)"),
  }),

  get_styles: z.object({
    fileKey: fileKeyField,
  }),

  get_metadata: z.object({
    fileKey: fileKeyField,
  }),

  get_design_context: z.object({
    depth: z
      .number()
      .optional()
      .describe("How many levels deep to traverse the node tree (default 2)"),
    includeHidden: z.boolean().optional().describe("Include hidden nodes (default false)"),
    includeImageData: z.boolean().optional().describe("Include actual image bytes for nodes with image fills (default false)"),
    enrich: z.boolean().optional().describe("Resolve style references and bound variables to human-readable names + values for accurate code generation (default false)"),
    fileKey: fileKeyField,
  }),

  get_variable_defs: z.object({
    fileKey: fileKeyField,
  }),

  get_screenshot: z.object({
    nodeIds: z
      .array(figmaNodeId)
      .optional()
      .describe(
        "Optional list of node IDs to export (colon-separated format, e.g. '4029:12345' — never use hyphens). If empty, exports the current selection",
      ),
    format: exportFormat
      .optional()
      .describe("Export format: PNG (default) or SVG or JPG or PDF"),
    scale: z
      .number()
      .optional()
      .describe("Export scale for raster formats (default 2)"),
    fileKey: fileKeyField,
  }),

  save_node_json: z.object({
    items: z
      .array(
        z.object({
          nodeId: figmaNodeId.describe("The node ID to serialize"),
          outputPath: z
            .string()
            .min(1)
            .describe(
              "Output .json file path (relative paths resolve from the MCP server current working directory)",
            ),
        }),
      )
      .min(1)
      .describe("List of nodes to serialize and save as JSON files"),
    fileKey: fileKeyField,
  }),

  set_node_visibility: z.object({
    items: z
      .array(
        z.object({
          nodeId: figmaNodeId.describe("The node ID to modify"),
          visible: z.boolean().describe("true to show, false to hide"),
        })
      )
      .min(1)
      .describe("List of nodes with their target visibility"),
    fileKey: fileKeyField,
  }),

  set_text_content: z.object({
    nodeId: figmaNodeId.describe("The text node ID to update"),
    text: z.string().describe("The new text content"),
    fileKey: fileKeyField,
  }),

  set_text_properties: setTextPropertiesInput,

  set_node_properties: setNodePropertiesInput
    .refine(
      (value) =>
        value.name !== undefined ||
        value.x !== undefined ||
        value.y !== undefined ||
        value.width !== undefined ||
        value.height !== undefined ||
        value.rotation !== undefined ||
        value.opacity !== undefined ||
        value.visible !== undefined ||
        value.cornerRadius !== undefined ||
        value.solidFillHex !== undefined ||
        value.solidFillOpacity !== undefined,
      "At least one property must be provided",
    )
    .refine(
      (value) =>
        value.solidFillOpacity === undefined || value.solidFillHex !== undefined,
      "solidFillHex is required when solidFillOpacity is provided",
    ),

  create_frame: createFrameInput
    .refine(
      (value) => value.fillOpacity === undefined || value.fillHex !== undefined,
      "fillHex is required when fillOpacity is provided",
    ),

  create_text: createTextInput,

  create_shape: createShapeInput,

  create_image: createImageInput,

  duplicate_nodes: z.object({
    nodeIds: z
      .array(figmaNodeId)
      .min(1)
      .describe("List of node IDs to duplicate"),
    fileKey: fileKeyField,
  }),

  reparent_nodes: z.object({
    nodeIds: z
      .array(figmaNodeId)
      .min(1)
      .describe("List of node IDs to move"),
    parentId: figmaNodeId.describe("Destination parent node ID"),
    fileKey: fileKeyField,
  }),

  delete_nodes: z.object({
    nodeIds: z
      .array(figmaNodeId)
      .min(1)
      .describe("List of node IDs to delete"),
    confirm: z
      .literal(true)
      .describe("Must be true to confirm deletion"),
    fileKey: fileKeyField,
  }),

  save_screenshots: z.object({
    items: z
      .array(
        z.object({
          nodeId: figmaNodeId.describe("The node ID to export"),
          outputPath: z
            .string()
            .min(1)
            .describe(
              "Output file path (relative paths resolve from the MCP server current working directory)",
            ),
          format: exportFormat
            .optional()
            .describe("Per-item export format override: PNG, SVG, JPG, or PDF"),
          scale: z
            .number()
            .optional()
            .describe("Per-item export scale override for raster formats"),
        }),
      )
      .min(1)
      .describe("List of screenshot save operations to execute in batch"),
    format: exportFormat
      .optional()
      .describe("Default export format: PNG (default) or SVG or JPG or PDF"),
    scale: z
      .number()
      .optional()
      .describe("Default export scale for raster formats (default 2)"),
    fileKey: fileKeyField,
  }),

  set_stroke: z.object({
    nodeId: figmaNodeId.describe("The node ID to update"),
    strokeHex: hexColor.optional().describe("Stroke color as hex"),
    strokeOpacity: z.number().min(0).max(1).optional().describe("Stroke opacity (default 1)"),
    strokeWeight: z.number().positive().optional().describe("Stroke weight"),
    strokeAlign: z.enum(["INSIDE", "OUTSIDE", "CENTER"]).optional().describe("Stroke alignment"),
    dashPattern: z.array(z.number()).optional().describe("Dash pattern as array of numbers"),
    fileKey: fileKeyField,
  }),

  set_effects: z.object({
    nodeId: figmaNodeId.describe("The node ID to update"),
    mode: z.enum(["append", "replace", "clear"]).optional().describe("How to apply effects: append (default), replace all, or clear all"),
    effects: z.array(z.object({
      type: z.enum(["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"]).describe("Effect type"),
      color: hexColor.optional().describe("Color for shadow effects (hex)"),
      opacity: z.number().min(0).max(1).optional().describe("Opacity for shadow effects (default 0.25)"),
      offset: z.object({ x: z.number(), y: z.number() }).optional().describe("Shadow offset"),
      radius: z.number().optional().describe("Blur radius or shadow blur radius"),
      spread: z.number().optional().describe("Shadow spread"),
      blendMode: z.string().optional().describe("Blend mode (default NORMAL)"),
      visible: z.boolean().optional().describe("Whether effect is visible (default true)"),
    })).optional().describe("Array of effects to apply"),
    fileKey: fileKeyField,
  }),

  set_constraints: z.object({
    nodeId: figmaNodeId.describe("The node ID to update"),
    horizontal: z.enum(["MIN", "CENTER", "MAX", "STRETCH", "SCALE"]).optional().describe("Horizontal constraint"),
    vertical: z.enum(["MIN", "CENTER", "MAX", "STRETCH", "SCALE"]).optional().describe("Vertical constraint"),
    fileKey: fileKeyField,
  }),

  set_gradient_fill: z.object({
    nodeId: figmaNodeId.describe("The node ID to update"),
    gradientType: z.enum(["GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"]).describe("Gradient type"),
    stops: z.array(z.object({
      color: hexColor.describe("Stop color as hex"),
      opacity: z.number().min(0).max(1).optional().describe("Stop opacity (default 1)"),
      position: z.number().min(0).max(1).describe("Stop position 0-1"),
    })).min(2).describe("Gradient stops (at least 2)"),
    transform: z.array(z.array(z.number())).optional().describe("Gradient transform matrix"),
    opacity: z.number().min(0).max(1).optional().describe("Overall gradient opacity"),
    fileKey: fileKeyField,
  }),

  list_components: z.object({
    pageId: figmaNodeId.optional().describe("Page ID to search (defaults to current page)"),
    fileKey: fileKeyField,
  }),

  create_component: z.object({
    nodeId: figmaNodeId.describe("The node to convert into a component"),
    name: z.string().optional().describe("Component name"),
    description: z.string().optional().describe("Component description"),
    fileKey: fileKeyField,
  }),

  create_instance: z.object({
    componentId: figmaNodeId.optional().describe("Component node ID"),
    componentKey: z.string().optional().describe("Component key (for external components)"),
    x: z.number().optional().describe("X position"),
    y: z.number().optional().describe("Y position"),
    name: z.string().optional().describe("Instance name"),
    parentId: figmaNodeId.optional().describe("Parent to append the instance into"),
    fileKey: fileKeyField,
  }),

  set_instance_properties: z.object({
    nodeId: figmaNodeId.describe("The instance node ID to update"),
    overrides: z.array(z.object({
      targetNodeId: figmaNodeId.optional().describe("Node ID of the child to override"),
      targetNodeName: z.string().optional().describe("Name of the child to override"),
      field: z.enum([
        "characters",
        "fills",
        "fill",
        "strokes",
        "opacity",
        "visible",
        "name",
        "fontSize",
        "fontFamily",
      ]).describe("Property to override"),
      value: z.union([z.string(), z.number(), z.boolean()]).describe("New value for the property"),
    })).min(1).describe("Array of overrides to apply"),
    fileKey: fileKeyField,
  }),

  get_image: z.object({
    nodeId: figmaNodeId.describe("The node ID to export as image (colon-separated format)"),
    format: exportFormat
      .optional()
      .describe("Export format: PNG (default) or SVG or JPG"),
    scale: z
      .number()
      .optional()
      .describe("Export scale for raster formats (default 1)"),
    backgroundOnly: z.boolean().optional().describe("Export only the background fill without children (default false)"),
    outputPath: z.string().optional().describe("If provided, save the image to this path instead of returning base64"),
    fileKey: fileKeyField,
  }),

  batch_mutation: z.object({
    operations: z.array(z.object({
      type: z.string().describe("Operation type: create_frame, create_text, create_shape, set_position, set_size, set_fills, set_strokes, set_corner_radius, set_text_content, set_text_style, append_children, delete_node, find_nodes"),
      nodeId: figmaNodeId.optional().describe("Target node ID for mutations"),
      nodeIds: z.array(figmaNodeId).optional().describe("Target node IDs for batch operations"),
      params: z.record(z.string(), z.unknown()).optional().describe("Operation parameters"),
      ref: z.string().optional().describe("Temporary ref to assign to created node (use as tmp:refName in subsequent operations)"),
    })).min(1).max(100).describe("Array of operations to execute atomically (max 100)"),
    fileKey: fileKeyField,
  }),

  create_paint_style: z.object({
    name: z.string().describe("Name of the paint style (e.g., 'Primary/500')"),
    paints: z.array(z.object({
      type: z.enum(["SOLID", "GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"]).describe("Paint type"),
      color: hexColor.optional().describe("Color as hex (for SOLID)"),
      gradientStops: z.array(z.object({
        color: hexColor.describe("Stop color as hex"),
        position: z.number().min(0).max(1).describe("Stop position (0-1)"),
      })).optional().describe("Gradient stops (for gradients)"),
      gradientTransform: z.array(z.array(z.number())).optional().describe("Gradient transform matrix"),
      opacity: z.number().min(0).max(1).optional().describe("Paint opacity"),
    })).min(1).describe("Array of paints"),
    fileKey: fileKeyField,
  }),

  create_text_style: z.object({
    name: z.string().describe("Name of the text style (e.g., 'Heading/H1')"),
    fontFamily: z.string().optional().describe("Font family (default: Inter)"),
    fontStyle: z.string().optional().describe("Font style (default: Regular)"),
    fontSize: z.number().positive().optional().describe("Font size in pixels"),
    lineHeight: z.union([
      z.number().describe("Line height in pixels"),
      z.object({ value: z.number(), unit: z.enum(["PIXELS", "PERCENT"]) }),
    ]).optional().describe("Line height"),
    letterSpacing: z.number().optional().describe("Letter spacing in pixels"),
    textDecoration: z.enum(["NONE", "UNDERLINE", "STRIKETHROUGH"]).optional().describe("Text decoration"),
    textCase: z.enum(["ORIGINAL", "UPPER", "LOWER", "TITLE"]).optional().describe("Text case transformation"),
    fileKey: fileKeyField,
  }),

  create_effect_style: z.object({
    name: z.string().describe("Name of the effect style (e.g., 'Shadow/Lg')"),
    effects: z.array(z.object({
      type: z.enum(["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"]).describe("Effect type"),
      color: hexColor.optional().describe("Effect color as hex (for shadows)"),
      offset: z.object({ x: z.number(), y: z.number() }).optional().describe("Shadow offset"),
      radius: z.number().min(0).optional().describe("Blur radius"),
      spread: z.number().optional().describe("Shadow spread (for shadows)"),
      blendMode: z.string().optional().describe("Blend mode (default: NORMAL)"),
    })).min(1).describe("Array of effects"),
    fileKey: fileKeyField,
  }),

  create_grid_style: z.object({
    name: z.string().describe("Name of the grid style"),
    layoutGrids: z.array(z.object({
      pattern: z.enum(["COLUMNS", "ROWS", "GRID"]).describe("Grid pattern"),
      alignment: z.enum(["STRETCH", "MIN", "MAX", "CENTER"]).optional().describe("Column/row alignment"),
      count: z.number().optional().describe("Number of columns/rows"),
      gutterSize: z.number().optional().describe("Gutter size in pixels"),
      offset: z.number().optional().describe("Offset in pixels"),
      sectionSize: z.number().optional().describe("Column width / row height / grid size"),
      visible: z.boolean().optional().describe("Whether the grid is visible"),
    })).min(1).describe("Array of layout grids"),
    fileKey: fileKeyField,
  }),

  create_variable_collection: z.object({
    name: z.string().describe("Name of the variable collection (e.g., 'Colors')"),
    modes: z.array(z.string()).min(1).describe("Array of mode names (e.g., ['Light', 'Dark'])"),
    fileKey: fileKeyField,
  }),

  create_variable: z.object({
    name: z.string().describe("Name of the variable (e.g., 'primary/500')"),
    collectionId: z.string().describe("ID of the variable collection"),
    type: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]).describe("Variable type"),
    valuesByMode: z.record(z.string(), z.unknown()).describe("Values by mode name or modeId (e.g., { Light: '#007AFF', Dark: '#0A84FF' })"),
    fileKey: fileKeyField,
  }),

  // Dev Mode Mirror — ported from figma-dev. Exports CSS, SVG, HTML, JSON, IMG
  // for a single node (selected by default or by nodeId).
  get_dev_css: z.object({
    nodeIds: z.array(figmaNodeId).optional().describe("Optional nodeId. If absent, uses current selection."),
    fileKey: fileKeyField,
  }).describe(
    "Dev Mode Mirror: get the CSS for a node (selected by default, or pass nodeId in nodeIds). Returns plain CSS string for the single node — no subtree walk."
  ),
  get_dev_svg: z.object({
    nodeIds: z.array(figmaNodeId).optional().describe("Optional nodeId. If absent, uses current selection."),
    fileKey: fileKeyField,
  }).describe(
    "Dev Mode Mirror: export a node as SVG with all styles inlined as XML attributes (matches what Figma's Dev Mode shows)."
  ),
  get_dev_html: z.object({
    nodeIds: z.array(figmaNodeId).optional().describe("Optional nodeId. If absent, uses current selection."),
    fileKey: fileKeyField,
  }).describe(
    "Dev Mode Mirror: compose a simplified HTML document for a node by walking its children. Capped at 200 nodes / 12 levels deep to keep the sandbox responsive. Image fills are NOT inlined."
  ),
  get_dev_json: z.object({
    nodeIds: z.array(figmaNodeId).optional().describe("Optional nodeId. If absent, uses current selection."),
    fileKey: fileKeyField,
  }).describe(
    "Dev Mode Mirror: get the raw getCSSAsync() key/value object for a node, plus a depth-2 structural dump of the node tree."
  ),
  get_dev_image: z.object({
    nodeIds: z.array(figmaNodeId).optional().describe("Optional nodeId. If absent, uses current selection."),
    fileKey: fileKeyField,
  }).describe(
    "Dev Mode Mirror: extract the image from a node. Tries (1) direct imageHash, (2) imageHash on a direct child, (3) node.exportAsync(PNG) fallback. Returns base64 string + mime + source."
  ),

  // Design System automation
  extract_design_system: z.object({
    nodeId: figmaNodeId.describe("Root node to scan recursively for colors, typography, spacing and radii."),
    collectionName: z.string().optional().describe('Variable collection name to write into (default "Design System").'),
    minOccurrences: z.number().int().min(1).optional().describe("Skip values that appear fewer than N times (default 1 = keep all)."),
    skipHidden: z.boolean().optional().describe("Skip hidden nodes (default true)."),
    fileKey: fileKeyField,
  }).describe(
    "Extract a design system from a single node subtree. Scans colors, text styles, spacing, radii and effects, creates Variables in the target collection and Paint/Text/Effect Styles. Returns a manifestId usable with create_styles_table and apply_design_system."
  ),
  extract_design_system_bulk: z.object({
    nodeIds: z.array(figmaNodeId).min(1).describe("Root nodes to scan. Their stats are merged into a single manifest."),
    collectionName: z.string().optional().describe('Variable collection name to write into (default "Design System").'),
    minOccurrences: z.number().int().min(1).optional().describe("Skip values that appear fewer than N times across all nodes (default 1 = keep all)."),
    skipHidden: z.boolean().optional().describe("Skip hidden nodes (default true)."),
    fileKey: fileKeyField,
  }).describe(
    "Extract a design system from multiple node subtrees. Merges stats across all nodes, then creates Variables + Paint/Text/Effect Styles in the target collection. Useful for building a design system from a set of canonical screens. Returns a single manifestId covering everything."
  ),
  create_styles_table: z.object({
    manifestId: z.string().describe("Manifest ID returned from extract_design_system."),
    options: z.object({
      pageName: z.string().optional().describe('Page name to put the table on (default "📐 Design System").'),
      columns: z.number().int().min(1).max(8).optional().describe("Grid columns (default 4)."),
      cellSize: z.number().int().min(40).max(160).optional().describe("Color swatch size in px (default 80)."),
    }).optional(),
    fileKey: fileKeyField,
  }).describe(
    "Render a visual reference table of paint/text styles on a dedicated page. Each cell shows a preview bound to the corresponding Variable / Style from the manifest."
  ),
  apply_design_system: z.object({
    manifestId: z.string().describe("Manifest ID returned from extract_design_system."),
    nodeIds: z.array(figmaNodeId).min(1).describe("Nodes to apply the design system to (recursive)."),
    options: z.object({
      dryRun: z.boolean().optional().describe("If true, return what would change without applying."),
      skipMissing: z.boolean().optional().describe("If true, skip values not in the manifest (default false = count as skipped)."),
    }).optional(),
    fileKey: fileKeyField,
  }).describe(
    "Apply a design system (extracted earlier) to the given nodes. Replaces hardcoded fills, text styles and corner radii with Variables and Styles from the manifest. Use dryRun=true to preview."
  ),
  manage_manifests: z.object({
    mode: z.enum(["list", "delete"]).describe("Operation to perform: list (return all manifests) or delete (remove one)."),
    manifestId: z.string().optional().describe("Required when mode='delete'. ID returned from extract_design_system."),
    fileKey: fileKeyField,
  }).describe(
    "List all stored design system manifests, or delete a specific one. Manifests are persisted to ~/.figma-mcp-bridge/manifests/ and survive plugin restarts."
  ),
} as const;

type ToolName = keyof typeof toolInputSchemas;

/**
 * Maps the RPC wire format { tool, nodeIds?, params? } to each tool's
 * expected input shape. Typed as Record<ToolName, ...> so adding a schema
 * without a mapper is a compile error.
 */
const rpcToArgs: Record<
  ToolName,
  (nodeIds?: string[], params?: Record<string, unknown>) => unknown
> = {
  get_document: (_nodeIds, params) => ({ ...params }),
  get_selection: (_nodeIds, params) => ({ ...params }),
  get_node: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  get_styles: (_nodeIds, params) => ({ ...params }),
  get_metadata: (_nodeIds, params) => ({ ...params }),
  get_design_context: (_nodeIds, params) => ({ ...params }),
  get_variable_defs: (_nodeIds, params) => ({ ...params }),
  get_screenshot: (nodeIds, params) => ({ nodeIds, ...params }),
  save_node_json: (_nodeIds, params) => ({ ...params }),
  set_node_visibility: (_nodeIds, params) => ({ ...params }),
  set_text_content: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_text_properties: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_node_properties: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  create_frame: (_nodeIds, params) => ({ ...params }),
  create_text: (_nodeIds, params) => ({ ...params }),
  create_shape: (_nodeIds, params) => ({ ...params }),
  create_image: (_nodeIds, params) => ({ ...params }),
  duplicate_nodes: (nodeIds, params) => ({ nodeIds, ...params }),
  reparent_nodes: (nodeIds, params) => ({ nodeIds, ...params }),
  delete_nodes: (nodeIds, params) => ({ nodeIds, ...params }),
  save_screenshots: (_nodeIds, params) => ({ ...params }),
  set_stroke: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_effects: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_constraints: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  set_gradient_fill: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  list_components: (_nodeIds, params) => ({ ...params }),
  create_component: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  create_instance: (_nodeIds, params) => ({ ...params }),
  set_instance_properties: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  batch_mutation: (_nodeIds, params) => ({ ...params }),
  get_image: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  create_paint_style: (_nodeIds, params) => ({ ...params }),
  create_text_style: (_nodeIds, params) => ({ ...params }),
  create_effect_style: (_nodeIds, params) => ({ ...params }),
  create_grid_style: (_nodeIds, params) => ({ ...params }),
  create_variable_collection: (_nodeIds, params) => ({ ...params }),
  create_variable: (_nodeIds, params) => ({ ...params }),
  get_dev_css: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  get_dev_svg: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  get_dev_html: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  get_dev_json: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  get_dev_image: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  extract_design_system: (nodeIds, params) => ({ nodeId: nodeIds?.[0], ...params }),
  extract_design_system_bulk: (nodeIds, params) => ({ nodeIds, ...params }),
  create_styles_table: (_nodeIds, params) => params,
  apply_design_system: (nodeIds, params) => ({ nodeIds, ...params }),
  manage_manifests: (_nodeIds, params) => params,
};

/**
 * Validate an RPC request against the corresponding tool's input schema.
 * Returns an error string on failure, null if valid or no schema exists for the tool.
 */
export function validateRpc(
  tool: string,
  nodeIds?: string[],
  params?: Record<string, unknown>,
): string | null {
  if (!(tool in toolInputSchemas)) return null;

  const name = tool as ToolName;
  const result = toolInputSchemas[name].safeParse(
    rpcToArgs[name](nodeIds, params),
  );
  return result.success ? null : result.error.issues[0].message;
}
