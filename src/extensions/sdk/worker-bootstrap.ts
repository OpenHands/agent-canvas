/**
 * Production Web Worker entry point for an extension.
 *
 * The host creates this worker (`new Worker(new URL("./worker-bootstrap.ts",
 * import.meta.url), { type: "module" })`) and then sends an `activate` request with
 * the extension's `moduleUrl`. This bootstrap wires `self` (the worker global) as the
 * RPC transport and starts the shared runtime, which dynamically imports the
 * extension's `main` module and calls its `activate(context)`.
 *
 * The worker has no DOM access; all host interaction goes through the RPC channel.
 */
import { startExtensionRuntime } from "./runtime";
import type { RpcMessage, RpcTransport } from "../host/rpc";

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
};

const transport: RpcTransport = {
  post: (message) => ctx.postMessage(message),
  subscribe: (handler) => {
    const listener = (event: { data: unknown }) =>
      handler(event.data as RpcMessage);
    ctx.addEventListener("message", listener);
    return () => ctx.removeEventListener("message", listener);
  },
};

startExtensionRuntime(transport);
