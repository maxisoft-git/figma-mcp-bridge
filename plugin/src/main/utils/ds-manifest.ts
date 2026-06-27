/**
 * In-memory design system manifest store.
 *
 * Each extract_design_system call produces a manifest (a map of
 * original value → Figma variable / style id). Storing the manifest
 * server-side avoids re-shipping the whole mapping over the wire on
 * subsequent apply / create_styles_table calls — the client just
 * passes back the manifestId.
 *
 * MVP: in-memory. TODO: persist to a JSON file under
 * `~/.figma-mcp-bridge/manifests/<id>.json` so manifests survive
 * plugin restarts.
 */

export interface DesignManifest {
  /** hex (lowercase) → created color variable. */
  colors: Record<string, {
    variableId: string;
    variableName: string;
    hex: string;
    scale: number;
    hue: string;
  }>;
  /** typographyHash → created text style. */
  textStyles: Record<string, {
    styleId: string;
    styleName: string;
    family: string;
    weight: string;
    size: number;
  }>;
  /** stringified value → created spacing variable. */
  spacing: Record<string, {
    variableId: string;
    variableName: string;
    value: number;
  }>;
  /** stringified value → created radius variable. */
  radii: Record<string, {
    variableId: string;
    variableName: string;
    value: number;
  }>;
}

const STORE = new Map<string, DesignManifest>();
let nextCounter = 1;

export function storeManifest(m: DesignManifest): string {
  const id = `dsm-${Date.now().toString(36)}-${(nextCounter++).toString(36)}`;
  STORE.set(id, m);
  return id;
}

export function getManifest(id: string): DesignManifest | undefined {
  return STORE.get(id);
}

export function listManifests(): Array<{ id: string; counts: { colors: number; textStyles: number; spacing: number; radii: number } }> {
  const out: Array<{ id: string; counts: { colors: number; textStyles: number; spacing: number; radii: number } }> = [];
  for (const [id, m] of STORE) {
    out.push({
      id,
      counts: {
        colors: Object.keys(m.colors).length,
        textStyles: Object.keys(m.textStyles).length,
        spacing: Object.keys(m.spacing).length,
        radii: Object.keys(m.radii).length,
      },
    });
  }
  return out;
}

export function deleteManifest(id: string): boolean {
  return STORE.delete(id);
}
