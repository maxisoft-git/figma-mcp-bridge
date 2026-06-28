# Plugin

The Figma plugin is the component that runs **inside the Figma sandbox**. It executes every MCP tool against the real Figma document and reports results back to the MCP server over a local WebSocket.

It has two halves:

- **Main thread** (`plugin/src/main/`) — runs in the Figma plugin sandbox. Has full access to the `figma.*` API. Receives JSON requests from the WebSocket, dispatches them to the right handler, returns the result.
- **UI** (`plugin/src/ui/`) — a React app rendered in an iframe inside the Figma panel. Renders connection status, file info, the Dev Mode mirror, and accepts user actions (lock, reconnect, collapse).

A bidirectional message bus between them (`figma.ui.postMessage` / `parent.postMessage`) is the only way they communicate.

## What you see in Figma

When you run `Plugins → Development → Figma MCP Bridge` in Figma, a panel opens on the right side of the editor. Default size is 460 × 560 px.

```
┌──────────────────────────────────────────────────────────┐
│ [▼]  Figma MCP Bridge  My file name     [● connected]   │ ← header (always visible)
├──────────────────────────────────────────────────────────┤
│ ┌────────────────┐  ┌────────────────┐                  │
│ │ File name      │  │ Plugin v0.12.0 │                  │
│ │ File key       │  │ Server v0.12.0 │                  │
│ │ 3 nodes selected│  └────────────────┘                  │
│ └────────────────┘                                       │
│                                                          │
│ ┌─ Dev Mode ─────┐  ┌─ MCP ─────────┐                   │
│ │ CSS SVG HTML … │  │ Tools         │                   │
│ │                │  │ Log           │                   │
│ │ [code preview] │  │ [log entries] │                   │
│ └────────────────┘  └────────────────┘                   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [● connected]  [Disconnect]      [🔒 Unlock / Lock]    │ ← footer
└──────────────────────────────────────────────────────────┘
```

Press **`B`** (or click the ▼ in the header) to collapse the panel down to just the header bar (460 × 56 px). The plugin still runs — only the visible content is hidden. State persists in `localStorage`.

## Hotkeys

These work whenever the plugin panel has focus and no input/textarea has focus.

| Key | Action |
|---|---|
| `L` | Toggle plugin lock (when locked, MCP writes are blocked with a "Plugin locked by user" error) |
| `R` | Reconnect WebSocket to the MCP server (if disconnected) |
| `D` | Disconnect WebSocket |
| `C` | Clear the log |
| `B` | Toggle collapse / expand the panel |
| `?` | Print all hotkeys to the browser console |
| `Cmd/Ctrl+1` | Switch to Dev Mode tab |
| `Cmd/Ctrl+2` | Switch to MCP tab |

## Connection lifecycle

The plugin and the MCP server establish a WebSocket on `ws://localhost:1994/ws`. The handshake looks like this:

```
plugin (UI)                                  plugin (main)             MCP server
─────────────                                  ────────────             ──────────
figma.showUI(__html__, { 460×560 })
figma.ui.postMessage(plugin-status)  ───►    [dropped: UI not ready]
figma.ui.onmessage = handler()                [handler set]
[React mounts]
useEffect ──► parent.postMessage(ui-ready) ──►
                                              if ui-ready: sendStatus() ──►
                                            ◄── ui-ready               [stat retry cleared]
                                            ◄── plugin-status          [set fileKey/fileName]
ws.onopen ──► parent.postMessage(ui-ready)  ──► [re-confirm handshake]
parent.postMessage(server-request, …)  ──►  handleRequest(…)         [PluginResponse]
                                            ◄── PluginResponse        [ui handler forwards to ws]
ws.send(JSON.stringify(response))         ──►                           [pending request resolved]
```

The handshake has two layers of redundancy:

1. Main thread sends `plugin-status` once on startup and once on every `selectionchange`. The UI uses this to learn the file key and the selected nodes.
2. UI sends `ui-ready` on mount and every 1 s until it gets a `plugin-status`. Main thread re-sends `plugin-status` if no `ui-ready` arrived within 2 s. This way, whichever side boots first, the other side eventually catches up.

