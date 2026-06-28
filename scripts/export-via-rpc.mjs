#!/usr/bin/env node
/**
 * Standalone icon exporter — talks to the MCP server's bridge directly
 * via /rpc, applies the buildSprite logic, writes the file. This bypasses
 * the AI client (which may have lost connection to MCP) but still uses
 * the real Figma plugin data.
 *
 * Usage:
 *   node scripts/export-via-rpc.mjs \
 *     --fileKey oAKWWJ9y0BTH1XPmnYvGLw \
 *     --out ./icons.svg \
 *     --pattern "hugeicons|solar|iconamoon" \
 *     --max 50
 */

import { buildSprite } from "/Volumes/Work/Repos/figma-mcp-bridge/server/dist/sprite.js";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const opts = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) opts[args[i].slice(2)] = args[++i];
}
opts.scope ??= "page";
opts.max ??= 1000;
opts.maxIcons = parseInt(opts.max, 10);
opts.dedupeMode ??= "none";
opts.spriteFormat ??= "symbol";
opts.fillStrategy ??= "currentColor";
delete opts.max;

if (!opts.fileKey || !opts.out) {
  console.error("Required: --fileKey <key> --out <path>");
  process.exit(1);
}

const rpcUrl = "http://localhost:1994/rpc";

const rpc = async (tool, params = {}, fileKey) => {
  const body = JSON.stringify({ tool, params, fileKey });
  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

console.log(`→ Calling ${opts.fileKey} via /rpc (timeout 60s)…`);
try {
  const pluginArgs = {
    scope: opts.scope,
    // outputPath is required by the Zod schema, but the plugin handler
    // doesn't use it — the server-side tool wrapper extracts it before
    // forwarding. We still need to send it to pass schema validation.
    outputPath: opts.out,
  };
  if (opts.pageId) pluginArgs.pageId = opts.pageId;
  if (opts.pattern !== undefined) pluginArgs.namePattern = opts.pattern;
  if (opts.maxIcons) pluginArgs.maxIcons = parseInt(opts.maxIcons, 10);

  const r = await rpc("export_icon_sprite", pluginArgs, opts.fileKey);
  if (r.error) {
    console.error("✗ Error:", r.error);
    process.exit(1);
  }
  const icons = r.data?.icons ?? [];
  console.log(`✓ Got ${icons.length} raw icons (truncated: ${r.data?.truncated})`);

  const sprite = buildSprite(icons, {
    dedupeMode: opts.dedupeMode,
    spriteFormat: opts.spriteFormat,
    fillStrategy: opts.fillStrategy,
  });
  console.log(`✓ Built sprite: ${sprite.uniqueIcons} symbols, ${sprite.duplicatesRemoved} skipped`);

  const outPath = resolve(opts.out);
  await writeFile(outPath, sprite.sprite, { flag: "wx" });
  console.log(`✓ Written to ${outPath} (${Buffer.byteLength(sprite.sprite, "utf8")} bytes)`);

  console.log("\nGroups (first 30):");
  sprite.groups.slice(0, 30).forEach((g) => {
    console.log(`  ${g.spriteId.padEnd(50)} ×${String(g.count).padEnd(3)} ${g.width}×${g.height}`);
  });
  if (sprite.groups.length > 30) {
    console.log(`  … and ${sprite.groups.length - 30} more`);
  }
} catch (err) {
  console.error("✗ Failed:", err.message);
  process.exit(1);
}
