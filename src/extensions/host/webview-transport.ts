import type { RpcMessage, RpcTransport } from "./rpc";

/**
 * Bridges a sandboxed webview `<iframe>` to the host over `postMessage`, exposed as an
 * {@link RpcTransport}. Combined with `createHostMethods`, this lets webview UI call
 * the same capability-gated `agentCanvas` API the worker uses — no special-casing.
 *
 * Security: only messages whose `event.source` is the expected iframe window are
 * accepted, so unrelated frames/windows can't inject RPC traffic. Because the iframe
 * is sandboxed without `allow-same-origin` (origin "null"), outbound messages use a
 * `"*"` target origin; this is safe as the channel carries no secrets and every
 * inbound message is validated by the RPC layer.
 */

/** Minimal view of an iframe content window we post to. */
export interface FrameWindowLike {
  postMessage(message: unknown, targetOrigin: string): void;
}

/** Minimal view of the event target we listen on (defaults to `window`). */
export interface MessageEventTarget {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
}

export interface WebviewTransportOptions {
  /** The iframe's `contentWindow`; inbound messages must originate from it. */
  source: unknown;
  /** Where to listen for `message` events. Defaults to the global `window`. */
  eventTarget?: MessageEventTarget;
}

export function createWebviewTransport(
  frame: FrameWindowLike,
  options: WebviewTransportOptions,
): RpcTransport {
  const target: MessageEventTarget =
    options.eventTarget ?? (window as unknown as MessageEventTarget);

  return {
    post: (message) => frame.postMessage(message, "*"),
    subscribe: (handler) => {
      const listener = (event: MessageEvent) => {
        if (event.source !== options.source) return;
        handler(event.data as RpcMessage);
      };
      target.addEventListener("message", listener);
      return () => target.removeEventListener("message", listener);
    },
  };
}
