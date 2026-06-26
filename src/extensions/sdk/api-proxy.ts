import type { RpcEndpoint } from "../host/rpc";
import type { AgentCanvasApi } from "./types";

/**
 * Build the `agentCanvas` API object that forwards calls to the host over an
 * {@link RpcEndpoint}. Shared by the worker runtime and the webview client so both
 * surfaces expose an identical, capability-gated API.
 *
 * `commandHandlers` is the local registry that `commands.register` writes to; the host
 * invokes these via the `invokeCommand` RPC method (worker) — webview command
 * invocation is not wired in the initial version.
 */
export function createAgentCanvasApi(
  endpoint: RpcEndpoint,
  commandHandlers: Map<string, () => void | Promise<void>>,
): AgentCanvasApi {
  return {
    commands: {
      register: (command, handler) => {
        commandHandlers.set(command, handler);
        return { dispose: () => commandHandlers.delete(command) };
      },
      execute: (command, ...args) =>
        endpoint.request("commands.execute", { command, args }),
    },
    window: {
      showInformationMessage: (message) =>
        endpoint.request<void>("window.showInformationMessage", { message }),
    },
    conversation: {
      getActive: () => endpoint.request("conversation.getActive"),
    },
    storage: {
      get: (key) => endpoint.request("storage.get", { key }),
      set: (key, value) =>
        endpoint.request<void>("storage.set", { key, value }),
    },
  };
}
