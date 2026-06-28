# Tool reference

75 tools, organised by what they do. Every tool:

- Has a unique name (e.g. `get_node`)
- Takes a Zod-validated object as input
- Returns either `{ data: … }` on success or `{ error: "…" }` on failure
- Runs entirely in the Figma sandbox (no network, no disk)
- When `fileKey` is omitted and exactly one Figma file is connected, the server picks it for you

`nodeIds` is colon-separated (e.g. `"4029:12345"`). Composite IDs for instances use semicolons (e.g. `"4029:12345;4029:67890"`).

---

## Reading the document

### `list_files`

List every Figma file currently connected to the bridge.

**Input:** none.

**Returns:** `[{ fileKey, fileName }]`

```json
[
  { "fileKey": "oAKWWJ9y0BTH1XPmnYvGLw", "fileName": "My file" }
]
```

---

### `get_metadata`

Lightweight summary of the current file: name, page count, current page.

**Input:** none.

**Returns:** `{ fileName, currentPageId, currentPageName, pageCount, pages: [{ id, name }] }`

---

### `get_document`

Full document tree of the current page.

**Input:**

| Field | Type | Default | Description |
|---|---|---|---|
| `includeHidden` | boolean | `false` | Include hidden nodes (default) or not |
| `includeImageData` | boolean | `false` | Inline base64 image bytes for nodes with image fills (large response) |
| `enrich` | boolean | `false` | Resolve paint / text / effect styles to human-readable names + values |

**Returns:** a serialised node tree. See `get_node` for the shape of each node.

---

### `get_node`

Fetch a single node (and optionally its children) by ID.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `nodeId` | string | yes | Colon-separated ID, e.g. `"4029:12345"` |
| `depth` | number | no (default `Infinity`) | How many levels of children to include |
| `includeHidden` | boolean | `false` | Include hidden nodes |
| `includeImageData` | boolean | `false` | Inline image bytes |
| `enrich` | boolean | `false` | Resolve style references |

**Returns:** a single node. Same shape as nodes in `get_document` output.

**Example call:**

```json
{
  "tool": "get_node",
  "params": {
    "nodeId": "1409:32080",
    "fileKey": "oAKWWJ9y0BTH1XPmnYvGLw",
    "depth": 2
  }
}
```

---

### `get_selection`

Get the currently selected nodes.

**Input:** none.

**Returns:** `[{ id, name, type, bounds }]`

---

### `get_design_context`

Like `get_document`, but with a depth limit (for giving the agent a "what does this section look like" answer without the full tree).

**Input:**

| Field | Type | Default |
|---|---|---|
| `depth` | number | `2` |
| `includeHidden` | boolean | `false` |
| `includeImageData` | boolean | `false` |
| `enrich` | boolean | `false` |

---

### `get_styles`

List all local styles in the file.

**Input:** none.

**Returns:** `{ paintStyles, textStyles, effectStyles, gridStyles }` — each is an array of `{ id, name }`.

---

### `get_variable_defs`

List all variable collections, their modes, and every variable's value per mode.

**Input:** none.

**Returns:** full tree of variables, modes, values. Use `find_nodes_by_variable` to see where a given variable is used.

---

### `get_variable_values` (via `find_nodes_by_variable`)

Find every node bound to a given variable.

**Input:**

| Field | Type | Required | Description |
|---|---|---|---|
| `variable` | string | yes | Variable ID or name |
| `global` | boolean | default `true` | Search every page, not just the current one |
| `limit` | number | default `500` | Cap on results |

**Returns:** `{ variable: { id, name, type }, count, usages: [{ nodeId, name, type, boundOn, value }] }`

---

## Screenshots and exports

### `get_screenshot`

Export a node as PNG, SVG, JPG, or PDF, returned as a base64 string.

**Input:**

| Field | Type | Default |
|---|---|---|
| `nodeIds` | string[] | current selection if empty |
| `format` | `"PNG"` \| `"SVG"` \| `"JPG"` \| `"PDF"` | `"PNG"` |
| `scale` | number | `2` (ignored for SVG) |

