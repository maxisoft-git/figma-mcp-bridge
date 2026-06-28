# Architecture

## The two-process model

The system has two completely separate Node.js processes that communicate only over a local WebSocket:

1. **MCP server** (`@maxisoft/figma-mcp-bridge`, published to npm)
   - Runs wherever your AI client is
   - Implements the Model Context Protocol (stdio transport)
   - Exposes 75 tools that take Zod-validated JSON input and return JSON output
   - Owns port 1994 on localhost (HTTP + WebSocket)
2. **Figma plugin** (this repo, the `plugin/` directory)
   - Runs *inside the Figma desktop sandbox* (or in the Figma web iframe)
   - Has full access to `figma.*` — the same API the Figma editor itself uses
   - React UI in an iframe, plus a sandboxed main thread that executes tool calls

There is no cloud service in the loop. Both processes are on your machine, and the only thing crossing the boundary is JSON over a single WebSocket on `localhost:1994`.

## Why two processes?

Figma's plugin API is a sandboxed runtime — there's no way for a Node.js process on your machine to call `figma.getNodeByIdAsync` directly. The only way to use the rich node model is to have code running *inside* Figma.

Meanwhile, AI agents speak the Model Context Protocol, which expects an MCP server (typically a single binary) that they can launch as a child process.

These two deployment models are incompatible. The bridge is the simplest way to reconcile them:

- The MCP server runs as a child of the AI client (so the agent can talk to it over stdio)
- The Figma plugin is imported into Figma once and stays alive (so it can use `figma.*`)
- The two talk over a side-channel WebSocket that doesn't require Figma to know about MCP

## What runs where

| Concern | Where it runs |
|---|---|
| AI agent ↔ MCP protocol | MCP server (stdio) |
| Tool registration (75 tools) | MCP server |
| Zod schema validation | MCP server |
| Request routing (fileKey → connection) | MCP server |
| Per-IP rate limiting | MCP server (`/rpc` only) |
| Response cache (5 s TTL, read-only tools) | MCP server |
| Standalone HTTP server on :1994 | MCP server (leader only) |
| WebSocket bridge to Figma | MCP server (leader only) |
| Application-level keepalive | MCP server (leader) ↔ Figma plugin (UI) |
| Election (leader/follower) | MCP server (any instance) |
| `figma.*` API calls | Figma plugin (main thread) |
| Tool call dispatch (router.ts) | Figma plugin (main thread) |
| Node tree serialization | Figma plugin (main thread, `serializer.ts`) |
| Variable / style lookup | Figma plugin (main thread) |
| Sprite generation (`buildSprite`) | MCP server (pure JS, in `sprite.ts`) |
| Dev Mode mirror (CSS / SVG / HTML / JSON / IMG) | Figma plugin (UI ↔ main) — direct, no MCP |
| Plugin UI rendering | Figma plugin (React in iframe) |
| Connection status display | Figma plugin (UI) |
| Lock / collapse / hotkeys | Figma plugin (UI) |
| `clientStorage` debug log | Figma plugin (main thread) |
| `localStorage` collapse state | Figma plugin (UI) |

## Data flow for a single tool call

```
┌────────────┐    stdio/JSON-RPC     ┌────────────────────────┐
│ AI agent   │ ────────────────────► │ MCP server             │
│            │  tools/call          │                        │
│            │  { name, args }      │  1. validate input     │
│            │                      │     (Zod schema)       │
│            │                      │  2. resolve fileKey    │
│            │                      │     (connections map)  │
│            │                      │  3. check cache (5s)   │
│            │                      │  4. sendWithParams()   │
│            │                      │     │                  │
│            │                      │     ▼                  │
│            │                      │  ┌──────────────────┐  │
│            │                      │  │ WebSocket :1994  │  │
│            │                      │  │  ws.send(payload)│  │
│            │                      │  └────────┬─────────┘  │
│            │                      │           │            │
│            │                      │  ┌────────▼─────────┐  │
│            │                      │  │ Figma plugin     │  │
│            │                      │  │  UI ─► main     │  │
│            │                      │  │  figma.* call   │  │
│            │                      │  └────────┬─────────┘  │
│            │                      │           │            │
│            │                      │  ┌────────▼─────────┐  │
│            │                      │  │ Real Figma doc   │  │
│            │                      │  └──────────────────┘  │
│            │                      │           │            │
│            │                      │   PluginResponse       │
│            │ ◄──────────────────── │  (data or error)      │
│  result    │                      │                        │
└────────────┘                      └────────────────────────┘
```

