# @maxisoft/figma-mcp-bridge

**MCP server that bridges Figma plugin data to AI tools without hitting Figma's REST API rate limits.**

This is the server half of the Figma MCP Bridge. The other half is the **Figma plugin**, which lives in the [GitHub repository](https://github.com/maxisoft-git/figma-mcp-bridge) and runs inside Figma's plugin sandbox. The two talk to each other over a local WebSocket on `localhost:1994`.

## What you need

1. **Node.js 20+** (or Bun)
2. **The Figma plugin running in Figma** — see the [repo README](https://github.com/maxisoft-git/figma-mcp-bridge#quick-start) for install instructions
3. **An MCP-compatible AI client** — Claude Desktop, Claude Code, Cursor, Windsurf, Cline, etc.

## Quick start

### 1. Add the server to your AI client

Claude Desktop / Claude Code / Cursor / Cline all read the same MCP config format:

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "npx",
      "args": ["-y", "@maxisoft/figma-mcp-bridge"],
      "env": {
        "ALLOWED_ORIGINS_INCLUDE_NULL": "1"
      }
    }
  }
}
```

`ALLOWED_ORIGINS_INCLUDE_NULL=1` is required for Figma desktop (the iframe reports `Origin: null`). If you only use Figma in a browser tab, you can omit it.

### 2. Run the Figma plugin

In Figma: `Plugins → Development → Figma MCP Bridge`. The panel shows connection status. Once it's green, all 75 tools are available to your AI agent.

## Running the server standalone

If you don't want `npx` to download the package each time, install it once:

```bash
npm install -g @maxisoft/figma-mcp-bridge
figma-mcp-bridge
```

Or from a local checkout:

```bash
git clone https://github.com/maxisoft-git/figma-mcp-bridge.git
cd figma-mcp-bridge/server
npm install
npm run build
node dist/index.js
```

## Configuration

| Env var | Default | Effect |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://figma.com,https://www.figma.com` | Comma-separated `Origin` headers to accept on the WebSocket. The Figma desktop webview sends `null` — see below. |
| `ALLOWED_ORIGINS_INCLUDE_NULL` | unset | If set to `1`, the string `null` is also accepted. **Required for Figma desktop.** |
| `BRIDGE_SECRET` | unset | If set, the Figma plugin must send this exact string as `?secret=…` query param. Empty (default) disables the check. |
| `RATE_LIMIT_RPC_DISABLE` | unset | If `1`, disables the per-IP rate limiter on `/rpc`. Useful for benchmarks; never set in production. |
| `DRAIN_TIMEOUT_MS` | `10000` | On `SIGTERM`/`SIGINT`, how long to wait for in-flight RPC requests to finish before forcing exit. |

## Endpoints (when running as leader)

The server binds port 1994 on localhost. Exactly one instance is the **leader** (binds the port); others become **followers** that forward to the leader via `/rpc`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/ping` | Health check. Returns `{ status, version }`. |
| `POST` | `/rpc` | JSON-RPC bridge for followers. Body: `{ tool, nodeIds?, params?, fileKey? }`. |
| `WS` | `/ws` | WebSocket upgrade used by the Figma plugin. |

## Tools

75 tools in 8 categories: read (document tree, metadata, styles, variables), screenshot/export, Dev Mode mirror, write (styles, structure, creation), bulk operations, design system, AI helpers, sprite export.

Full reference: [docs/en/tools.md](https://github.com/maxisoft-git/figma-mcp-bridge/blob/main/docs/en/tools.md)

## Architecture

```
   AI agent              this server                   Figma plugin
   (stdio)                 :1994                       (in sandbox)
      │                     │                                │
      │  tools/call         │                                │
      ├────────────────────►│                                │
      │                     ├── ws.send(payload) ──────────► │
      │                     │                                │
      │                     │◄── PluginResponse ────────────│
      │◄────────────────────│                                │
```

The server is the only component that crosses the AI-agent / Figma-sandbox boundary. See [docs/en/architecture.md](https://github.com/maxisoft-git/figma-mcp-bridge/blob/main/docs/en/architecture.md) for full details.

## Troubleshooting

**Server starts but `list_files` returns `[]`**
The Figma plugin isn't running. Open Figma, run the plugin.

**Connection flickers / drops every ~15 s**
The Figma iframe is being destroyed (Livegraph reload, panel close). The plugin will auto-reconnect. If it doesn't, click "Reconnect" in the plugin UI.

**`Request timed out` on a write tool**
The plugin's main thread is busy or blocked. Wait a few seconds and retry. If persistent, reload the plugin.

**`Bridge error: No plugin connected for fileKey "..."`**
Multiple Figma files are open. Specify `fileKey` in the tool call, or close all but one.

## Development

```bash
git clone https://github.com/maxisoft-git/figma-mcp-bridge.git
cd figma-mcp-bridge/server
npm install
npm run build
npm test
```

## License

MIT — see [LICENSE](https://github.com/maxisoft-git/figma-mcp-bridge/blob/main/LICENSE.md).

## Repository

https://github.com/maxisoft-git/figma-mcp-bridge
