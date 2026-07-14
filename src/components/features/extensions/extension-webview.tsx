import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import { getAssetLoader } from "#/extensions/asset-loader";
import {
  createHostMethods,
  type HostApiDeps,
} from "#/extensions/host/host-api";
import { RpcEndpoint } from "#/extensions/host/rpc";
import { createWebviewTransport } from "#/extensions/host/webview-transport";
import type { Capability } from "#/extensions/manifest";
import { WebviewBridge } from "#/extensions/webview-bridge";
import {
  WEBVIEW_OPAQUE_ORIGIN,
  WEBVIEW_SANDBOX,
} from "#/extensions/webview-security";

/**
 * CSS custom properties that extensions can use for theming.
 * These are extracted from the host document and sent to the iframe.
 */
const THEME_VARIABLES = [
  // Cool Grey scale
  "--cool-grey-50",
  "--cool-grey-100",
  "--cool-grey-200",
  "--cool-grey-300",
  "--cool-grey-400",
  "--cool-grey-500",
  "--cool-grey-600",
  "--cool-grey-700",
  "--cool-grey-800",
  "--cool-grey-900",
  "--cool-grey-925",
  "--cool-grey-950",
  "--cool-grey-975",
  // Semantic colors
  "--oh-background",
  "--oh-foreground",
  "--oh-surface",
  "--oh-surface-raised",
  "--oh-surface-deep",
  "--oh-border",
  "--oh-border-input",
  "--oh-border-subtle",
  "--oh-text-secondary",
  "--oh-text-tertiary",
  "--oh-text-dim",
  "--oh-text-subtle",
  "--oh-muted",
  "--oh-color-primary",
  "--oh-color-danger",
  "--oh-color-success",
  "--oh-radius",
  "--oh-field-radius",
] as const;

/** Message type for theme variable injection. */
const THEME_MESSAGE_TYPE = "agentCanvas:theme";

/** Message type for conversation data updates. */
const CONVERSATION_MESSAGE_TYPE = "agentCanvas:conversation";

/**
 * Extracts current theme CSS variables from the host document.
 * Note: CSS variables are scoped to [data-agent-server-ui] (on body), not :root,
 * so we read from document.body instead of document.documentElement.
 */
function getThemeVariables(): Record<string, string> {
  const computed = getComputedStyle(document.body);
  const vars: Record<string, string> = {};
  for (const name of THEME_VARIABLES) {
    const value = computed.getPropertyValue(name).trim();
    if (value) {
      vars[name] = value;
    }
  }
  return vars;
}

/** Conversation data pushed to webviews. Matches the ConversationSummary SDK type. */
interface ConversationUpdate {
  id: string;
  title: string | null;
  status: string | null;
  model: string | null;
  agentKind: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  selectedRepository: string | null;
  workingDir: string | null;
  backend: "cloud" | "local" | null;
  sandboxId: string | null;
  sandboxStatus: string | null;
}

/** Raw conversation object from the query (AppConversation). */
interface RawConversation {
  id: string;
  title?: string | null;
  execution_status?: string | null;
  llm_model?: string | null;
  agent_kind?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  selected_repository?: string | null;
  workspace?: { working_dir?: string | null } | null;
  sandbox_id?: string | null;
  sandbox_status?: string | null;
}

/** Transform raw conversation to the update format. */
function toConversationUpdate(
  conversation: RawConversation | null | undefined,
): ConversationUpdate | null {
  if (!conversation) return null;
  // The `id`-only fallback (from the route before the list/websocket data lands)
  // has no sandbox/backend info; resolve the backend kind from the active store so
  // even the minimal push tells the webview whether cloud affordances apply.
  const backendKind = getActiveBackend().backend.kind;
  return {
    id: conversation.id,
    title: conversation.title ?? null,
    status: conversation.execution_status ?? null,
    model: conversation.llm_model ?? null,
    agentKind: conversation.agent_kind ?? null,
    createdAt: conversation.created_at ?? null,
    updatedAt: conversation.updated_at ?? null,
    selectedRepository: conversation.selected_repository ?? null,
    workingDir: conversation.workspace?.working_dir ?? null,
    backend: backendKind === "cloud" ? "cloud" : "local",
    sandboxId: conversation.sandbox_id ?? null,
    sandboxStatus: conversation.sandbox_status ?? null,
  };
}

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
  /**
   * Extension source ref (e.g., "github:owner/repo@sha") for asset relay.
   * When provided, enables the webview to request additional assets via postMessage.
   */
  extensionSource?: string;
  /**
   * Allowed external origins for fetch relay (from extension manifest permissions).
   * Extensions must declare origins they need to access.
   */
  allowedOrigins?: string[];
  /**
   * When true, automatically resize the iframe height to fit its content.
   * Useful for settings pages that should extend naturally like native settings.
   * @default false
   */
  autoResize?: boolean;
  /**
   * Minimum height for the iframe when autoResize is enabled.
   * @default 200
   */
  minHeight?: number;
  /**
   * Current conversation data to push to the webview.
   * When this changes, the host sends an update to the iframe so extensions
   * can display conversation context that updates as the user navigates.
   */
  conversation?: RawConversation | null;
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
 * `sdk/webview-client.ts`) to talk to the host, and optionally `requestAsset()` /
 * `relayFetch()` (see `sdk/asset-relay.ts`) to load additional resources.
 */
