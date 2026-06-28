# MCP Server

The MCP server is the **bridge between your AI agent and the Figma plugin**. It implements the [Model Context Protocol](https://modelcontextprotocol.io/) (stdio transport) and exposes 75 Figma-aware tools. It also runs an HTTP + WebSocket server on `localhost:1994` that the Figma plugin connects to.

## Architecture

The server has three processes roles (any given instance is one of them at a time):

- **Leader** — binds port 1994, owns the WebSocket bridge to the Figma plugin, answers `/rpc` for followers, handles MCP stdio traffic from the AI client.
- **Follower** — connects to the leader's HTTP `/rpc` endpoint and forwards calls.
- **Unknown** — initial state. Tries to become leader; if the port is taken, becomes a follower.

You usually run one server, which is the leader. Multiple instances can run concurrently for high availability — one is leader, the rest are followers that take over if the leader dies.

```
   AI client              leader                       followers
   (stdio)                 :1994                          :1994 → leader
      │                     │                                │
      │  tools/call (RPC)    │                                │
      ├────────────────────►│                                │
      │                     ├─ /ws (WebSocket upgrade) ────► plugin
      │                     │     plugin connects with fileKey
      │                     │                                │
      │                     │     ┌── /rpc ───────────────┐  │
      │                     │◄────┤ follower forwards     │  │
      │                     │     │ follower gets result  │  │
      │                     ├────►│                       │  │
      │                     │     └───────────────────────┘  │
      │                     │                                │
      │  result             │                                │
      │◄────────────────────│                                │
```

## Endpoints

When a server is the **leader**, it exposes these endpoints on `:1994`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/ping` | Health check. Returns `{"status":"ok","version":"x.y.z"}`. Used by followers to detect a dead leader. |
| `POST` | `/rpc` | JSON-RPC bridge. Body: `{ tool, nodeIds?, params?, fileKey? }`. Used by followers to forward tool calls. Returns `{ data }` or `{ error }`. |
| `WS` | `/ws` | WebSocket upgrade. Used by the Figma plugin. |

All `/ws` requests are validated:

1. `fileKey` query param is required (Figma plugin always sends it).
2. If `BRIDGE_SECRET` env is set, `secret` query param must match.
3. If `origin` header is set and is not in `ALLOWED_ORIGINS`, the request is rejected with HTTP 403.
4. If a connection for the same `fileKey` is already open, the new one is rejected with a close frame (to prevent two Figma iframes fighting over the same plugin session).

## Configuration via env vars

| Env var | Default | Effect |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://figma.com,https://www.figma.com` | Comma-separated list of `Origin` headers to allow. The Figma desktop webview sends `null` — see `ALLOWED_ORIGINS_INCLUDE_NULL`. |
| `ALLOWED_ORIGINS_INCLUDE_NULL` | unset | If set to `1`, the string `null` is also accepted as an origin. Required for Figma desktop. |
| `BRIDGE_SECRET` | unset | If set, the Figma plugin must send this exact string as `?secret=…` query param. Empty (default) disables the check. |
| `BRIDGE_SECRET_REQUIRED` | unset | Alias / future. |
| `RATE_LIMIT_RPC_DISABLE` | unset | If set to `1`, disables the per-IP rate limiter on `/rpc`. Useful for benchmarks; never set in production. |
| `DRAIN_TIMEOUT_MS` | `10000` | On `SIGTERM`/`SIGINT`, how long to wait for in-flight RPC requests to finish before forcing exit. |

## Multi-file support

The leader can hold many concurrent WebSocket connections, each one a different Figma file:

```ts
this.connections = new Map<string /* fileKey */, ConnectionEntry>();
```

When the AI agent invokes a tool:

- If `fileKey` is provided in the call, the server looks up that file's connection and forwards the request.
- If only one file is connected, the server uses it (backward compatibility).
- If multiple files are connected and no `fileKey` is given, the server returns an error listing the connected files.

`list_files` always works and returns the current connections.

## Request flow

A single tool call goes through these stages:

```
AI client (MCP stdio)
  └─► tools/call { name, arguments }
        │
        │ (server.tool wrapper)
        ▼
leader.tools[name].handler
  └─► node.sendWithParams(tool, nodeIds, params, fileKey)
        │
        │ (Node → leader)
        ▼
leader.bridge.sendWithParams(tool, nodeIds, params, fileKey)
  └─► ws.send({ type, requestId, params, nodeIds })
        │
        │ (WebSocket to Figma plugin)
        ▼
plugin (UI React) → plugin (main thread) → figma.* API call
        │
        │ (response: figma.ui.postMessage → parent.postMessage → ws.send)
        ▼
leader.bridge.ws.onmessage({ type, requestId, data, error? })
  └─► resolve the Promise returned by sendWithParams
        │
        ▼
AI client gets the tool result
```

The leader sets a 30 s timeout on each request. If the plugin doesn't respond in that time, the request rejects with `"Request timed out"`.

## Keepalive (application-level)

Browsers don't respond to TCP `PING` frames. Figma destroys the plugin iframe without sending a WebSocket close frame, leaving a half-open TCP socket. The server can't tell the difference between "plugin alive, just idle" and "plugin iframe destroyed, TCP keepalive hasn't fired yet".

Workaround: an application-level `__server_ping` / `__client_pong` pair.

```
server                               plugin (UI)
  │                                       │
  │  setInterval(5s)                       │
  │   └─► ws.send({ type: "__server_ping" })
  │                                       │
  │                          ws.onmessage  │
  │                          if type==="__server_ping":
  │                            ws.send({ type: "__client_pong" })
  │                                       │
  │  on pong: lastPongAt = Date.now()      │
  │                                       │
  │  setInterval(5s)                       │
  │   └─► if (Date.now() - lastPongAt > 15s):
  │         ws.terminate()
  │         this.connections.delete(fileKey)
```

So the worst case for a dead connection is 15 s before the leader evicts it.

## Leader election

The election is a simple "whoever binds the port first wins" pattern:

```ts
// at startup
try {
  this.node.becomeLeader();  // tries to bind :1994
  return;
} catch {
  // port in use
}
if (await this.pingLeader()) {
  this.node.becomeFollower();  // leader is alive
}
// else: next tick will retry
```

Followers poll `/ping` on the leader every 3–5 s (random jitter to avoid thundering herd). If the leader is dead for 2 consecutive polls (4–10 s), a follower tries to take over by binding the port.

When a leader stops accepting new requests (graceful shutdown), the existing in-flight requests are allowed to finish for up to `DRAIN_TIMEOUT_MS` (default 10 s), then the process exits.

## Cache

The server has a 5-second in-memory response cache for **read-only** tool calls (a hard-coded list including `get_node`, `get_document`, `get_metadata`, etc.). Repeated identical calls within 5 s return the cached response without hitting the Figma plugin. This makes the agent's "verify that node X is still X" pattern cheap.

The cache is keyed by `sha256(tool + sorted(nodeIds) + JSON(params) + fileKey)`. Errors are **not** cached.

## Building

```bash
cd server
npm install
npm run build       # tsc → dist/index.js + .js.map + .d.ts
```

`dist/index.js` is what gets executed by the AI client's MCP config.

## Tests

```bash
cd server
npm test            # vitest run
```

Coverage:

- `schema.test.ts` — every Zod schema accepts valid input, rejects invalid input
- `bridge.test.ts` — WebSocket bridge, origin allowlist, duplicate connection rejection
- `election.test.ts` — leader/follower transitions
- `follower.test.ts` — RPC forwarding, error propagation
- `rate-limiter.test.ts` — per-IP request throttling
- `sprite.test.ts` — `buildSprite` dedup modes (`raw`, `normalized`, `paths`, `none`)
