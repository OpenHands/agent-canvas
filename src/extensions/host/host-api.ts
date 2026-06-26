import type { Capability } from "../manifest";
import type { ConversationSummary } from "../sdk/types";
import type { RpcMethodMap } from "./rpc";

/**
 * Host-side dependencies the extension API is implemented against. Injected so the
 * API is decoupled from concrete Agent-Canvas stores/services and trivially testable.
 */
export interface HostApiDeps {
  /** Resolve the currently active conversation (or null). */
  getActiveConversation(): ConversationSummary | null;
  /** Show an informational message in the host UI. */
  showInformationMessage(message: string): void;
  /** Execute a host command by id (built-in or contributed). */
  executeCommand(command: string, args: unknown[]): Promise<unknown> | unknown;
  /** Per-extension key/value storage. */
  storageGet(extensionId: string, key: string): unknown;
  storageSet(extensionId: string, key: string, value: unknown): void;
}

export class CapabilityError extends Error {
  constructor(capability: Capability) {
    super(`missing capability: ${capability}`);
    this.name = "CapabilityError";
  }
}

function requireCapability(
  granted: ReadonlySet<Capability>,
  capability: Capability,
): void {
  if (!granted.has(capability)) {
    throw new CapabilityError(capability);
  }
}

/**
 * Build the RPC method map the host exposes to a single extension's worker. Every
 * method that touches privileged data is gated by the extension's granted
 * `capabilities`; calls outside the grant reject with a {@link CapabilityError},
 * giving us VS Code-style least-privilege without ambient authority.
 */
export function createHostMethods(
  extensionId: string,
  capabilities: readonly Capability[],
  deps: HostApiDeps,
): RpcMethodMap {
  const granted = new Set<Capability>(capabilities);

  return {
    "window.showInformationMessage": (params) => {
      const { message } = params as { message: string };
      deps.showInformationMessage(message);
    },

    "commands.execute": (params) => {
      const { command, args } = params as { command: string; args?: unknown[] };
      return deps.executeCommand(command, args ?? []);
    },

    "conversation.getActive": () => {
      requireCapability(granted, "conversation:read");
      return deps.getActiveConversation();
    },

    "storage.get": (params) => {
      requireCapability(granted, "storage");
      const { key } = params as { key: string };
      return deps.storageGet(extensionId, key) ?? null;
    },

    "storage.set": (params) => {
      requireCapability(granted, "storage");
      const { key, value } = params as { key: string; value: unknown };
      deps.storageSet(extensionId, key, value);
    },
  };
}
