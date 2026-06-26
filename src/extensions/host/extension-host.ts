import type { ExtensionManifest, Capability } from "../manifest";
import type { ActivationEvent } from "../types";
import type { ExtensionHostBridge } from "../loader";
import { createHostMethods, type HostApiDeps } from "./host-api";
import { RpcEndpoint, type RpcMessage, type RpcTransport } from "./rpc";

/**
 * Minimal structural subset of the DOM `Worker` the host depends on. Real `Worker`s
 * satisfy it; tests provide a fake that runs the worker runtime in-memory.
 */
export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  terminate(): void;
}

/** How the host spins up (and identifies) an extension's worker. */
export interface ExtensionWorkerRegistration {
  capabilities: Capability[];
  /** URL of the extension's `main` module, passed to the runtime to import. */
  moduleUrl: string;
  /** Create the backing worker (a bootstrap `Worker` in prod, a fake in tests). */
  createWorker: () => WorkerLike;
}

/** Adapt a `WorkerLike` to the RPC transport interface. */
function workerTransport(worker: WorkerLike): RpcTransport {
  return {
    post: (message) => worker.postMessage(message),
    subscribe: (handler) => {
      const listener = (event: { data: unknown }) =>
        handler(event.data as RpcMessage);
      worker.addEventListener("message", listener);
      return () => worker.removeEventListener("message", listener);
    },
  };
}

/**
 * Manages the lifecycle of extension workers and implements the
 * {@link ExtensionHostBridge} the loader wires contributions to.
 *
 * Extensions are activated **lazily**: a worker is created only when a contribution
 * (rail item / command) is first selected. Disabling an extension terminates its
 * worker, mirroring VS Code's isolated extension-host model — extension logic never
 * runs on the host thread or touches the DOM.
 */
export class ExtensionHost implements ExtensionHostBridge {
  private readonly registrations = new Map<
    string,
    ExtensionWorkerRegistration
  >();
  private readonly active = new Map<
    string,
    { worker: WorkerLike; endpoint: RpcEndpoint }
  >();

  constructor(private readonly deps: HostApiDeps) {}

  /** Register how to activate an extension's worker. Called by the loader/manager. */
  register(
    extensionId: string,
    registration: ExtensionWorkerRegistration,
  ): void {
    this.registrations.set(extensionId, registration);
  }

  /** Forget an extension entirely, terminating its worker if active. */
  unregister(extensionId: string): void {
    this.deactivate(extensionId);
    this.registrations.delete(extensionId);
  }

  isActive(extensionId: string): boolean {
    return this.active.has(extensionId);
  }

  async activate(
    manifest: ExtensionManifest,
    reason: ActivationEvent,
  ): Promise<void> {
    if (this.active.has(manifest.id)) {
      return;
    }
    const registration = this.registrations.get(manifest.id);
    // Declarative-only / webview-only extensions have no worker to activate.
    if (!registration) {
      return;
    }

    const worker = registration.createWorker();
    const endpoint = new RpcEndpoint(
      workerTransport(worker),
      createHostMethods(manifest.id, registration.capabilities, this.deps),
    );
    this.active.set(manifest.id, { worker, endpoint });

    await endpoint.request("activate", {
      extensionId: manifest.id,
      moduleUrl: registration.moduleUrl,
      reason,
    });
  }

  async runCommand(extensionId: string, command: string): Promise<void> {
    const entry = this.active.get(extensionId);
    if (!entry) return;
    await entry.endpoint.request("invokeCommand", { command });
  }

  openView(extensionId: string, viewId: string): void {
    const entry = this.active.get(extensionId);
    if (!entry) return;
    // Fire-and-forget notification; the webview host (M4) does the actual mounting.
    // Swallow rejections (e.g. the endpoint being disposed during deactivation).
    entry.endpoint.request("openView", { viewId }).catch(() => {});
  }

  deactivate(extensionId: string): void {
    const entry = this.active.get(extensionId);
    if (!entry) return;
    entry.endpoint.dispose();
    entry.worker.terminate();
    this.active.delete(extensionId);
  }

  /** Terminate every active worker (app teardown / tests). */
  disposeAll(): void {
    for (const id of [...this.active.keys()]) {
      this.deactivate(id);
    }
  }
}
