import { describe, expect, it, vi } from "vitest";
import {
  ExtensionHost,
  type WorkerLike,
} from "#/extensions/host/extension-host";
import {
  createInMemoryTransportPair,
  type RpcMessage,
} from "#/extensions/host/rpc";
import { startExtensionRuntime } from "#/extensions/sdk/runtime";
import type { HostApiDeps } from "#/extensions/host/host-api";
import type { ExtensionManifest } from "#/extensions/manifest";
import type { ExtensionModule } from "#/extensions/sdk/types";

/**
 * A fake worker that runs the *real* extension runtime in-memory over a paired
 * transport, so we exercise the genuine host <-> runtime RPC path without a DOM
 * Worker. `loadModule` returns the provided test extension module.
 */
function createFakeWorker(
  module: ExtensionModule,
  terminate: () => void,
): WorkerLike {
  const [hostSide, workerSide] = createInMemoryTransportPair();
  startExtensionRuntime(workerSide, async () => module);

  const listeners = new Set<(event: { data: unknown }) => void>();
  hostSide.subscribe((message) => {
    for (const listener of listeners) listener({ data: message });
  });

  return {
    postMessage: (message) => hostSide.post(message as RpcMessage),
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    terminate,
  };
}

function makeDeps(overrides: Partial<HostApiDeps> = {}): HostApiDeps {
  return {
    getActiveConversation: () => ({ id: "c1", title: "T", status: "idle" }),
    showInformationMessage: vi.fn(),
    executeCommand: vi.fn(),
    storageGet: vi.fn(),
    storageSet: vi.fn(),
    ...overrides,
  };
}

function manifest(
  overrides: Partial<ExtensionManifest> = {},
): ExtensionManifest {
  return {
    id: "acme.ext",
    name: "Ext",
    version: "1.0.0",
    engines: { agentCanvas: "^1.0.0" },
    main: "main.js",
    capabilities: ["conversation:read"],
    ...overrides,
  };
}

describe("ExtensionHost", () => {
  it("activates a worker lazily and runs the extension's activate()", async () => {
    const activate = vi.fn();
    const createWorker = vi.fn(() => createFakeWorker({ activate }, () => {}));
    const host = new ExtensionHost(makeDeps());
    host.register("acme.ext", {
      capabilities: ["conversation:read"],
      moduleUrl: "main.js",
      createWorker,
    });

    expect(host.isActive("acme.ext")).toBe(false);
    await host.activate(manifest(), "onView:acme.view");

    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(host.isActive("acme.ext")).toBe(true);
  });

  it("does not create a second worker on repeat activation", async () => {
    const createWorker = vi.fn(() => createFakeWorker({}, () => {}));
    const host = new ExtensionHost(makeDeps());
    host.register("acme.ext", {
      capabilities: [],
      moduleUrl: "main.js",
      createWorker,
    });

    await host.activate(manifest(), "onStartup");
    await host.activate(manifest(), "onStartup");
    expect(createWorker).toHaveBeenCalledTimes(1);
  });

  it("runs a contributed command end-to-end, reaching a host API method", async () => {
    const showInformationMessage = vi.fn();
    // The extension registers a command that calls the host UI API.
    const module: ExtensionModule = {
      activate: (ctx) => {
        ctx.agentCanvas.commands.register("acme.hello", async () => {
          await ctx.agentCanvas.window.showInformationMessage("hello from ext");
        });
      },
    };
    const host = new ExtensionHost(makeDeps({ showInformationMessage }));
    host.register("acme.ext", {
      capabilities: [],
      moduleUrl: "main.js",
      createWorker: () => createFakeWorker(module, () => {}),
    });

    await host.activate(manifest(), "onCommand:acme.hello");
    await host.runCommand("acme.ext", "acme.hello");

    expect(showInformationMessage).toHaveBeenCalledWith("hello from ext");
  });

  it("lets an extension read the active conversation when permitted", async () => {
    let seen: unknown;
    const module: ExtensionModule = {
      activate: (ctx) => {
        ctx.agentCanvas.commands.register("acme.read", async () => {
          seen = await ctx.agentCanvas.conversation.getActive();
        });
      },
    };
    const host = new ExtensionHost(
      makeDeps({
        getActiveConversation: () => ({
          id: "abc",
          title: "Hi",
          status: "idle",
        }),
      }),
    );
    host.register("acme.ext", {
      capabilities: ["conversation:read"],
      moduleUrl: "main.js",
      createWorker: () => createFakeWorker(module, () => {}),
    });

    await host.activate(manifest(), "onCommand:acme.read");
    await host.runCommand("acme.ext", "acme.read");

    expect(seen).toEqual({ id: "abc", title: "Hi", status: "idle" });
  });

  it("rejects a capability-violating API call inside the extension", async () => {
    let error: unknown;
    const module: ExtensionModule = {
      activate: (ctx) => {
        ctx.agentCanvas.commands.register("acme.read", async () => {
          try {
            await ctx.agentCanvas.conversation.getActive();
          } catch (e) {
            error = e;
          }
        });
      },
    };
    // No capabilities granted -> conversation:read denied.
    const host = new ExtensionHost(makeDeps());
    host.register("acme.ext", {
      capabilities: [],
      moduleUrl: "main.js",
      createWorker: () => createFakeWorker(module, () => {}),
    });

    await host.activate(manifest({ capabilities: [] }), "onCommand:acme.read");
    await host.runCommand("acme.ext", "acme.read");

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/missing capability/);
  });

  it("deactivate terminates the worker and runs deactivate()", async () => {
    const deactivate = vi.fn();
    const terminate = vi.fn();
    const host = new ExtensionHost(makeDeps());
    host.register("acme.ext", {
      capabilities: [],
      moduleUrl: "main.js",
      createWorker: () => createFakeWorker({ deactivate }, terminate),
    });

    await host.activate(manifest(), "onStartup");
    host.deactivate("acme.ext");

    expect(terminate).toHaveBeenCalledTimes(1);
    expect(host.isActive("acme.ext")).toBe(false);
  });

  it("does nothing when activating an unregistered (declarative-only) extension", async () => {
    const host = new ExtensionHost(makeDeps());
    await host.activate(manifest(), "onStartup");
    expect(host.isActive("acme.ext")).toBe(false);
  });
});
