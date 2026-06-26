import { RpcEndpoint, type RpcTransport } from "../host/rpc";
import { createAgentCanvasApi } from "./api-proxy";
import type { ExtensionContext, ExtensionModule } from "./types";

/**
 * The runtime that executes inside an extension's Web Worker (or, in tests, inside a
 * fake worker). It owns the worker side of the RPC channel: it exposes lifecycle
 * methods the host calls (`activate` / `invokeCommand` / `openView` / `deactivate`)
 * and provides the {@link AgentCanvasApi} proxy that forwards calls back to the host.
 *
 * Factored out of the `Worker` bootstrap so the exact same logic can be driven by an
 * in-memory transport in unit tests — no DOM Worker needed.
 */

export type ModuleLoader = (moduleUrl: string) => Promise<ExtensionModule>;

interface ActivateParams {
  extensionId: string;
  moduleUrl: string;
}

/**
 * Start the extension runtime over `transport`. `loadModule` resolves an extension's
 * `main` module from a URL — defaulting to a dynamic `import()` in production, and
 * overridable in tests.
 */
export function startExtensionRuntime(
  transport: RpcTransport,
  loadModule: ModuleLoader = (url) =>
    import(/* @vite-ignore */ url) as Promise<ExtensionModule>,
): RpcEndpoint {
  const commandHandlers = new Map<string, () => void | Promise<void>>();
  let context: ExtensionContext | undefined;
  let module: ExtensionModule | undefined;

  // `endpoint` is referenced by the method handlers, which only run after it has been
  // assigned, so the forward reference is safe.
  const endpoint: RpcEndpoint = new RpcEndpoint(transport, {
    activate: async (params) => {
      const { extensionId, moduleUrl } = params as ActivateParams;
      const api = createAgentCanvasApi(endpoint, commandHandlers);
      context = { extensionId, agentCanvas: api, subscriptions: [] };
      module = await loadModule(moduleUrl);
      await module.activate?.(context);
    },

    invokeCommand: async (params) => {
      const { command } = params as { command: string };
      const handler = commandHandlers.get(command);
      if (handler) {
        await handler();
      }
    },

    // The worker is notified when one of its views is opened. The PoC has no default
    // behaviour here, but it gives extensions a hook (and webviews a relay target).
    openView: () => undefined,

    deactivate: async () => {
      await module?.deactivate?.();
      for (const disposable of context?.subscriptions ?? []) {
        disposable.dispose();
      }
      commandHandlers.clear();
    },
  });

  return endpoint;
}
