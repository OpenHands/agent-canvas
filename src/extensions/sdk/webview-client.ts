import { RpcEndpoint, type RpcMessage, type RpcTransport } from "../host/rpc";
import { createAgentCanvasApi } from "./api-proxy";
import type { AgentCanvasApi } from "./types";

/**
 * Client used by webview documents (customer HTML/JS running inside the sandboxed
 * iframe) to obtain the `agentCanvas` API. It speaks the same RPC protocol to its
 * parent (the host) that the worker runtime does, so webviews get the identical,
 * capability-gated API surface.
 *
 * Usage inside a webview:
 * ```ts
 * import { acquireAgentCanvasApi } from "@agent-canvas/extension-api/webview";
 * const api = acquireAgentCanvasApi();
 * await api.window.showInformationMessage("hello from a webview");
 * ```
 */
export function acquireAgentCanvasApi(): AgentCanvasApi {
  const parentWindow = window.parent;

  const transport: RpcTransport = {
    post: (message) => parentWindow.postMessage(message, "*"),
    subscribe: (handler) => {
      const listener = (event: MessageEvent) => {
        // Only accept messages from the host (the parent window).
        if (event.source !== parentWindow) return;
        handler(event.data as RpcMessage);
      };
      window.addEventListener("message", listener);
      return () => window.removeEventListener("message", listener);
    },
  };

  const endpoint = new RpcEndpoint(transport);
  // Webviews don't receive host-driven command invocations in the initial version,
  // so the local handler map is unused by the host but keeps the API uniform.
  return createAgentCanvasApi(endpoint, new Map());
}
