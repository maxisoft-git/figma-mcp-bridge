# Upstream & fork review

Audit of `gethopp/figma-mcp-bridge` and its 96 forks, done 2026-09-24, to decide
what is worth porting into this fork (`@maxisoft/figma-mcp-bridge`).

- Upstream: 665★, 96 forks, MIT, active (last push 2026-09-21).
- Our base: upstream `172663c` (2026-06-25, keepalive #34) + our rebrand (2026-06-28).
  Everything upstream shipped after that is absent here.

## Upstream commits we lack

| Commit | Change | Status |
|---|---|---|
| `93d2b56` | Figma Motion API (keyframes + animation styles) | TODO |
| `dc2ea5a` | `set_solid_fill` / `set_text_content` accept `create_*` field names | n/a — we don't have these tools |
| `cc1c083` | `create_image` wire-shape validation on the follower path (#43) | **ported** |
| `1218122` | stdin EOF + SIGHUP shutdown (#44) | **ported** (we already had stdin/EPIPE) |
| `bef8e58` | `create_page` tool (#42) | **ported** |
| `837f96e` | pre-commit hooks, prettier, root `package.json` | skipped (repo hygiene, not required) |
| `734d4c1` | `import_html_layers` (#47) | TODO |
| `ef0cf04` | collapsible plugin window (#49) | already present (our `ui-resize`) |
| `4b388cf` | sandbox build / typecheck / format repair (#55) | **partially ported** (`.gitattributes`, `vite-env.d.ts`) |
| `e8db933` | `get_layout_tree` — absolute layout geometry (#50) | **ported** |

## Forks with unique code (21 of 96)

Most forks are silent snapshots. Ranked by unique work:

| Fork | +/− | Notable |
|---|---|---|
| realSeyed | +76 | extensions architecture; variables write (update/delete/bind/batch); text style tools; component/instance property tools; sections (list/get/create/fit/move); `get_node` budget + serializer perf; e2e/perf scripts |
| SadhuG/figma-design-relay | +60 | `run_script` escape hatch + JSON-safe serializer; enriched serializer; design-context v2 (React/HTML/CSS codegen, tokens, asset export); loopback `/rpc` bind |
| joshghal/figma-agent-bridge | +29 | file-ops + `execute_code` + page tools + cross-file sync; setup.sh; auth on `/rpc` + `/ws`; **SSRF guard in `create_image`**; port 1994→31856 |
| vladmdgolam | +13 | isolate-screenshot, image_fill_export, save_children_json, WEBP, depth fix |
| mhmd-bagha | +7 | comments via REST API; API token UI; remote MCP over HTTP |
| sudilshr | +6 | variables write; component promote/instance; modes/bulk bind |
| boredom1234 | +4 | Zod schema factories, effects validation |
| kido-luci | +4 | leader bound to loopback |
| ilia-kuzmin | +3 | `create_component_set`, `create_instance`, `set_instance_properties` |
| xiayuguo | +3 | `FIGMA_BRIDGE_LEADER_URL` cross-machine leader |
| tranvannghia021 | +3 | batch nested-tree tools; prototype/Smart Animate |
| chihuy105 | +3 | persistent read-result cache |
| magentawood | +2 | design-system extraction (DTCG) — overlaps ours |
| primizor | +2 | `execute_code`, instance/ancestry tools |
| christullier | +2 | comment tools via REST |
| xurunxin | +1 | agent CLI, state-aware Figma lifecycle, server `skills/` |
| dudzio12 | +2 | subnode fetch fix |
| bharadwajpro | +1 | configurable server settings |
| geekftz | +1 | tech doc |
| bryanherdianto | +4 | "replicating locally" — nothing to take |
| matiukhov | +48 | 0 added files — early merges of upstream PRs, no unique code |

## Porting plan

- **P0 — ported**: `create_image` SSRF guard + size/redirect/time limits
  (`server/src/ssrf.ts`, tested); `create_image` wire-shape validation on the
  follower path; loopback bind (`FIGMA_BRIDGE_HOST` to override); SIGHUP
  shutdown; `.gitattributes`, `plugin/src/vite-env.d.ts`, es2020 sandbox target.
- **P1 — ported**: `create_page`, `get_layout_tree`, `execute_code`
  (`eval-direct` + `script-result` + `script-runner`, tested); the realSeyed
  extension areas — sections, variables write, typography, components (25 tools).
- **Still open**: `get_node` budget + serializer defaults, `import_html_layers`,
  Motion API, WEBP/format inference, persistent cache.
- **P3 — open**: onboarding `setup.sh`, agent CLI, comments via REST,
  cross-machine leader.

### Collisions

The core tools keep their own implementation where an extension tool shares a
name (`create_variable_collection`, `create_text_style`, `list_components`,
`create_component`, `create_instance`, `set_instance_properties`). The
extension registration is guarded in `server/src/extensions/index.ts`, and a
core request type is dispatched first in `plugin/src/main/router.ts`.

## Licensing

Every relevant repo is MIT (same as ours). Ports keep upstream attribution; the
`import_html_layers` port must carry `plugin/src/html-figma/NOTICE.md`.