**Returns:** `[{ nodeId, nodeName, format, base64, width, height }]`

### `save_screenshots`

Same as `get_screenshot`, but writes the result to disk. **Batch tool** — takes `items: [{ nodeId, outputPath, format?, scale? }]`.

**Input:**

| Field | Type | Required |
|---|---|---|
| `items` | `[{ nodeId, outputPath, format?, scale? }]` | yes |

**Returns:** per-item: `{ nodeId, nodeName, outputPath, format, width, height, bytesWritten, success, error? }`

`outputPath` is relative to the MCP server's current working directory. The server refuses to write outside that directory (path-traversal protection).

### `get_image`

Like `get_screenshot` but for image-bearing nodes. Returns `{ mime, base64, source, scaleMode, bytes, … }`.

**Input:** `{ nodeId, backgroundOnly? }` (one node per call).

### `save_node_json`

Serialise one or more nodes as JSON to disk.

**Input:** `{ items: [{ nodeId, outputPath }] }`

Useful when a node tree is too large to put in the conversation — you dump it to a file and reference it by path.

---

## Dev Mode mirror

These run **directly in the plugin UI** (no MCP roundtrip) and produce the same output as Figma's Dev Mode Inspect panel.

| Tool | Output |
|---|---|
| `get_dev_css` | The node's computed CSS (string) |
| `get_dev_svg` | The node exported as inline SVG markup |
| `get_dev_html` | HTML reproduction of the node's visual structure |
| `get_dev_json` | JSON dump of the node + its computed styles |
| `get_dev_image` | PNG export of the node |

All five take `{ nodeId? }` (defaults to current selection) and return `{ ok, tab, requestId, …content }`.

---

## Writing to the document

Every write tool takes `{ nodeId | nodeIds, …args }` and returns the previous state of the affected nodes, so the agent can show a diff or roll back.

### Style & visibility

| Tool | Effect |
|---|---|
| `set_node_visibility` | Show or hide |
| `set_text_content` | Change text of a TEXT node |
| `set_text_properties` | Font, size, weight, alignment, line-height, letter-spacing, color |
| `set_node_properties` | Position, size, rotation, opacity, fill, corner radius |
| `set_stroke` | Stroke color / weight / position / alignment / cap / join / dash |
| `set_effects` | Drop shadow, inner shadow, blur (and remove) |
| `set_constraints` | Horizontal / vertical constraints (min, max, scale, stretch) |
| `set_gradient_fill` | Linear / radial / angular / diamond gradient |
| `set_blend_mode` | Normal, Multiply, Screen, Overlay, … |
| `set_clipping` | Clip content to node bounds |
| `set_auto_layout` | Layout mode, padding, gap, alignment, primary/counter-axis sizing |
| `apply_style` | Apply a local paint / text / effect style to a node |
| `flatten` | Flatten vector / boolean-operation descendants |

### Structure

| Tool | Effect |
|---|---|
| `duplicate_nodes` | Clone one or more nodes (and their children) |
| `reparent_nodes` | Move nodes to a new parent, optionally at an index |
| `delete_nodes` | Delete (requires `confirm: true` as a safety) |
| `move_nodes` | Move by absolute coordinates |
| `set_z_order` | Bring to front / send to back / move up / move down |
| `align_nodes` | Align two or more nodes horizontally / vertically |
| `create_group` | Wrap in a GROUP |
| `flatten` | Flatten a group of vectors into one |
| `set_current_page` | Switch the active page |

### Creation

| Tool | Effect |
|---|---|
| `create_frame` | New FRAME |
| `create_text` | New TEXT |
| `create_shape` | New RECTANGLE / ELLIPSE / LINE |
| `create_image` | New image-bearing frame from a URL or local file path |
| `create_component` | New COMPONENT |
| `create_instance` | New INSTANCE of a component |
| `set_instance_properties` | Override instance properties |
| `create_paint_style` | New local paint style |
| `create_text_style` | New local text style |
| `create_effect_style` | New local effect style |
| `create_grid_style` | New local grid style |
| `create_variable_collection` | New variable collection |
| `create_variable` | New variable in an existing collection |
| `create_design_token_alias` | Alias one variable to another |
| `create_styles_table` | Render a documentation page listing every style in the file |

