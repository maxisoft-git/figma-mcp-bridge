# Figma MCP Bridge

- [Quick Start](#quick-start)
- [Available Tools](#available-tools)
- [Export Selection](#export-selection)
- [Style Data](#style-data)
- [Local development](#local-development)
- [Structure](#structure)
- [How it works](#how-it-works)

<br/>

A Figma plugin + MCP server that streams live Figma document data to AI tools without hitting Figma API rate limits. Supports multiple Figma files connected simultaneously and exposes rich style data (fills, strokes, effects, auto-layout, typography, variables) for accurate design-to-code translation.

Forked from [gethopp/figma-mcp-bridge](https://github.com/gethopp/figma-mcp-bridge).

## Quick Start

### 1. Add the MCP server to your AI tool

Add the following to your AI tool's MCP configuration (e.g. Cursor, Windsurf, Claude Desktop, Claude Code):

```json
{
  "figma-bridge": {
    "command": "node",
    "args": ["/path/to/figma-mcp-bridge/server/dist/index.js"]
  }
}
```

### 2. Add the Figma plugin

In Figma go to `Plugins > Development > Import plugin from manifest` and select the `manifest.json` file from the `plugin/` folder.

### 3. Start using it

Open a Figma file, run the plugin, and start prompting your AI tool. The MCP server will automatically connect to the plugin.

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

## Export Selection

The plugin has an **Export Selection to JSON** button that packages every selected node into a ZIP file containing:

- `{NodeName}.json` — full serialized design tree (bounds, fills, effects, auto-layout, typography, etc.)
- `{NodeName}.png` — 2x raster screenshot

Select frames in Figma, click the button, and get a ZIP download. Useful for extracting reference data without going through the MCP server.

## Style Data

The bridge serializes comprehensive style data for each node:

- **Fills & strokes** — solid colors, linear/radial/angular/diamond gradients, image fills, stroke weight, alignment, dash patterns
- **Effects** — drop shadows, inner shadows, layer/background blur with offset, radius, spread, and color
- **Corner radius** — uniform and per-corner radii, corner smoothing (iOS-style superellipse)
- **Auto-layout** — direction, gap, alignment, sizing mode, wrap, counter-axis spacing
- **Typography** — font family, weight, style, size, line height, letter spacing, decoration, alignment, auto-resize
- **Layout** — opacity, blend mode, visibility, rotation, constraints, clipping, padding
- **Variables** — full variable collections with modes and resolved values (design tokens)

## Local development

#### 1. Build the server

```bash
cd server && npm install && npm run build
```

#### 2. Build the plugin

```bash
cd plugin && bun install && bun run build
```

#### 3. Add the MCP server to your AI tool

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
figma-mcp-bridge/
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

Two main components:

### 1. The Figma Plugin

Runs inside Figma, connects to the local MCP server via WebSocket, and streams document data on demand. Also provides a direct **Export Selection** button for offline use.

### 2. The MCP Server

Handles WebSocket connections from the plugin and exposes MCP tools to AI clients. Supports leader/follower election so multiple AI tools can connect simultaneously.

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
                           │                              │
         ┌─────────────────┴───────────┐    ┌─────────────┴───────────────┐
         │    FOLLOWER MCP SERVER 1    │    │    FOLLOWER MCP SERVER 2    │
         │  • Proxies tool calls       │    │  • Proxies tool calls       │
         │  • Takes over if leader dies│    │  • Takes over if leader dies│
         └─────────────────────────────┘    └─────────────────────────────┘
                    ▲                                      ▲
                    │ MCP Protocol (stdio)                  │ MCP Protocol (stdio)
                    ▼                                      ▼
         ┌─────────────────────────────┐    ┌─────────────────────────────┐
         │      AI Tool / IDE 1        │    │      AI Tool / IDE 2        │
         └─────────────────────────────┘    └─────────────────────────────┘
```
