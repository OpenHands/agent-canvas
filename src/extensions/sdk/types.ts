/**
 * Public SDK types shared between the host and the in-worker extension runtime.
 *
 * This is the Agent-Canvas analog of the `vscode` module's type surface. Extensions
 * are handed an {@link ExtensionContext} (containing the {@link AgentCanvasApi}) at
 * activation and interact with the app exclusively through it — never via the DOM.
 */

/** Minimal, serialisable view of a conversation exposed to extensions. */
export interface ConversationSummary {
  id: string;
  title: string | null;
  status: string | null;
}

/** Returned by registrations/subscriptions so callers can clean up. */
export interface Disposable {
  dispose(): void;
}

export interface AgentCanvasApi {
  commands: {
    /** Register a handler for a command declared in the manifest. */
    register(command: string, handler: () => void | Promise<void>): Disposable;
    /** Execute any command (built-in or contributed) by id. */
    execute(command: string, ...args: unknown[]): Promise<unknown>;
  };
  window: {
    /** Show a transient informational message in the host UI. */
    showInformationMessage(message: string): Promise<void>;
  };
  conversation: {
    /** The currently active conversation, or null. Requires `conversation:read`. */
    getActive(): Promise<ConversationSummary | null>;
  };
  storage: {
    /** Per-extension namespaced storage. Requires the `storage` capability. */
    get<T = unknown>(key: string): Promise<T | null>;
    set<T = unknown>(key: string, value: T): Promise<void>;
  };
}

/** Handed to an extension's `activate(context)` entry point. */
export interface ExtensionContext {
  /** The extension's own id. */
  extensionId: string;
  /** The API surface. */
  agentCanvas: AgentCanvasApi;
  /** Push disposables here; all are disposed on deactivation. */
  subscriptions: Disposable[];
}

/** The module shape an extension's `main` entry is expected to export. */
export interface ExtensionModule {
  activate?(context: ExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
