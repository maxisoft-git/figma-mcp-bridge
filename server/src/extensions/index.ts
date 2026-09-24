import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Node } from "../node.js";
import * as variables from "./variables.js";
import * as typography from "./typography.js";
import * as components from "./components.js";
import * as sections from "./sections.js";

export type {
  ExtensionRegister,
  ExtensionRpcMap,
  ExtensionSchemaMap,
  RpcArgMapper,
} from "./types.js";

/**
 * Every extension tool schema, merged from the area files. Spread into
 * `toolInputSchemas` in `schema.ts`.
 *
 * Declared without a type annotation so the key literals survive: `ToolName` is
 * `keyof typeof toolInputSchemas`, and widening it to `string` would stop the
 * compiler reporting a tool that has no RPC mapper.
 */
export const extensionSchemas = {
  ...variables.schemas,
  ...typography.schemas,
  ...components.schemas,
  ...sections.schemas,
};

/** Every extension RPC mapper, merged from the area files. */
export const extensionRpcToArgs = {
  ...variables.rpcToArgs,
  ...typography.rpcToArgs,
  ...components.rpcToArgs,
  ...sections.rpcToArgs,
};

/**
 * Registers every extension tool. Called at the end of `registerTools`.
 * @param server - The MCP server instance.
 * @param node - The node coordinator for leader/follower routing.
 */
/**
 * Tool names this fork already ships with its own (older) implementation. The
 * extension areas must not replace them, or a client that validated against the
 * core schema would reach a different plugin handler.
 */
const CORE_TOOL_NAMES = new Set<string>([
  "create_variable_collection",
  "create_text_style",
  "list_components",
  "create_component",
  "create_instance",
  "set_instance_properties",
]);

/**
 * Registers every extension tool. Called at the end of `registerTools`.
 * @param server - The MCP server instance.
 * @param node - The node coordinator for leader/follower routing.
 */
export function registerExtensionTools(server: McpServer, node: Node): void {
  // Wrap `tool` so an area cannot register a name the core tools already own.
  const guard = {
    tool(name: string, ...rest: unknown[]) {
      if (CORE_TOOL_NAMES.has(name)) return undefined;
      return (server.tool as unknown as (...args: unknown[]) => unknown)(name, ...rest);
    },
  } as unknown as McpServer;

  variables.register(guard, node);
  typography.register(guard, node);
  components.register(guard, node);
  sections.register(guard, node);
}
