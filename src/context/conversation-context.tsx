import React from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import {
  createAgentStore,
  useAgentStore as useGlobalAgentStore,
  type AgentStore,
  type AgentStoreApi,
} from "#/stores/agent-store";
import {
  createBrowserStore,
  useBrowserStore as useGlobalBrowserStore,
  type BrowserStore,
  type BrowserStoreApi,
} from "#/stores/browser-store";
import {
  createCommandStore,
  useCommandStore as useGlobalCommandStore,
  type CommandState,
  type CommandStoreApi,
} from "#/stores/command-store";
import {
  createConversationStore,
  useConversationStore as useGlobalConversationStore,
  type ConversationStore,
  type ConversationStoreApi,
} from "#/stores/conversation-store";
import {
  createErrorMessageStore,
  useErrorMessageStore as useGlobalErrorMessageStore,
  type ErrorMessageStore,
  type ErrorMessageStoreApi,
} from "#/stores/error-message-store";
import {
  createEventMessageStore,
  useEventMessageStore as useGlobalEventMessageStore,
  type EventMessageStore,
  type EventMessageStoreApi,
} from "#/stores/event-message-store";
import {
  createEventStore,
  useEventStore as useGlobalEventStore,
  type EventState,
  type EventStoreApi,
} from "#/stores/use-event-store";
import useGlobalMetricsStore, {
  createMetricsStore,
  type MetricsStore,
  type MetricsStoreApi,
} from "#/stores/metrics-store";
import {
  createOptimisticUserMessageStore,
  useOptimisticUserMessageStore as useGlobalOptimisticUserMessageStore,
  type OptimisticUserMessageStore,
  type OptimisticUserMessageStoreApi,
} from "#/stores/optimistic-user-message-store";
import {
  createSecurityAnalyzerStore,
  useSecurityAnalyzerStore as useGlobalSecurityAnalyzerStore,
  type SecurityAnalyzerStore,
  type SecurityAnalyzerStoreApi,
} from "#/stores/security-analyzer-store";
import {
  createStatusStore,
  useStatusStore as useGlobalStatusStore,
  type StatusState,
  type StatusStoreApi,
} from "#/stores/status-store";
import {
  createV1ConversationStateStore,
  useV1ConversationStateStore as useGlobalV1ConversationStateStore,
  type V1ConversationStateStore,
  type V1ConversationStateStoreApi,
} from "#/stores/v1-conversation-state-store";

export { ActionSecurityRisk } from "#/stores/security-analyzer-store";
export type { Command } from "#/stores/command-store";
export type { OHEvent } from "#/stores/use-event-store";
export type {
  ConversationMode,
  ConversationTab,
  IMessageToSend,
} from "#/stores/conversation-store";

export interface ConversationScopedStores {
  conversation: ConversationStoreApi;
  status: StatusStoreApi;
  eventMessage: EventMessageStoreApi;
  agent: AgentStoreApi;
  browser: BrowserStoreApi;
  command: CommandStoreApi;
  metrics: MetricsStoreApi;
  securityAnalyzer: SecurityAnalyzerStoreApi;
  event: EventStoreApi;
  errorMessage: ErrorMessageStoreApi;
  optimisticUserMessage: OptimisticUserMessageStoreApi;
  v1ConversationState: V1ConversationStateStoreApi;
}

export interface ConversationContextValue {
  conversationId: string | null;
  serverConfig?: unknown;
  stores: ConversationScopedStores;
}

export interface ConversationProviderProps {
  children: React.ReactNode;
  conversationId?: string | null;
  serverConfig?: unknown;
}

const ConversationContext = React.createContext<ConversationContextValue | null>(
  null,
);

const globalConversationScopedStores: ConversationScopedStores = {
  conversation: useGlobalConversationStore,
  status: useGlobalStatusStore,
  eventMessage: useGlobalEventMessageStore,
  agent: useGlobalAgentStore,
  browser: useGlobalBrowserStore,
  command: useGlobalCommandStore,
  metrics: useGlobalMetricsStore,
  securityAnalyzer: useGlobalSecurityAnalyzerStore,
  event: useGlobalEventStore,
  errorMessage: useGlobalErrorMessageStore,
  optimisticUserMessage: useGlobalOptimisticUserMessageStore,
  v1ConversationState: useGlobalV1ConversationStateStore,
};

const useConversationScopedStores = () =>
  React.useContext(ConversationContext)?.stores ?? globalConversationScopedStores;

const createConversationScopedStores = (
  conversationId?: string | null,
): ConversationScopedStores => {
  const globalOptimisticMessage =
    useGlobalOptimisticUserMessageStore.getState().getOptimisticUserMessage();

  return {
    conversation: createConversationStore(conversationId),
    status: createStatusStore(),
    eventMessage: createEventMessageStore(),
    agent: createAgentStore(),
    browser: createBrowserStore(),
    command: createCommandStore(),
    metrics: createMetricsStore(),
    securityAnalyzer: createSecurityAnalyzerStore(),
    event: createEventStore(),
    errorMessage: createErrorMessageStore(),
    optimisticUserMessage:
      createOptimisticUserMessageStore(globalOptimisticMessage),
    v1ConversationState: createV1ConversationStateStore(),
  };
};

