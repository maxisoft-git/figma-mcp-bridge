/**
 * Design system manifest store.
 *
 * Each extract_design_system call produces a manifest (a map of
 * original value → Figma variable / style id). Storing the manifest
 * server-side avoids re-shipping the whole mapping over the wire on
 * subsequent apply / create_styles_table calls — the client just
 * passes back the manifestId.
 *
 * Persistence is **dynamic-imported** to keep the UI build free of
 * Node-only modules (vite-singlefile inlines the UI; the manifest
 * file IO only runs in the plugin main thread sandbox).
 */

export interface DesignManifest {
  colors: Record<string, {
    variableId: string;
    variableName: string;
    hex: string;
    scale: number;
    hue: string;
  }>;
  textStyles: Record<string, {
    styleId: string;
    styleName: string;
    family: string;
    weight: string;
    size: number;
  }>;
  spacing: Record<string, {
    variableId: string;
    variableName: string;
    value: number;
  }>;
  radii: Record<string, {
    variableId: string;
    variableName: string;
    value: number;
  }>;
  effects: Record<string, {
    styleId: string;
    styleName: string;
    type: string;
  }>;
}

export interface ManifestSummary {
  id: string;
  createdAt: number;
  counts: {
    colors: number;
    textStyles: number;
    spacing: number;
    radii: number;
    effects: number;
  };
}

const CACHE = new Map<string, DesignManifest>();
let nextCounter = 1;
let manifestsDirPromise: Promise<string> | null = null;

async function getManifestsDir(): Promise<string> {
  if (!manifestsDirPromise) {
    manifestsDirPromise = (async () => {
      const { mkdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { homedir } = await import("node:os");
      const dir = join(homedir(), ".figma-mcp-bridge", "manifests");
      await mkdir(dir, { recursive: true });
      return dir;
    })();
  }
  return manifestsDirPromise;
}

async function manifestPath(id: string): Promise<string> {
  const dir = await getManifestsDir();
  const { join } = await import("node:path");
  return join(dir, `${id}.json`);
}

export async function storeManifest(m: DesignManifest): Promise<string> {
  const id = `dsm-${Date.now().toString(36)}-${(nextCounter++).toString(36)}`;
  CACHE.set(id, m);
  try {
    const { writeFile } = await import("node:fs/promises");
    const path = await manifestPath(id);
    await writeFile(path, JSON.stringify(m), "utf8");
  } catch {
    // Disk failures should not break the runtime — memory is enough
    // for the lifetime of a single plugin session.
  }
  return id;
}

export function getManifestCachedOnly(id: string): DesignManifest | undefined {
  return CACHE.get(id);
}

export async function getManifest(id: string): Promise<DesignManifest | undefined> {
  const cached = CACHE.get(id);
  if (cached) return cached;
  try {
    const { readFile } = await import("node:fs/promises");
    const path = await manifestPath(id);
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as DesignManifest;
    CACHE.set(id, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

export async function listManifests(): Promise<ManifestSummary[]> {
  const allIds = new Set(CACHE.keys());
  try {
    const { readdir } = await import("node:fs/promises");
    const dir = await getManifestsDir();
    const files = await readdir(dir);
    for (const f of files) {
      if (f.endsWith(".json")) allIds.add(f.replace(/\.json$/, ""));
    }
  } catch {
    // ignore
  }

  const out: ManifestSummary[] = [];
  for (const id of allIds) {
    let m: DesignManifest | undefined = CACHE.get(id);
    if (!m) {
      try {
        const { readFile } = await import("node:fs/promises");
        const path = await manifestPath(id);
        const raw = await readFile(path, "utf8");
        m = JSON.parse(raw) as DesignManifest;
        CACHE.set(id, m);
      } catch {
        continue;
      }
    }
    let createdAt = Date.now();
    try {
      const { stat } = await import("node:fs/promises");
      const path = await manifestPath(id);
      const s = await stat(path);
      createdAt = s.birthtimeMs || s.mtimeMs;
    } catch {
      // ignore
    }
    out.push({
      id,
      createdAt,
      counts: {
        colors: Object.keys(m.colors).length,
        textStyles: Object.keys(m.textStyles).length,
        spacing: Object.keys(m.spacing).length,
        radii: Object.keys(m.radii).length,
        effects: Object.keys(m.effects).length,
      },
    });
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

export async function deleteManifest(id: string): Promise<boolean> {
  CACHE.delete(id);
  try {
    const { unlink } = await import("node:fs/promises");
    const path = await manifestPath(id);
    await unlink(path);
    return true;
  } catch {
    return CACHE.has(id);
  }
}

/** Test-only: reset in-memory state. */
export function __resetForTest(): void {
  CACHE.clear();
  nextCounter = 1;
  manifestsDirPromise = null;
}
