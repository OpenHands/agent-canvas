import { useEffect, useRef } from "react";
import {
  createHostMethods,
  type HostApiDeps,
} from "#/extensions/host/host-api";
import { RpcEndpoint } from "#/extensions/host/rpc";
import { createWebviewTransport } from "#/extensions/host/webview-transport";
import type { Capability } from "#/extensions/manifest";

interface ExtensionWebviewProps {
  /** Owning extension id (namespaces storage / capability checks). */
  extensionId: string;
  /** Capabilities granted to the extension (gates the host API). */
  capabilities: Capability[];
  /** Host API dependencies (conversation, storage, messages, ...). */
  deps: HostApiDeps;
  /** Resolved URL of the webview document (typically a `blob:`/isolated-origin URL). */
  src: string;
  /** Accessible title for the iframe. */
  title: string;
}

/**
 * Renders an extension's webview UI inside a **sandboxed** `<iframe>` and connects it
 * to the host's capability-gated `agentCanvas` API over `postMessage` (reusing the
 * exact same {@link createHostMethods} surface the worker uses).
 *
 * Security:
 * - `sandbox="allow-scripts"` (deliberately *no* `allow-same-origin`) makes the frame
 *   origin "null", so it cannot read host cookies, storage, or the parent DOM.
 * - The host only accepts RPC messages whose `event.source` is this iframe's window.
 * - Capability checks are enforced host-side per call.
 *
 * The webview document is expected to use `acquireAgentCanvasApi()` (see
 * `sdk/webview-client.ts`) to talk to the host.
 */
export function ExtensionWebview({
  extensionId,
  capabilities,
  deps,
  src,
  title,
}: ExtensionWebviewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const endpointRef = useRef<RpcEndpoint | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const contentWindow = frame?.contentWindow;
    if (!frame || !contentWindow) return undefined;

    const transport = createWebviewTransport(contentWindow, {
      source: contentWindow,
    });
    const endpoint = new RpcEndpoint(
      transport,
      createHostMethods(extensionId, capabilities, deps),
    );
    endpointRef.current = endpoint;

    return () => {
      endpoint.dispose();
      endpointRef.current = null;
    };
  }, [extensionId, capabilities, deps, src]);

  return (
    <iframe
      ref={frameRef}
      data-testid={`extension-webview-${extensionId}`}
      title={title}
      src={src}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="h-full w-full border-0"
    />
  );
}
