#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Node } from "./node.js";
import { Election } from "./election.js";
import { registerTools } from "./tools.js";
import { VERSION } from "./version.js";
import { log, installConsoleShim } from "./logger.js";

// Route all console.* calls through the structured logger so existing
// sites (which use console.error) get JSON-friendly output for free.
installConsoleShim();

// Detect when the parent process (opencode) goes away. If the stdio pipe
// is closed we exit instead of becoming an orphaned bridge that holds
// port 1994 and breaks subsequent opencode launches.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") {
    process.exit(0);
  }
});
process.stdin.on("close", () => {
  process.exit(0);
});

const PORT = 1994;
const DRAIN_TIMEOUT_MS = Number(process.env.DRAIN_TIMEOUT_MS) || 10_000;

async function main(): Promise<void> {
  const node = new Node(PORT);
  const election = new Election(PORT, node);
  await election.start();

  // Graceful shutdown: stop accepting new requests, drain in-flight
  // ones (up to DRAIN_TIMEOUT_MS), then close bridge + stop election.
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutdown requested", { signal });

    // Ask Leader to stop accepting new RPC + wait for in-flight to finish.
    if (node.roleName === "LEADER") {
      const leader = (node as unknown as { leader: { drain(timeout: number): Promise<void> } }).leader;
      if (leader && typeof leader.drain === "function") {
        await leader.drain(DRAIN_TIMEOUT_MS);
      }
    }

    election.stop();
    node.stop();
    log.info("shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  // SIGHUP is what a closing terminal / parent shell sends; without it the
  // bridge can linger and hold port 1994.
  process.on("SIGHUP", () => void shutdown("SIGHUP"));

  // Create MCP server (stdio transport)
  const server = new McpServer({
    name: "figma-bridge",
    version: VERSION,
  });

  registerTools(server, node, PORT);

  log.info("MCP server starting", { role: node.roleName, port: PORT });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  log.error("Fatal error", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