### Bulk operations

| Tool | Effect |
|---|---|
| `batch_mutation` | Apply many small mutations in a single call (faster than 75 separate tool calls; supports per-node param resolution via `tmp:` references) |
| `update_component_instances` | Push master changes to all instances of a component |
| `bulk_rename` | Rename nodes by regex pattern, with optional scope (page / selection / sub-tree) |
| `bulk_swap_text` | Replace text on multiple nodes at once |
| `switch_theme` | Switch every node bound to variables in collection A to the equivalent mode in collection B (light → dark) |
| `apply_design_system` | Apply a saved design-system manifest (paint / text / effect styles + variables) to the current file |
| `apply_style_preset` | Apply a named style preset (e.g. "elevated card") to one or more nodes |
| `apply_aria_labels` | Auto-name layers with semantic role + content (best-effort, based on heuristics) |
| `normalize_layers` | Rename all layers to a consistent casing / separator convention |
| `normalize_spacing` | Snap paddings / gaps / positions to the design system's spacing scale |
| `set_z_index_strategy` | Apply a z-order policy (e.g. "frame always above its children") to a sub-tree |
| `lint_styles` | Report nodes whose styles don't match the local style of the same name (e.g. raw fill that should be a `paintStyle`) |
| `go_to_node` | Move the editor viewport to the given node (UI side-effect, doesn't return data) |
| `diff_layouts` | Compute a structural diff between two node sub-trees (e.g. for design review) |
| `manage_snapshots` | Take, list, restore, or delete point-in-time snapshots of any node tree |

### Design system

| Tool | Effect |
|---|---|
| `extract_design_system` | Walk a sub-tree (or whole file) and collect every paint, text, effect, spacing, radius, variable into a manifest |
| `extract_design_system_bulk` | Same, across multiple sub-trees at once |
| `manage_manifests` | List / save / load / delete stored manifests |
| `export_design_tokens` | Dump a manifest as Style Dictionary JSON, CSS variables, or Tailwind config |
| `import_design_tokens` | Apply a Style Dictionary JSON / CSS variables / Tailwind config to a file |
| `storybook_import` | Create a Figma frame from a Storybook-like JSON spec (text / rect / frame / circle, with nested auto-layout) |
| `spec_import` | Higher-level JSON spec: row / column / text / button / input / rect — for "describe a layout in plain English" |
| `generate_component_from_description` | Agent-friendly: pass a free-text description, get a component back |
| `analyze_node_against_design` | Given a node, list every place it deviates from the design system |

### AI helpers

| Tool | Effect |
|---|---|
| `figma_inspect` | One-shot high-density dump of a node (fills, strokes, effects, auto-layout, type, variables) for the agent's context window |
| `inspect_node` | Like `figma_inspect` but with a structured deviation report against the file's local styles |
| `inspect_variables` | Which variables are referenced by a given sub-tree, and how |
| `generate_code` | Generate starter HTML / JSX / SwiftUI / Compose / Flutter code for a node |
| `visualize_layout` | Render a node's auto-layout as an ASCII tree |
| `get_layout_measurements` | Padding, gap, alignment, sizing-mode breakdown for a sub-tree |
| `get_component_variants` | List every variant of a COMPONENT_SET |
| `get_set_property_value` | Read an instance override for a component property |
| `set_node_metadata` | Store arbitrary metadata on a node (agent scratch space) |
| `get_node_metadata` | Read that metadata back |
| `get_constraints` | Read every constraint (h/v, layout-positioning) for a sub-tree |
| `get_selection_chain` | Walk the parent chain from each selected node up to the page root |

### Sprite export

#### `export_icon_sprite`

Find SVG icons across the file, deduplicate them, and write a single `<symbol>`-based sprite to disk.

**Input:**

| Field | Type | Default | Description |
|---|---|---|---|
| `outputPath` | string | required | File to write the sprite to (relative to server CWD) |
| `scope` | `"page"` \| `"selection"` \| `"document"` | `"page"` | Where to look |
| `pageId` | string | (current page) | Required only when `scope="page"` and you want a specific page |
| `namePattern` | string regex | `/^(icon\|ic[-_\/])/i` | RegExp applied to node name. Pass `""` to disable the filter. |
| `sizeFilter` | `{ width, tolerance? }` | none | Only include icons whose width ≈ height ≈ `width` within `tolerance` (default 1 px). |
| `includeHidden` | boolean | `false` | Include hidden nodes |
| `maxIcons` | number | `1000` | Safety cap |
| `dedupeMode` | `"raw"` \| `"normalized"` \| `"paths"` \| `"none"` | `"normalized"` | See below |
| `spriteFormat` | `"symbol"` \| `"g"` | `"symbol"` | `<symbol id viewBox>` or flat `<g id>` |
| `fillStrategy` | `"currentColor"` \| `"preserve"` \| `"black"` | `"currentColor"` | Replace / keep / force the fill on exported paths |
| `fileKey` | string | (auto) | Which file to query |

**Dedupe modes:**

- `raw` — every byte must match. Two icons with the same path but different `fill` are different.
- `normalized` (default) — strips `fill` / `stroke` / `style` / `class` / `id` / dimensions / whitespace before comparing. Two visually identical icons collapse.
- `paths` — hashes only the `d` attribute of every `<path>`. Two icons with different wrappers but the same path geometry collapse.
- `none` — no dedup at all. Every candidate becomes its own `<symbol>`. Names with collisions get auto-numbered (`-2`, `-3`, …). Use this when you want to inspect the file as-is and dedup yourself later.

**Sprite id strategy:**

The plugin calls `sanitizeSpriteId(name)` to turn `hugeicons:youtube` into `hugeicons-youtube`. When two icons have the same sanitized id, the second gets `-2`, the third `-3`, etc.

**Returns:**

```json
{
  "scope": "page",
  "totalFound": 312,
  "uniqueIcons": 247,
  "duplicatesRemoved": 65,
  "truncated": false,
  "outputPath": "/abs/path/to/icons.svg",
  "bytesWritten": 18432,
  "groups": [
    { "spriteId": "hugeicons-youtube", "count": 4, "nodeIds": ["1:2", "3:4", "5:6", "7:8"], "keptNodeId": "1:2", "keptName": "hugeicons:youtube", "width": 24, "height": 24 }
  ]
}
```

**Standalone equivalent** (no AI client required):

```bash
node scripts/export-via-rpc.mjs \
  --fileKey oAKWWJ9y0BTH1XPmnYvGLw \
  --out ./icons.svg \
  --pattern "hugeicons|solar|iconamoon" \
  --max 1000
```

The standalone script uses `dedupeMode: "none"` and writes to disk directly. Use it as a starting point and post-process the sprite yourself.

---

## Input shape (all tools)

Every tool's input is validated against a Zod schema in `server/src/schema.ts`. Common fields:

| Field | Type | Description |
|---|---|---|
| `fileKey` | string (optional) | Figma file key. Required only if more than one file is connected. |
| `outputPath` | string | (write tools) Relative path inside the MCP server's CWD. Resolved server-side; path traversal is blocked. |
| `nodeId` | string | Colon-separated Figma node ID. |
| `nodeIds` | string[] | Array of colon-separated IDs. |
| `confirm` | boolean | Required `true` for destructive tools (`delete_nodes`). |

## Output shape (all tools)

MCP tools return:

```json
{
  "content": [{ "type": "text", "text": "<JSON string>" }]
}
```

The server also wraps this in `{ data, error }` for direct `/rpc` access. The `text` field is either:

- the JSON of the tool's success payload
- a string starting with `Bridge error: …` for transport-level errors (no plugin connected, timeout, etc.)