/** Message type for iframe content height updates. */
const RESIZE_MESSAGE_TYPE = "agentCanvas:resize";

export function ExtensionWebview({
  extensionId,
  capabilities,
  deps,
  src,
  title,
  extensionSource,
  allowedOrigins,
  autoResize = false,
  minHeight = 200,
  conversation,
}: ExtensionWebviewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const endpointRef = useRef<RpcEndpoint | null>(null);
  const bridgeRef = useRef<WebviewBridge | null>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  // Track whether the webview is connected (ready signal sent)
  const isConnectedRef = useRef(false);

  // Latest host inputs, read at (re)connect time so reconnecting on load never forces
  // the iframe to reload. These are stable in practice (memoized deps, registry-owned
  // capabilities), so the iframe only reloads when `src`/`extensionId` change.
  const capabilitiesRef = useRef(capabilities);
  const depsRef = useRef(deps);
  const extensionSourceRef = useRef(extensionSource);
  const allowedOriginsRef = useRef(allowedOrigins);
  const conversationRef = useRef(conversation);
  capabilitiesRef.current = capabilities;
  depsRef.current = deps;
  extensionSourceRef.current = extensionSource;
  allowedOriginsRef.current = allowedOrigins;
  conversationRef.current = conversation;

  // Push conversation updates to the iframe whenever the conversation changes.
  // This allows extensions to display conversation context that updates as the
  // user navigates between conversations or as the conversation state changes.
  useEffect(() => {
    const iframe = frameRef.current;
    const contentWindow = iframe?.contentWindow;
    if (!contentWindow || !isConnectedRef.current) return;

    const update = toConversationUpdate(conversation);
    contentWindow.postMessage(
      { type: CONVERSATION_MESSAGE_TYPE, conversation: update },
      "*",
    );
  }, [conversation]);

  // Listen for resize messages from the iframe content
  useEffect(() => {
    if (!autoResize) return;

    const handleMessage = (event: MessageEvent) => {
      // Verify the message is from our iframe
      if (event.source !== frameRef.current?.contentWindow) return;

      // Handle resize messages
      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === RESIZE_MESSAGE_TYPE &&
        typeof event.data.height === "number"
      ) {
        setContentHeight(Math.max(event.data.height, minHeight));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [autoResize, minHeight]);

  // Establish the RPC endpoint and asset relay bridge against the *loaded* document's
  // window. A sandboxed iframe (no allow-same-origin) gets a fresh window once it
  // navigates to `src`, so binding on `load` — not on mount — is required for
  // `event.source` to match.
  const connect = useCallback(() => {
    const iframe = frameRef.current;
    const contentWindow = iframe?.contentWindow;
    if (!contentWindow || !iframe) return;

    // Dispose previous connections
    endpointRef.current?.dispose();
    bridgeRef.current?.dispose();
    isConnectedRef.current = false;

    // Send theme variables to the iframe so extensions can use them
    // This enables extensions to use var(--oh-background) etc. for theming
    contentWindow.postMessage(
      { type: THEME_MESSAGE_TYPE, variables: getThemeVariables() },
      "*",
    );

    // Set up RPC endpoint for agentCanvas API
    const transport = createWebviewTransport(contentWindow, {
      source: contentWindow,
      expectedOrigin: WEBVIEW_OPAQUE_ORIGIN,
    });
    endpointRef.current = new RpcEndpoint(
      transport,
      createHostMethods(extensionId, capabilitiesRef.current, depsRef.current),
    );

    // Mark as connected and send a "ready" signal to the webview
    isConnectedRef.current = true;
    contentWindow.postMessage({ type: "agentCanvas:ready" }, "*");

    // Send the current conversation data immediately so the webview doesn't
    // have to wait or poll. Extensions can render available data right away.
    const currentConversation = toConversationUpdate(conversationRef.current);
    contentWindow.postMessage(
      { type: CONVERSATION_MESSAGE_TYPE, conversation: currentConversation },
      "*",
    );

    // Set up asset relay bridge if extension source is provided
    const source = extensionSourceRef.current;
    if (source) {
      bridgeRef.current = new WebviewBridge({
        iframe,
        extensionSource: source,
        assetLoader: getAssetLoader(),
        allowedOrigins: allowedOriginsRef.current,
      });
    }
  }, [extensionId]);

  useEffect(
    () => () => {
      endpointRef.current?.dispose();
      endpointRef.current = null;
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
    },
    [],
  );

  // Compute iframe style based on autoResize mode
  // Set colorScheme to dark so browsers use dark-mode defaults for the iframe content.
  // Set background to the theme color to reduce white flash during loading.
  // Note: Extensions should still set explicit background in their CSS, but this helps
  // with the initial load experience and provides a fallback.
  const iframeStyle: React.CSSProperties = {
    background: "var(--oh-background, #0B0E14)",
    colorScheme: "dark",
    ...(autoResize && {
      height: contentHeight ?? minHeight,
      minHeight,
    }),
  };

  return (
    <iframe
      ref={frameRef}
      data-testid={`extension-webview-${extensionId}`}
      title={title}
      src={src}
      onLoad={connect}
      sandbox={WEBVIEW_SANDBOX}
      referrerPolicy="no-referrer"
      className={autoResize ? "w-full border-0" : "h-full w-full border-0"}
      style={iframeStyle}
    />
  );
}
