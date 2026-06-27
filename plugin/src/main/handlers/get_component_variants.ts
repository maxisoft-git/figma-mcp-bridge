import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface VariantInfo {
  properties: Record<string, string | number | boolean>;
  nodeId: string;
  name: string;
}

interface VariantsReport {
  componentId: string;
  componentName: string;
  variantCount: number;
  propertyDefs: Array<{ name: string; type: "BOOLEAN" | "TEXT" | "VARIANT" }>;
  variants: VariantInfo[];
}

function variantPropsToObject(props: Record<string, ComponentProperty>): VariantInfo["properties"] {
  const out: VariantInfo["properties"] = {};
  for (const [k, p] of Object.entries(props)) {
    if (p.type === "VARIANT" && p.value !== undefined) {
      out[k] = p.value as string;
    } else if (p.type === "BOOLEAN" && p.value !== undefined) {
      out[k] = p.value as boolean;
    } else if (p.type === "TEXT" && p.value !== undefined) {
      out[k] = p.value as string;
    }
  }
  return out;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as { componentId: string };
  if (!params.componentId) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "componentId is required" } };
  }
  let comp: ComponentNode | null = null;
  try {
    const n = await resolveNode(params.componentId);
    if (n.type !== "COMPONENT") {
      return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: `componentId is not a COMPONENT (got ${n.type})` } };
    }
    comp = n as ComponentNode;
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
  }

  const propertyDefs = comp.componentPropertyDefinitions
    ? Object.entries(comp.componentPropertyDefinitions).map(([name, def]) => ({
      name,
      type: def.type,
    }))
    : [];
  const variants = comp.children
    .filter((c): c is ComponentNode => c.type === "COMPONENT" && c.name !== comp.name && c.parent?.id === comp.id)
    .map((v) => {
      const props = v.componentProperties ?? {};
      return {
        nodeId: v.id,
        name: v.name,
        properties: variantPropsToObject(props),
      } satisfies VariantInfo;
    });

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      componentId: comp.id,
      componentName: comp.name,
      variantCount: variants.length,
      propertyDefs: propertyDefs as VariantsReport["propertyDefs"],
      variants,
    } satisfies VariantsReport,
  };
}
