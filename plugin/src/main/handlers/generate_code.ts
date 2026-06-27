/**
 * Code generation: turn Figma nodes into framework-specific markup.
 *
 * Each generator inspects the same node properties (layout, fill, typography,
 * effects) and emits idiomatic markup for the target framework.
 */

import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

type Framework = "react-tailwind" | "react-css" | "vue" | "html" | "css" | "scss";

interface GenerateCodeParams {
  nodeId: string;
  framework: Framework;
  /** Optional element type override (e.g. "button", "section"). Default: auto-derived from name. */
  component?: string;
  /** When true, bind to design variables via var(--name) instead of hardcoded values. */
  useVariables?: boolean;
  /** When true, output JSX/HTML only. When false, also include CSS. */
  stylesOnly?: boolean;
}

interface CodeResult {
  framework: Framework;
  html: string;
  css: string;
  dependencies?: string[];
}

const TAILWIND_DEFAULT_COMPONENT: Record<string, string> = {
  Button: "button",
  Title: "h1",
  Heading: "h2",
  Subtitle: "h3",
  Body: "p",
  Text: "p",
  Image: "img",
  Avatar: "div",
  Card: "div",
  Container: "div",
  Input: "input",
};

function detectComponent(n: SceneNode, override?: string): string {
  if (override) return override;
  if (n.type === "TEXT") return "p";
  if (n.type === "RECTANGLE" || n.type === "ELLIPSE") {
    if (n.name.toLowerCase().includes("button")) return "button";
    if (n.name.toLowerCase().includes("input")) return "input";
  }
  return TAILWIND_DEFAULT_COMPONENT[n.name] ?? "div";
}

function nodeIdShort(id: string): string {
  return id.split(":").pop() ?? id;
}

