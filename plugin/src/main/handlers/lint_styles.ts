import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";
import { getManifest } from "../utils/ds-manifest";

interface LintParams {
  nodeIds: string[];
  manifestId?: string;
  /** Auto-fix violations. Default false (lint only). */
  fix?: boolean;
  /** Rules: each rule defaults to true. */
  rules?: {
    paletteOnly?: boolean;
    spacingFromManifest?: boolean;
    noHardcodedColors?: boolean;
  };
}

interface LintIssue {
  nodeId: string;
  property: string;
  rule: "paletteOnly" | "spacingFromManifest" | "noHardcodedColors";
  message: string;
  currentValue: string;
}

const RULES_DEFAULT = {
  paletteOnly: true,
  spacingFromManifest: true,
  noHardcodedColors: true,
};

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as LintParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "nodeIds is required" },
    };
  }
  const rules = { ...RULES_DEFAULT, ...(params.rules ?? {}) };
  const fix = params.fix ?? false;
  const manifest = params.manifestId ? await getManifest(params.manifestId) : null;

  const issues: LintIssue[] = [];
  let fixed = 0;

  for (const nodeId of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(nodeId);
    } catch (err) {
      return {
        type: request.type,
        requestId: request.requestId,
        error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) },
      };
    }
    walkForIssues(node, (n, prop, value, msg, rule) => {
      const issue: LintIssue = { nodeId: n.id, property: prop, rule, message: msg, currentValue: String(value) };
      issues.push(issue);
      if (fix && rules[rule]) {
        // best-effort fix: rebind to the manifest variable (only when
        // a manifest is supplied)
        if (manifest && rule === "noHardcodedColors" && prop === "fill" && "fills" in n) {
          const v = manifest.colors[normalizeHex(String(value))];
          if (v) {
            try {
              (n as GeometryMixin).setBoundVariable("fills", { type: "VARIABLE_ALIAS", id: v.variableId });
              fixed++;
            } catch {
              // ignore
            }
          }
        }
      }
    });
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: { totalIssues: issues.length, fixed, issues: issues.slice(0, 100), dryRun: !fix },
  };
}

function normalizeHex(hex: string): string {
  const h = hex.trim().toLowerCase().replace("#", "");
  if (!/^[0-9a-f]{6}$/.test(h)) return hex;
  return `#${h}`;
}

function walkForIssues(
  node: SceneNode,
  emit: (n: SceneNode, prop: string, value: unknown, msg: string, rule: LintIssue["rule"]) => void,
): void {
  if ("fills" in node) {
    const fills = (node as GeometryMixin).fills;
    if (Array.isArray(fills)) {
      for (const f of fills as readonly Paint[]) {
        if (f.type === "SOLID") {
          const hex = normalizeHex(rgbToHex(f.color));
          if (!hex.startsWith("#")) continue;
          emit(
            node,
            "fill",
            hex,
            `Hardcoded color ${hex}; bind to a Variable for theming.`,
            "noHardcodedColors",
          );
        }
      }
    }
  }
  if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
    const f = node as FrameNode;
    if (f.layoutMode && f.layoutMode !== "NONE") {
      for (const field of ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "itemSpacing", "counterAxisSpacing"] as const) {
        const v = f[field] as number;
        // Hardcoded (non-bound) value — flag as potential "spacing from manifest" issue
        if (typeof v === "number" && v > 0) {
          emit(
            node,
            field,
            v,
            `Spacing ${v} is not bound to a manifest Variable; consider using a spacing token.`,
            "spacingFromManifest",
          );
        }
      }
    }
  }
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) {
      walkForIssues(c as SceneNode, emit);
    }
  }
}

function rgbToHex(c: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}