### Why this matters

Figma sandboxes run in a Chromium webview. The plugin's UI iframe can be destroyed and recreated at any time (Figma reload, panel close + open, file change). The main thread keeps running across these events, so the protocol has to tolerate UI restarts without the main thread restarting. The handshake above guarantees that.

## Message protocol

All messages between the three parties (UI ↔ main ↔ server) are JSON objects with a discriminator `type` field.

### Main thread → UI (via `figma.ui.postMessage`)

| `type` | Payload | Sent when |
|---|---|---|
| `plugin-status` | `{ fileName, fileKey, selectionCount, pluginVersion }` | On startup, every `selectionchange`, and on every `ui-ready` from UI |
| `dev_mode_result` | `{ ok, tab, requestId, css?\|svg?\|html?\|json?\|base64?, … }` | When UI requests a Dev Mode export of the current selection |
| `server-request-response` | `{ type, requestId, data?, error? }` | When the main thread finishes processing an MCP tool call |

### UI → main thread (via `parent.postMessage`)

| `type` | Payload | Sent when |
|---|---|---|
| `ui-ready` | — | On mount, every 1 s until `plugin-status` received |
| `server-request` | `{ type, requestId, … }` (the actual MCP tool call) | When MCP server forwards a request |
| `dev_mode_export` | `{ requestId, tab, nodeId? }` | When user switches the active Dev Mode tab |
| `ui-resize` | `{ collapsed: boolean }` | When user toggles the collapse button |

### Server ↔ plugin (over WebSocket on `:1994/ws`)

| Server → plugin | `{ type: "__server_ping", ts }` (keepalive, every 5 s) |
|---|---|
| Plugin → server | `{ type: "__client_pong" }` (response to keepalive) |
| Server → plugin | `{ type, requestId, nodeIds?, params? }` (an MCP tool call) |
| Plugin → server | `{ type, requestId, data?, error? }` (a tool response) |
| Server → plugin | `{ type: "__bridge_event", event: "files", files: […] }` (broadcast on file connect/disconnect) |
| Server → plugin | `{ type: "__bridge_event", event: "server_version", serverVersion: "x.y.z" }` (on connect) |

## Permissions required

The `plugin/manifest.json` declares:

```json
{
  "enablePrivatePluginApi": true,
  "networkAccess": {
    "allowedDomains": ["ws://localhost:1994"]
  },
  "documentAccess": "dynamic-page",
  "editorType": ["figma", "dev"],
  "capabilities": ["inspect"]
}
```

- **`enablePrivatePluginApi: true`** — required. Without it, `figma.fileKey` returns `undefined` in development plugins, and the plugin has to fall back to the file name (which is wrong if you connect multiple files with the same name).
- **`networkAccess.allowedDomains`** — only the local WebSocket on port 1994. The plugin cannot make any other network request.
- **`documentAccess: "dynamic-page"`** — the plugin can access the current page and any page the user navigates to.
- **`editorType: ["figma", "dev"]`** — works in both the design editor and the Dev Mode editor.
- **`capabilities: ["inspect"]`** — registers the plugin in the Dev Mode "Inspect" panel.

## Adding a new handler

To add a new MCP tool:

1. **Server** — add a Zod schema entry in `server/src/schema.ts` and a `server.tool(...)` call in `server/src/tools.ts`. The `rpcToArgs` mapper at the bottom of `schema.ts` must also have an entry, or TypeScript will refuse to build.
2. **Plugin** — add a new file in `plugin/src/main/handlers/<tool_name>.ts` exporting `export async function handle(request: ServerRequest): Promise<PluginResponse>`. Then add the import + key in `plugin/src/main/router.ts`, and the new type in `RequestType` union in `plugin/src/main/types.ts`.
3. **Test** — add a test in `server/src/<file>.test.ts` (if the new tool has nontrivial logic) or `plugin/src/hooks/useWebSocket.test.ts` (if it's a pure protocol change).

See the existing `export_icon_sprite` tool for a worked example.