function rgbToHex(c: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

interface ColorStop {
  hex: string;
  opacity: number;
}

function extractColors(n: SceneNode): ColorStop[] {
  if (!("fills" in n)) return [];
  const fills = (n as GeometryMixin).fills;
  if (!Array.isArray(fills)) return [];
  return (fills as readonly Paint[])
    .filter((f) => f.type === "SOLID" && (f as SolidPaint).visible !== false)
    .map((f) => {
      const c = (f as SolidPaint).color;
      return { hex: rgbToHex(c), opacity: (f as SolidPaint).opacity ?? 1 };
    });
}

function extractCornerRadius(n: SceneNode): number {
  if (!("cornerRadius" in n)) return 0;
  return (n as { cornerRadius?: number }).cornerRadius ?? 0;
}

function extractPadding(n: SceneNode): { top: number; right: number; bottom: number; left: number } {
  if (!isFrameLike(n) || n.layoutMode === "NONE") return { top: 0, right: 0, bottom: 0, left: 0 };
  return { top: n.paddingTop, right: n.paddingRight, bottom: n.paddingBottom, left: n.paddingLeft };
}

function extractGap(n: SceneNode): number {
  if (!isFrameLike(n) || n.layoutMode === "NONE") return 0;
  return n.itemSpacing ?? 0;
}

function isFrameLike(n: SceneNode): n is FrameNode {
  return n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE";
}

function isTextNode(n: SceneNode): n is TextNode {
  return n.type === "TEXT";
}

function getWidth(n: SceneNode): number {
  return (n as { width?: number }).width ?? 0;
}

function getHeight(n: SceneNode): number {
  return (n as { height?: number }).height ?? 0;
}

function getTextContent(n: SceneNode): string {
  if (isTextNode(n)) return n.characters;
  return "";
}

function getFontSize(n: SceneNode): number {
  if (isTextNode(n)) return (n.fontSize as number) ?? 16;
  return 16;
}

function getFontWeight(n: SceneNode): string {
  if (!isTextNode(n)) return "400";
  const style = (n.fontName as FontName).style.toLowerCase();
  if (style.includes("black")) return "900";
  if (style.includes("extrabold") || style.includes("heavy")) return "800";
  if (style.includes("bold")) return "700";
  if (style.includes("semibold") || style.includes("demibold")) return "600";
  if (style.includes("medium")) return "500";
  if (style.includes("regular") || style.includes("normal")) return "400";
  if (style.includes("light")) return "300";
  return "400";
}

// --- Tailwind ---

function toTailwind(n: SceneNode): { classes: string[]; styles: string[] } {
  const classes: string[] = [];
  const styles: string[] = [];
  const w = Math.round(getWidth(n));
  const h = Math.round(getHeight(n));
  if (w) classes.push(`w-[${w}px]`);
  if (h) classes.push(`h-[${h}px]`);
  const radius = extractCornerRadius(n);
  if (radius) classes.push(`rounded-[${radius}px]`);
  const padding = extractPadding(n);
  if (padding.top || padding.right || padding.bottom || padding.left) {
    const parts: string[] = [];
    if (padding.top) parts.push(`pt-[${padding.top}px]`);
    if (padding.right) parts.push(`pr-[${padding.right}px]`);
    if (padding.bottom) parts.push(`pb-[${padding.bottom}px]`);
    if (padding.left) parts.push(`pl-[${padding.left}px]`);
    if (padding.top === padding.bottom && padding.left === padding.right) {
      classes.push(`p-[${padding.top}px]`);
    } else {
      classes.push(...parts);
    }
  }
  if (isFrameLike(n) && n.layoutMode === "HORIZONTAL") {
    const gap = extractGap(n);
    if (gap) classes.push(`gap-[${gap}px]`, "flex", "flex-row");
  } else if (isFrameLike(n) && n.layoutMode === "VERTICAL") {
    const gap = extractGap(n);
    if (gap) classes.push(`gap-[${gap}px]`, "flex", "flex-col");
  }
  const colors = extractColors(n);
  if (colors[0]) {
    const hex = colors[0].hex;
    if (hex === "#ffffff") classes.push("bg-white");
    else if (hex === "#000000") classes.push("bg-black");
    else classes.push("bg-[var(--color-primary-500)]");
  }
  if (isTextNode(n)) {
    classes.push("text-[14px]"); // simplified
    classes.push(`font-[${getFontWeight(n)}]`);
  }
  return { classes, styles };
}

function toReactTailwind(n: SceneNode, componentName: string): CodeResult {
  const tag = detectComponent(n, componentName);
  const { classes, styles } = toTailwind(n);
  const id = nodeIdShort(n.id);
  const cls = classes.join(" ");
  const styleStr = styles.length ? ` style={{ ${styles.join(", ")} }}` : "";
  let inner = "";
  if (isTextNode(n)) {
    inner = `{${JSON.stringify(getTextContent(n))}}`;
  } else if (n.type === "RECTANGLE" || n.type === "ELLIPSE") {
    inner = "";
  } else if ("children" in n) {
    inner = (n as ChildrenMixin).children
      .map((c) => `\n        <div data-figma-id="${c.id}" />`)
      .join("");
  }
  const html = `export function ${capitalize(componentName)}() {\n  return (\n    <${tag} data-figma-id="${id}" className="${cls}"${styleStr}>${inner}\n    </${tag}>\n  );\n}`;
  return {
    framework: "react-tailwind",
    html,
    css: `/* Tailwind classes embedded in the component */\n/* Custom styles: ${styles.join("; ") || "none"} */`,
    dependencies: ["react", "tailwindcss"],
  };
}

// --- Plain React + CSS ---

function toReactCss(n: SceneNode, componentName: string): CodeResult {
  const tag = detectComponent(n, componentName);
  const id = nodeIdShort(n.id);
  const w = getWidth(n);
  const h = getHeight(n);
  const radius = extractCornerRadius(n);
  const padding = extractPadding(n);
  const gap = extractGap(n);
  const colors = extractColors(n);
  const bg = colors[0]?.hex ?? "transparent";
  const fontSize = isTextNode(n) ? getFontSize(n) : 16;
  const fontWeight = isTextNode(n) ? getFontWeight(n) : "400";
  const text = isTextNode(n) ? getTextContent(n) : "";

  const css =
`.${componentName.toLowerCase()} {\n` +
`  width: ${w}px;\n` +
`  height: ${h}px;\n` +
`  background: ${bg};\n` +
`  border-radius: ${radius}px;\n` +
    (padding.top || padding.right || padding.bottom || padding.left
      ? `  padding: ${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;\n`
      : "") +
    (gap ? `  gap: ${gap}px;\n` : "") +
    (isTextNode(n) ? `  font-size: ${fontSize}px;\n  font-weight: ${fontWeight};\n` : "") +
`  display: flex;\n` +
    (isFrameLike(n) && n.layoutMode === "HORIZONTAL" ? `  flex-direction: row;\n` : "") +
    (isFrameLike(n) && n.layoutMode === "VERTICAL" ? `  flex-direction: column;\n` : "") +
`}`;
  const inner = isTextNode(n)
    ? `{${JSON.stringify(text)}}`
    : (n.type === "RECTANGLE" || n.type === "ELLIPSE")
      ? ""
      : (("children" in n)
        ? (n as ChildrenMixin).children
          .map((c) => `\n      <div data-figma-id="${c.id}" />`)
          .join("")
        : "");
  const html = `import "./${componentName.toLowerCase()}.css";\n\nexport function ${capitalize(componentName)}() {\n  return (\n    <${tag} className="${componentName.toLowerCase()}" data-figma-id="${id}">${inner}\n  );\n}`;
  return { framework: "react-css", html, css, dependencies: ["react"] };
}

// --- Vue 3 SFC ---

function toVue(n: SceneNode, componentName: string): CodeResult {
  const tag = detectComponent(n, componentName);
  const id = nodeIdShort(n.id);
  const colors = extractColors(n);
  const bg = colors[0]?.hex ?? "transparent";
  const w = getWidth(n);
  const h = getHeight(n);
  const radius = extractCornerRadius(n);
  const padding = extractPadding(n);
  const gap = extractGap(n);

  const text = isTextNode(n) ? getTextContent(n) : "";
  const inner = isTextNode(n)
    ? `  {{ ${JSON.stringify(text)} }}`
    : (("children" in n)
      ? (n as ChildrenMixin).children
        .map((c) => `  <div :data-figma-id="${c.id}" />`)
        .join("\n")
      : "");
  const template = `<template>\n  <${tag} :data-figma-id="${id}">${inner ? "\n" + inner : ""}\n  </${tag}>\n</template>`;
  const style = `<style scoped>\n.${componentName.toLowerCase()} {\n  width: ${w}px;\n  height: ${h}px;\n  background: ${bg};\n  border-radius: ${radius}px;\n${padding.top || padding.right || padding.bottom || padding.left ? `  padding: ${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;\n` : ""}${gap ? `  gap: ${gap}px;\n` : ""}}\n</style>`;
  return {
    framework: "vue",
    html: `<script setup lang="ts">\n</script>\n\n${template}\n\n${style}`,
    css: "",
    dependencies: ["vue@3"],
  };
}

// --- Plain HTML ---

function toHtml(n: SceneNode, componentName: string): CodeResult {
  const tag = detectComponent(n, componentName);
  const id = nodeIdShort(n.id);
  const w = getWidth(n);
  const h = getHeight(n);
  const radius = extractCornerRadius(n);
  const padding = extractPadding(n);
  const colors = extractColors(n);
  const bg = colors[0]?.hex ?? "transparent";
  const fontSize = isTextNode(n) ? getTextSize(n) : 16;
  const text = isTextNode(n) ? getTextContent(n) : "";
  const style = `width:${w}px;height:${h}px;background:${bg};border-radius:${radius}px;` +
    (padding.top || padding.right || padding.bottom || padding.left ? `padding:${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;` : "") +
    (isTextNode(n) ? `font-size:${fontSize}px;` : "");
  const inner = isTextNode(n)
    ? text
    : (("children" in n)
      ? (n as ChildrenMixin).children
        .map((c) => `<div data-figma-id="${c.id}"></div>`)
        .join("\n    ")
      : "");
  const html = `<!-- Source: Figma node "${n.name}" (id: ${id}) -->\n<div class="${componentName.toLowerCase()}" data-figma-id="${id}" style="${style}">\n  ${inner}\n</div>`;
  return { framework: "html", html, css: "" };
}

function getTextSize(n: TextNode): number {
  return (n.fontSize as number) ?? 16;
}

// --- CSS / SCSS ---

function toCss(n: SceneNode, componentName: string, format: "css" | "scss"): CodeResult {
  const className = componentName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const w = getWidth(n);
  const h = getHeight(n);
  const colors = extractColors(n);
  const radius = extractCornerRadius(n);
  const padding = extractPadding(n);
  const gap = extractGap(n);
  const fontSize = isTextNode(n) ? getTextSize(n) : 16;
  const bg = colors[0]?.hex ?? "transparent";
  const baseRules = [
    `.${className} {`,
    `  width: ${w}px;`,
    `  height: ${h}px;`,
    `  background: ${bg};`,
    `  border-radius: ${radius}px;`,
    ...(padding.top || padding.right || padding.bottom || padding.left ? [`  padding: ${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;`] : []),
    ...(gap ? [`  gap: ${gap}px;`] : []),
    ...(isTextNode(n) ? [`  font-size: ${fontSize}px;`, `  font-weight: ${getFontWeight(n)};`] : []),
  ];
  let body: string;
  if (format === "css") {
    body = baseRules.join("\n  ") + "\n}";
  } else {
    // SCSS: extract a $bg variable
    const scssVars: string[] = [];
    if (bg !== "transparent") scssVars.push(`$bg: ${bg};`);
    scssVars.push(`$radius: ${radius}px;`);
    if (gap) scssVars.push(`$gap: ${gap}px;`);
    if (fontSize && isTextNode(n)) scssVars.push(`$font-size: ${fontSize}px;`);
    body = scssVars.join("\n") + "\n\n" + baseRules.join("\n  ") + "\n}";
  }
  return { framework: format, html: `<!-- ${n.name} -->`, css: body };
}

function capitalize(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as GenerateCodeParams;
  if (!params.nodeId) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeId is required" } };
  }
  if (!params.framework) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "framework is required" } };
  }
  const validFrameworks = ["react-tailwind", "react-css", "vue", "html", "css", "scss"];
  if (!validFrameworks.includes(params.framework)) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: `framework must be one of: ${validFrameworks.join(", ")}` } };
  }
  let node: SceneNode;
  try {
    node = await resolveNode(params.nodeId);
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
  }
  const name = params.component || node.name;
  if (params.stylesOnly) {
    return { type: request.type, requestId: request.requestId, data: { framework: params.framework, html: "", css: toCss(node, name, params.framework === "scss" ? "scss" : "css").css } };
  }
  let result: CodeResult;
  switch (params.framework) {
    case "react-tailwind":
      result = toReactTailwind(node, name);
      break;
    case "react-css":
      result = toReactCss(node, name);
      break;
    case "vue":
      result = toVue(node, name);
      break;
    case "html":
      result = toHtml(node, name);
      break;
    case "css":
    case "scss":
      result = toCss(node, name, params.framework);
      break;
  }
  return { type: request.type, requestId: request.requestId, data: result };
}
