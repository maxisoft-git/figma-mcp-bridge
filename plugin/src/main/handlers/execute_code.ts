import type { ServerRequest, PluginResponse } from "../types";
import { runScript } from "../script-runner";

/**
 * Runs agent-authored JavaScript against the Figma Plugin API. The script gets
 * top-level `await` and `return`; its value comes back JSON-safe (Figma nodes
 * are reduced to id/name/type, symbols to "mixed", cycles to "[circular]").
 */
export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const code = request.params?.code;
  const outcome = await runScript(typeof code === "string" ? code : "");
  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
  return {
    type: request.type,
    requestId: request.requestId,
    data: outcome,
  };
}
