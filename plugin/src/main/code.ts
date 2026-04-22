import type { ServerRequest, PluginResponse } from "./types";
import { sendStatus } from "./utils";
import { dispatch } from "./router";
import { createError, PluginErrorCode } from "./errors";

const handleRequest = async (
  request: ServerRequest
): Promise<PluginResponse> => {
  try {
    return await dispatch(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      type: request.type,
      requestId: request.requestId,
      error: createError(PluginErrorCode.OPERATION_FAILED, message),
    };
  }
};

figma.showUI(__html__, { width: 260, height: 200 });
sendStatus();

figma.on("selectionchange", () => {
  sendStatus();
});

figma.ui.onmessage = async (message) => {
  if (message.type === "ui-ready") {
    sendStatus();
    return;
  }

  if (message.type === "server-request") {
    const response = await handleRequest(message.payload as ServerRequest);
    try {
      figma.ui.postMessage(response);
    } catch (err) {
      figma.ui.postMessage({
        type: response.type,
        requestId: response.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