export function ConversationProvider({
  children,
  conversationId = null,
  serverConfig,
}: ConversationProviderProps) {
  const storesRef = React.useRef<ConversationScopedStores | null>(null);
  const previousConversationIdRef = React.useRef<string | null>(conversationId);

  if (
    !storesRef.current ||
    previousConversationIdRef.current !== conversationId
  ) {
    storesRef.current = createConversationScopedStores(conversationId);
    previousConversationIdRef.current = conversationId;
  }

  const value = React.useMemo<ConversationContextValue>(
    () => ({
      conversationId,
      serverConfig,
      stores: storesRef.current as ConversationScopedStores,
    }),
    [conversationId, serverConfig],
  );

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversationContext(): ConversationContextValue {
  const context = React.useContext(ConversationContext);
  if (!context) {
    throw new Error(
      "Conversation-scoped state is unavailable. Wrap this UI in <ConversationProvider>.",
    );
  }
  return context;
}

function useScopedStore<State>(store: StoreApi<State>): State;
function useScopedStore<State, Selected>(
  store: StoreApi<State>,
  selector: (state: State) => Selected,
): Selected;
function useScopedStore<State, Selected>(
  store: StoreApi<State>,
  selector?: (state: State) => Selected,
): State | Selected {
  if (typeof store.getState !== "function") {
    const legacyHook = store as unknown as (
      selector?: (state: State) => Selected,
    ) => State | Selected;
    return legacyHook(selector);
  }

  return useStore(
    store,
    selector ?? ((state: State) => state as State | Selected),
  );
}

export const useConversationStoreApi = () =>
  useConversationScopedStores().conversation;
export const useStatusStoreApi = () => useConversationScopedStores().status;
export const useEventMessageStoreApi = () =>
  useConversationScopedStores().eventMessage;
export const useAgentStoreApi = () => useConversationScopedStores().agent;
export const useBrowserStoreApi = () => useConversationScopedStores().browser;
export const useCommandStoreApi = () => useConversationScopedStores().command;
export const useMetricsStoreApi = () => useConversationScopedStores().metrics;
export const useSecurityAnalyzerStoreApi = () =>
  useConversationScopedStores().securityAnalyzer;
export const useEventStoreApi = () => useConversationScopedStores().event;
export const useErrorMessageStoreApi = () =>
  useConversationScopedStores().errorMessage;
export const useOptimisticUserMessageStoreApi = () =>
  useConversationScopedStores().optimisticUserMessage;
export const useV1ConversationStateStoreApi = () =>
  useConversationScopedStores().v1ConversationState;

export function useConversationStore(): ConversationStore;
export function useConversationStore<Selected>(
  selector: (state: ConversationStore) => Selected,
): Selected;
export function useConversationStore<Selected>(
  selector?: (state: ConversationStore) => Selected,
) {
  const store = useConversationStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}

export function useStatusStore(): StatusState;
export function useStatusStore<Selected>(
  selector: (state: StatusState) => Selected,
): Selected;
export function useStatusStore<Selected>(
  selector?: (state: StatusState) => Selected,
) {
  const store = useStatusStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}

export function useEventMessageStore(): EventMessageStore;
export function useEventMessageStore<Selected>(
  selector: (state: EventMessageStore) => Selected,
): Selected;
export function useEventMessageStore<Selected>(
  selector?: (state: EventMessageStore) => Selected,
) {
  const store = useEventMessageStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}

export function useAgentStore(): AgentStore;
export function useAgentStore<Selected>(
  selector: (state: AgentStore) => Selected,
): Selected;
export function useAgentStore<Selected>(
  selector?: (state: AgentStore) => Selected,
) {
  const store = useAgentStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}

export function useBrowserStore(): BrowserStore;
export function useBrowserStore<Selected>(
  selector: (state: BrowserStore) => Selected,
): Selected;
export function useBrowserStore<Selected>(
  selector?: (state: BrowserStore) => Selected,
) {
  const store = useBrowserStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}

export function useCommandStore(): CommandState;
export function useCommandStore<Selected>(
  selector: (state: CommandState) => Selected,
): Selected;
export function useCommandStore<Selected>(
  selector?: (state: CommandState) => Selected,
) {
  const store = useCommandStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}

export function useMetricsStore(): MetricsStore;
export function useMetricsStore<Selected>(
  selector: (state: MetricsStore) => Selected,
): Selected;
export function useMetricsStore<Selected>(
  selector?: (state: MetricsStore) => Selected,
) {
  const store = useMetricsStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}

export function useSecurityAnalyzerStore(): SecurityAnalyzerStore;
export function useSecurityAnalyzerStore<Selected>(
  selector: (state: SecurityAnalyzerStore) => Selected,
): Selected;
export function useSecurityAnalyzerStore<Selected>(
  selector?: (state: SecurityAnalyzerStore) => Selected,
) {
  const store = useSecurityAnalyzerStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}

export function useEventStore(): EventState;
export function useEventStore<Selected>(
  selector: (state: EventState) => Selected,
): Selected;
export function useEventStore<Selected>(
  selector?: (state: EventState) => Selected,
) {
  const store = useEventStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}

export function useErrorMessageStore(): ErrorMessageStore;
export function useErrorMessageStore<Selected>(
  selector: (state: ErrorMessageStore) => Selected,
): Selected;
export function useErrorMessageStore<Selected>(
  selector?: (state: ErrorMessageStore) => Selected,
) {
  const store = useErrorMessageStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}

export function useOptimisticUserMessageStore(): OptimisticUserMessageStore;
export function useOptimisticUserMessageStore<Selected>(
  selector: (state: OptimisticUserMessageStore) => Selected,
): Selected;
export function useOptimisticUserMessageStore<Selected>(
  selector?: (state: OptimisticUserMessageStore) => Selected,
) {
  const store = useOptimisticUserMessageStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}

export function useV1ConversationStateStore(): V1ConversationStateStore;
export function useV1ConversationStateStore<Selected>(
  selector: (state: V1ConversationStateStore) => Selected,
): Selected;
export function useV1ConversationStateStore<Selected>(
  selector?: (state: V1ConversationStateStore) => Selected,
) {
  const store = useV1ConversationStateStoreApi();
  return selector ? useScopedStore(store, selector) : useScopedStore(store);
}
