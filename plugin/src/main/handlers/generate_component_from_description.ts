import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";
import { getManifest } from "../utils/ds-manifest";

interface GenerateComponentParams {
  /** Parent frame id where the new component will be created. */
  parentId: string;
  /** Component name. */
  name: string;
  /** Layout direction. */
  layoutMode: "VERTICAL" | "HORIZONTAL";
  /** Children descriptors. */
  children: Array<
    | { type: "text"; text: string; name?: string }
    | { type: "frame"; name: string; layoutMode?: "VERTICAL" | "HORIZONTAL"; children?: GenerateComponentParams["children"] }
    | { type: "rect"; name: string; w: number; h: number; fill?: string }
  >;
  /** Manifest to bind styles to. */
  manifestId?: string;
  /** Background fill (hex). */
  background?: string;
  /** Outer padding. Default 16. */
  padding?: number;
  /** Item spacing. Default 8. */
  itemSpacing?: number;
  /** Corner radius. */
  cornerRadius?: number;
}

interface GenerateResult {
  componentId: string;
  componentKey: string;
  childIds: string[];
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as GenerateComponentParams;
  if (!params.parentId) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "parentId is required" } };
  }
  if (!params.name) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "name is required" } };
  }
  if (!params.children || params.children.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "children must be a non-empty array" } };
  }
  let parent: SceneNode;
  try {
    parent = await resolveNode(params.parentId);
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
  }
  if (!("appendChild" in parent)) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "parent does not accept children" } };
  }

  const manifest = params.manifestId ? await getManifest(params.manifestId) : null;
  const textStyles = manifest ? new Map(Object.values(manifest.textStyles).map((s) => [s.styleName, s.styleId])) : null;
  const colorVars = manifest ? new Map(Object.entries(manifest.colors).map(([hex, v]) => [hex.toLowerCase(), v.variableId])) : null;

  const comp = figma.createComponent();
  comp.name = params.name;
  comp.layoutMode = params.layoutMode;
  comp.primaryAxisSizingMode = "AUTO";
  comp.counterAxisSizingMode = "AUTO";
  comp.paddingTop = params.padding ?? 16;
  comp.paddingBottom = params.padding ?? 16;
  comp.paddingLeft = params.padding ?? 16;
  comp.paddingRight = params.padding ?? 16;
  comp.itemSpacing = params.itemSpacing ?? 8;
  comp.cornerRadius = params.cornerRadius ?? 8;
  comp.fills = params.background
    ? [{ type: "SOLID", color: hexToRgb(params.background) } as unknown as Paint]
    : [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } } as unknown as Paint];
  (parent as ChildrenMixin).appendChild(comp);
  comp.x = 0; comp.y = 0;

  const childIds: string[] = [];
  for (const child of params.children) {
    const created = await createChild(comp, child, textStyles, colorVars);
    if (created) childIds.push(created.id);
  }
  return {
    type: request.type,
    requestId: request.requestId,
    data: { componentId: comp.id, componentKey: comp.key, childIds },
  };
}

async function createChild(
  parent: SceneNode,
  desc: GenerateComponentParams["children"][number],
  textStyles: Map<string, string> | null,
  colorVars: Map<string, string> | null,
): Promise<BaseNode | null> {
  if (desc.type === "text") {
    const t = figma.createText();
    t.fontName = { family: "Inter", style: "Regular" };
    t.characters = desc.text;
    t.name = desc.name ?? desc.text;
    if (textStyles) {
      const sid = textStyles.get(t.name);
      if (sid) {
        try {
          await t.setTextStyleIdAsync(sid);
        } catch {
          // ignore
        }
      }
    }
    (parent as ChildrenMixin).appendChild(t);
    return t;
  }
  if (desc.type === "rect") {
    const r = figma.createRectangle();
    r.name = desc.name;
    r.resize(desc.w, desc.h);
    if (desc.fill && colorVars) {
      const vid = colorVars.get(desc.fill.toLowerCase());
      if (vid) {
        try {
          r.fills = [{ type: "SOLID", color: hexToRgb(desc.fill) } as unknown as Paint];
          r.setBoundVariable("fills", { type: "VARIABLE_ALIAS", id: vid });
        } catch {
          r.fills = [{ type: "SOLID", color: hexToRgb(desc.fill) } as unknown as Paint];
        }
      } else {
        r.fills = [{ type: "SOLID", color: hexToRgb(desc.fill) } as unknown as Paint];
      }
    } else if (desc.fill) {
      r.fills = [{ type: "SOLID", color: hexToRgb(desc.fill) } as unknown as Paint];
    }
    (parent as ChildrenMixin).appendChild(r);
    return r;
  }
  if (desc.type === "frame") {
    const f = figma.createFrame();
    f.name = desc.name;
    f.layoutMode = desc.layoutMode ?? "VERTICAL";
    f.primaryAxisSizingMode = "AUTO";
    f.counterAxisSizingMode = "AUTO";
    f.itemSpacing = 8;
    f.paddingTop = 8;
    f.paddingBottom = 8;
    f.paddingLeft = 8;
    f.paddingRight = 8;
    f.fills = [];
    (parent as ChildrenMixin).appendChild(f);
    if (desc.children) {
      for (const c of desc.children) {
        await createChild(f, c, textStyles, colorVars);
      }
    }
    return f;
  }
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}
