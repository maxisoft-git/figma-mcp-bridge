# Figma MCP Bridge

[![Pairing with Hopp](https://gethopp.app/git/hopp-shield.svg?ref=hopp-repo)](https://gethopp.app)

- [Demo](#demo)
- [Quick Start](#quick-start)
- [Available Tools](#available-tools)
- [Style Data](#style-data)
- [Local development](#local-development)
- [Structure](#structure)
- [How it works](#how-it-works)

<br/>

<img src="https://raw.githubusercontent.com/gethopp/figma-mcp-bridge/main/logo.png" alt="Figma MCP Bridge" align="center" />

<br/>

While other amazing Figma MCP servers like [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP/) exist, one issues is the [API limiting](https://github.com/GLips/Figma-Context-MCP/issues/258) for free users.

The limit for free accounts is 6 requests per month, yes **per month**.

Figma MCP Bridge is a solution to this problem. It is a plugin + MCP server that streams live Figma document data to AI tools without hitting Figma API rate limits, so its Figma MCP for the rest of us ✊

It supports multiple Figma files connected simultaneously and exposes rich style data (fills, strokes, effects, auto-layout, typography, variables) for accurate design-to-code translation.

## Demo

[Watch a demo of building a UI in Cursor with Figma MCP Bridge](https://youtu.be/ouygIhFBx0g)

[![Watch the video](https://img.youtube.com/vi/ouygIhFBx0g/maxresdefault.jpg)](https://youtu.be/ouygIhFBx0g)


## Quick Start

### 1. Add the MCP server to your favourite AI tool

Add the following to your AI tool's MCP configuration (e.g. Cursor, Windsurf, Claude Desktop):

```json
{
  "figma-bridge": {
    "command": "npx",
    "args": ["-y", "@gethopp/figma-mcp-bridge"]
  }
}
```

That's it — no binaries to download or install.

### 2. Add the Figma plugin

Download the plugin from the [latest release](https://github.com/gethopp/figma-mcp-bridge/releases) page, then in Figma go to `Plugins > Development > Import plugin from manifest` and select the `manifest.json` file from the `plugin/` folder.

### 3. Start using it 🎉

Open a Figma file, run the plugin, and start prompting your AI tool. The MCP server will automatically connect to the plugin.

If you want to know more about how it works, read the [How it works](#how-it-works) section.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_files` | List all connected Figma files (supports multi-file) |
| `get_document` | Get the full page document tree |
| `get_selection` | Get currently selected nodes |
| `get_node` | Get a specific node by ID |
| `get_styles` | Get all local paint, text, effect, and grid styles |
| `get_metadata` | Get file name, pages, and current page info |
| `get_design_context` | Get a depth-limited tree optimized for design context |
| `get_variable_defs` | Get all variable collections, modes, and values (design tokens) |
| `get_screenshot` | Export nodes as PNG/SVG/JPG/PDF (base64) |
| `save_screenshots` | Export and save screenshots directly to disk |

All tools accept an optional `fileKey` parameter when multiple Figma files are connected simultaneously.

## Style Data

The bridge serializes comprehensive style data for each node:

- **Fills & strokes** -- solid colors, linear/radial/angular/diamond gradients, image fills, stroke weight, alignment, dash patterns
- **Effects** -- drop shadows, inner shadows, layer/background blur with offset, radius, spread, and color
- **Corner radius** -- uniform and per-corner radii, corner smoothing (iOS-style superellipse)
- **Auto-layout** -- direction, gap, alignment, sizing mode, wrap, counter-axis spacing
- **Typography** -- font family, weight, style, size, line height, letter spacing, decoration, alignment, auto-resize
- **Layout** -- opacity, blend mode, visibility, rotation, constraints, clipping, padding
- **Variables** -- full variable collections with modes and resolved values (design tokens)

## Local development

#### 1. Clone this repository locally

```bash
git clone git@github.com:gethopp/figma-mcp-bridge.git
```

#### 2. Build the server

```bash
cd server && npm install && npm run build
```

#### 3. Build the plugin

```bash
cd plugin && bun install && bun run build
```

#### 4. Add the MCP server to your favourite AI tool

For local development, add the following to your AI tool's MCP config:

```json
{
  "figma-bridge": {
    "command": "node",
    "args": ["/path/to/figma-mcp-bridge/server/dist/index.js"]
  }
}
```

## Structure

```
Figma-MCP-Bridge/
├── plugin/   # Figma plugin (TypeScript/React)
└── server/   # MCP server (TypeScript/Node.js)
    └── src/
        ├── index.ts      # Entry point
        ├── bridge.ts     # WebSocket bridge to Figma plugin
        ├── leader.ts     # Leader: HTTP server + bridge
        ├── follower.ts   # Follower: proxies to leader via HTTP
        ├── node.ts       # Dynamic leader/follower role switching
        ├── election.ts   # Leader election & health monitoring
        ├── tools.ts      # MCP tool definitions
        └── types.ts      # Shared types
```

## How it works

There are two main components to the Figma MCP Bridge:

### 1. The Figma Plugin

The Figma plugin is the user interface for the Figma MCP Bridge. You run this inside the Figma file you want to use the MCP server for, and its responsible for getting you all the information you need.

### 2. The MCP Server

The MCP server is the core of the Figma MCP Bridge. As the Figma plugin connects with the MCP server via a WebSocket connection, the MCP server is responsible for:
- Handling WebSocket connections from the Figma plugin
- Forwarding tool calls to the Figma plugin
- Routing responses back to the Figma plugin
- Handling leader election (as we can have only one WS connection to an MCP server at a time)


```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FIGMA (Browser)                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Figma Plugin                                  │  │
│  │                    (TypeScript/React)                                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ WebSocket
                                      │ (ws://localhost:1994/ws)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PRIMARY MCP SERVER                                 │
│                         (Leader on :1994)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Bridge                                    Endpoints:               │    │
│  │  • Manages WebSocket conn                  • /ws    (plugin)        │    │
│  │  • Forwards requests to plugin             • /ping  (health)        │    │
│  │  • Routes responses back                   • /rpc   (followers)     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                           ▲                              ▲
                           │ HTTP /rpc                    │ HTTP /rpc
                           │ POST requests                │ POST requests
                           │                              │
         ┌─────────────────┴───────────┐    ┌─────────────┴───────────────┐
         │    FOLLOWER MCP SERVER 1    │    │    FOLLOWER MCP SERVER 2    │
         │                             │    │                             │
         │  • Pings leader /ping       │    │  • Pings leader /ping       │
         │  • Forwards tool calls      │    │  • Forwards tool calls      │
         │    via HTTP /rpc            │    │    via HTTP /rpc            │
         │  • If leader dies →         │    │  • If leader dies →         │
         │    attempts takeover        │    │    attempts takeover        │
         └─────────────────────────────┘    └─────────────────────────────┘
                    ▲                                      ▲
                    │                                      │
                    │ MCP Protocol                         │ MCP Protocol
                    │ (stdio)                              │ (stdio)
                    ▼                                      ▼
         ┌─────────────────────────────┐    ┌─────────────────────────────┐
         │      AI Tool / IDE 1        │    │      AI Tool / IDE 2        │
         │      (e.g., Cursor)         │    │      (e.g., Cursor)         │
         └─────────────────────────────┘    └─────────────────────────────┘
```
