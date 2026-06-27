/**
 * Plugin version (UI bundle).
 *
 * Single source of truth for the UI side. The main thread bundle
 * has its own copy at `src/main/version.ts` since vite builds are
 * separate (root: "./src/ui" for UI, entry: "src/main/code.ts" for main).
 *
 * Keep in sync with `package.json` and `src/main/version.ts`.
 */
export const PLUGIN_VERSION = "0.10.0";