The full round-trip typically takes 20-100 ms for a small read, 200-800 ms for a complex write (e.g. `set_node_properties` on a deep frame).

## Concurrency model

- **One tool call at a time per Figma plugin** — the plugin's main thread processes requests sequentially via the `figma.ui.onmessage` handler. If you need parallel tool calls, you need to attach multiple Figma plugins (one per file). The leader/follower model then routes each call to the right file's plugin.
- **Many parallel AI agents on the same server** — the server is single-threaded Node.js, so `Promise.all` in any one tool handler is sequential. But the WebSocket bridge, the `/rpc` endpoint, and the MCP stdio transport all handle concurrent connections independently.
- **Many files** — the leader holds one WebSocket per file. Adding more files just opens more WebSockets.

## Failure modes

| Failure | What happens |
|---|---|
| AI client loses stdio to the server | Agent's tool call times out, agent sees a "tool unavailable" error |
| Server dies (crash, kill) | AI client respawns it; the new instance becomes a follower, fails to bind 1994, talks to the existing leader. If no leader exists, the new instance promotes itself. |
| Leader dies | Followers detect `/ping` failure after 2 polls (4-10 s) and try to take over the port. Figma plugin's WebSocket disconnects; plugin tries to reconnect. |
| Figma plugin iframe destroyed (Livegraph reload, panel close) | The plugin's WS is half-open. The leader's `__server_ping`/`__client_pong` keepalive detects the dead state within 15 s and evicts. The plugin's UI handler then tries to reconnect. |
| Figma plugin main thread crashes | The plugin process is gone. The user must restart the plugin. All in-flight requests reject with `"Plugin not connected"`. |
| Figma file is closed | The plugin's `figma.ui.onmessage` keeps working, but `figma.currentPage` is empty / undefined. Tools that touch nodes fail with `"Node not found"`. |
| `figma.fileKey` is empty | The plugin sends an empty `fileKey` query param. The server rejects with HTTP 400 "missing fileKey". |

## Where state lives

- **AI agent** — its own memory. No state about Figma is persisted on the agent side.
- **MCP server** — in-memory only. No disk persistence (except what `save_screenshots` / `save_node_json` / `export_icon_sprite` write to disk when called). Election state is per-process.
- **Figma plugin UI** — `localStorage` for the collapse state. The plugin's React state lives in memory (the iframe is destroyed and recreated often).
- **Figma plugin main thread** — `figma.clientStorage` for the debug log (key: `bridge-debug`, max 50 entries). This persists across plugin restarts but is per-file.
- **Figma itself** — the source of truth for everything else.

## Security model

- The WebSocket is bound to `localhost:1994`. It is not reachable from the network unless the user explicitly forwards the port.
- `Origin` header is checked (configurable via `ALLOWED_ORIGINS`). Figma desktop sends `Origin: null`; you have to set `ALLOWED_ORIGINS_INCLUDE_NULL=1` to accept it.
- Optional shared secret via `BRIDGE_SECRET` env (sent as `?secret=…` query param by the plugin).
- The Figma plugin's `manifest.json` declares `networkAccess.allowedDomains: ["ws://localhost:1994"]` — the plugin cannot make any other network request.
- `outputPath` for write tools is resolved relative to the server's CWD; the server refuses to write outside that directory.
- No telemetry, no analytics, no remote calls. The server's only network surface is the MCP stdio transport (to the AI client) and the localhost WebSocket (to the Figma plugin).

## Extending the system

To add a new tool:

1. **Add the schema** in `server/src/schema.ts` (one new entry in `toolInputSchemas` + one new mapper in `rpcToArgs`).
2. **Register the tool** in `server/src/tools.ts` (`server.tool(name, description, schema, async (args) => { … })`).
3. **Add the handler** in `plugin/src/main/handlers/<tool_name>.ts` exporting `handle(request): Promise<PluginResponse>`.
4. **Wire it in** the dispatch table in `plugin/src/main/router.ts` and the `RequestType` union in `plugin/src/main/types.ts`.
5. **Test it** — see the existing `export_icon_sprite` for an end-to-end example.

You don't need to touch the WebSocket bridge, the leader/follower code, or the message protocol — those are stable. The tool just plugs into the existing pipeline.
