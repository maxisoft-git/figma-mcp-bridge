# AGENTS.md

## Build Commands

```bash
# Server: install + build (outputs to server/dist/)
cd server && npm install && npm run build

# Plugin: install + build (outputs to plugin/dist/)
cd plugin && bun install && bun run build

# Plugin: watch mode (both vite builds in parallel)
cd plugin && bun run dev
```

- Server uses `tsc` directly (no bundler). Plugin uses Vite with two configs: `vite.config.ts` (UI) and `vite.config.main.ts` (main thread).
- Both packages use `bun install` in CI. Plugin uses `bun` exclusively; server can use either `npm` or `bun`.

## No Test Suite

There are no tests. Don't try to run test/lint/typecheck commands—none are configured.

## Architecture

Two independent packages in a monorepo (no workspace root):

- **`server/`** — Node.js MCP server (`@maxisoft-git/figma-mcp-bridge`). Published to npm. Runs via stdio transport. Uses `@modelcontextprotocol/sdk`, `ws`, `zod`. Leader/follower election allows multiple instances.
  - Entry: `server/src/index.ts` → `server/dist/index.js`
  - Tool definitions: `server/src/tools.ts`
  - WebSocket bridge to Figma: `server/src/bridge.ts`
  - Leader election: `server/src/election.ts`, `server/src/node.ts`

- **`plugin/`** — Figma plugin (private, not published). React UI + Figma API main thread. Uses `@figma/plugin-typings`.
  - Entry (main thread): `plugin/src/main/code.ts` → `plugin/dist/code.js`
  - Entry (UI): `plugin/src/ui/main.tsx` → `plugin/dist/index.html`
  - Serialization logic: `plugin/src/main/serializer.ts`

Communication: Plugin ↔ Server over WebSocket at `ws://localhost:1994`.

## Key Conventions

- TypeScript strict mode in both packages.
- ESM everywhere (`"type": "module"`).
- Server `moduleResolution: "Node16"` — use `.js` extensions in imports.
- Plugin `moduleResolution: "Bundler"` — no extension needed.
- Node >= 20 (see `.nvmrc`: `24`).
- Prettier config at root: double quotes, trailing commas (es5), 2-space indent.

## Release

Manual via GitHub Actions workflow (`release.yml`). Takes a semver version input, builds both packages, publishes server to npm, and creates a GitHub Release zip with the plugin dist + manifest.
