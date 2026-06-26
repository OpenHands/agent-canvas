import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionManager } from "#/extensions/extension-manager";
import { contributionRegistry } from "#/extensions/contribution-registry";
import {
  createInMemoryTransportPair,
  type RpcMessage,
} from "#/extensions/host/rpc";
import { startExtensionRuntime } from "#/extensions/sdk/runtime";
import type { WorkerLike } from "#/extensions/host/extension-host";
import type { HostApiDeps } from "#/extensions/host/host-api";
import type { BundleSource } from "#/extensions/loader";
import type { ExtensionModule } from "#/extensions/sdk/types";

function createFakeWorker(module: ExtensionModule): WorkerLike {
  const [hostSide, workerSide] = createInMemoryTransportPair();
  startExtensionRuntime(workerSide, async () => module);
  const listeners = new Set<(event: { data: unknown }) => void>();
  hostSide.subscribe((message) => {
    for (const listener of listeners) listener({ data: message });
  });
  return {
    postMessage: (message) => hostSide.post(message as RpcMessage),
    addEventListener: (_t, listener) => listeners.add(listener),
    removeEventListener: (_t, listener) => listeners.delete(listener),
    terminate: () => {},
  };
}

const manifest = {
  id: "acme.compliance",
  name: "Compliance",
  version: "1.0.0",
  engines: { agentCanvas: "^1.0.0" },
  main: "main.js",
  capabilities: ["conversation:read"],
  contributes: {
    viewsContainers: {
      activitybar: [{ id: "compliance.container", title: "Compliance" }],
    },
    views: {
      "compliance.container": [
        { id: "compliance.panel", name: "Panel", type: "webview" },
      ],
    },
    commands: [{ command: "compliance.scan", title: "Scan" }],
  },
};

function makeSource(): BundleSource {
  return {
    readManifest: async () => manifest,
    assetUrl: async (path: string) => `blob:${path}`,
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

describe("ExtensionManager", () => {
  afterEach(() => {
    contributionRegistry.clear();
  });

  it("installs a bundle: registers contributions and activates on selection", async () => {
    const showInformationMessage = vi.fn();
    const module: ExtensionModule = {
      activate: (ctx) => {
        void ctx.agentCanvas.window.showInformationMessage("activated!");
      },
    };
    const manager = new ExtensionManager(
      makeDeps({ showInformationMessage }),
      () => createFakeWorker(module),
    );

    const result = await manager.install(makeSource());
    expect(result.ok).toBe(true);

    // Declarative contribution is present immediately (no code ran yet).
    const items = contributionRegistry.getActivityBarItems();
    expect(items).toHaveLength(1);
    expect(manager.host.isActive("acme.compliance")).toBe(false);

    // Selecting the rail item activates the worker, which runs activate().
    items[0].onSelect();
    await vi.waitFor(() =>
      expect(manager.host.isActive("acme.compliance")).toBe(true),
    );
    await vi.waitFor(() =>
      expect(showInformationMessage).toHaveBeenCalledWith("activated!"),
    );
  });

  it("uninstall removes contributions and deactivates the worker", async () => {
    const manager = new ExtensionManager(makeDeps(), () =>
      createFakeWorker({}),
    );
    await manager.install(makeSource());
    contributionRegistry.getActivityBarItems()[0].onSelect();
    await vi.waitFor(() =>
      expect(manager.host.isActive("acme.compliance")).toBe(true),
    );

    manager.uninstall("acme.compliance");

    expect(contributionRegistry.getActivityBarItems()).toHaveLength(0);
    expect(manager.host.isActive("acme.compliance")).toBe(false);
  });

  it("does not register a worker for a declarative-only bundle", async () => {
    const manager = new ExtensionManager(makeDeps(), () =>
      createFakeWorker({}),
    );
    const declarativeOnly: BundleSource = {
      readManifest: async () => ({
        id: "acme.static",
        name: "Static",
        version: "1.0.0",
        engines: { agentCanvas: "^1.0.0" },
        contributes: {
          viewsContainers: {
            activitybar: [{ id: "static.container", title: "Static" }],
          },
        },
      }),
      assetUrl: async () => undefined,
    };

    await manager.install(declarativeOnly);
    contributionRegistry.getActivityBarItems()[0].onSelect();
    // No worker registered -> activation is a no-op.
    expect(manager.host.isActive("acme.static")).toBe(false);
  });
});
