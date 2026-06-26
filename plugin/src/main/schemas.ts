import { z } from "zod";
import { createError, PluginErrorCode } from "./errors";

/** Figma node IDs use colon-separated format, e.g. "4029:12345". Composite IDs for instances use semicolons, e.g. "4029:12345;4029:67890". */
export const figmaNodeId = z
  .string()
  .regex(
    /^\d+:\d+(;\d+:\d+)*$/,
    "Node ID must use colon format, e.g. '4029:12345', or composite format for instances, e.g. '4029:12345;4029:67890'",
  );

const hexColor = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Color must be a hex value like '#FFAA00'",
  );

const textAlignHorizontal = z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]);
const textAlignVertical = z.enum(["TOP", "CENTER", "BOTTOM"]);
const textAutoResize = z.enum(["NONE", "WIDTH_AND_HEIGHT", "HEIGHT", "TRUNCATE"]);

export const setNodePropertiesSchema = z
  .object({
    nodeId: figmaNodeId,
    name: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    rotation: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
    visible: z.boolean().optional(),
    cornerRadius: z.number().min(0).optional(),
    verticalTrim: z.boolean().optional(),
    horizontalTrim: z.boolean().optional(),
    solidFillHex: hexColor.optional(),
    solidFillOpacity: z.number().min(0).max(1).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.x !== undefined ||
      v.y !== undefined ||
      v.width !== undefined ||
      v.height !== undefined ||
      v.rotation !== undefined ||
      v.opacity !== undefined ||
      v.visible !== undefined ||
      v.cornerRadius !== undefined ||
      v.solidFillHex !== undefined ||
      v.solidFillOpacity !== undefined ||
      v.verticalTrim !== undefined ||
      v.horizontalTrim !== undefined,
    "At least one property must be provided",
  )
  .refine(
    (v) => v.solidFillOpacity === undefined || v.solidFillHex !== undefined,
    "solidFillHex is required when solidFillOpacity is provided",
  );

export const setTextPropertiesSchema = z
  .object({
    nodeId: figmaNodeId,
    fontFamily: z.string().optional(),
    fontStyle: z.string().optional(),
    fontSize: z.number().positive().optional(),
    textAlignHorizontal: textAlignHorizontal.optional(),
    textAlignVertical: textAlignVertical.optional(),
    textAutoResize: textAutoResize.optional(),
    lineHeightPx: z.number().positive().optional(),
    letterSpacingPx: z.number().optional(),
    fillHex: hexColor.optional(),
    fillOpacity: z.number().min(0).max(1).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .refine(
    (v) => v.fillOpacity === undefined || v.fillHex !== undefined,
    "fillHex is required when fillOpacity is provided",
  )
  .refine(
    (v) =>
      v.fontFamily !== undefined ||
      v.fontStyle !== undefined ||
      v.fontSize !== undefined ||
      v.textAlignHorizontal !== undefined ||
      v.textAlignVertical !== undefined ||
      v.textAutoResize !== undefined ||
      v.lineHeightPx !== undefined ||
      v.letterSpacingPx !== undefined ||
      v.fillHex !== undefined ||
      v.x !== undefined ||
      v.y !== undefined ||
      v.width !== undefined ||
      v.height !== undefined,
    "At least one text property must be provided",
  );

export const setStrokeSchema = z.object({
  nodeId: figmaNodeId,
  strokeHex: hexColor.optional(),
  strokeOpacity: z.number().min(0).max(1).optional(),
  strokeWeight: z.number().positive().optional(),
  strokeAlign: z.enum(["INSIDE", "OUTSIDE", "CENTER"]).optional(),
  dashPattern: z.array(z.number()).optional(),
});

export const setNodeVisibilitySchema = z.object({
  items: z
    .array(
      z.object({
        nodeId: figmaNodeId,
        visible: z.boolean(),
      }),
    )
    .min(1),
});

export const setTextContentSchema = z.object({
  nodeId: figmaNodeId,
  text: z.string().min(0),
});

export const deleteNodesSchema = z.object({
  confirm: z.literal(true),
});

export type ValidatedParams<T extends z.ZodTypeAny> = z.infer<T>;

export function validateParams<T extends z.ZodTypeAny>(
  schema: T,
  rawParams: unknown,
): z.infer<T> {
  const result = schema.safeParse(rawParams);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    throw createError(
      PluginErrorCode.VALIDATION_ERROR,
      `${path}${issue.message}`,
    );
  }
  return result.data as z.infer<T>;
}
