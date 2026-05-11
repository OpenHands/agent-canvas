import { useEffect, useState } from "react";
import type {
  ConversationTab,
  ConversationMode,
} from "#/stores/conversation-store";
import type { ViewMode } from "#/components/features/files-tab/view-mode";

export const LOCAL_STORAGE_KEYS = {
  CONVERSATION_STATE: "conversation-state",
} as const;

const CONVERSATION_STATE_UPDATED_EVENT = "conversation-state-updated";

type ConversationStateUpdatedDetail = {
  conversationId: string;
};

/**
 * Consolidated conversation state stored in a single localStorage key.
 */
export interface ConversationState {
  selectedTab: ConversationTab | null;
  rightPanelShown: boolean;
  unpinnedTabs: string[];
  conversationMode: ConversationMode;
  subConversationTaskId: string | null;
  draftMessage: string | null;
  /**
   * User's persisted choice for the Files tab diff-vs-files toggle.
   * `null` means "no explicit choice yet" — the Files tab then falls back
   * to its repo-aware default (diff inside a git repo with commits, files
   * otherwise).
   */
  filesTabDiffView: boolean | null;
  /** User's persisted choice for the Files tab Rich/Plain content toggle. */
  filesTabContentViewMode: ViewMode;
}

const DEFAULT_CONVERSATION_STATE: ConversationState = {
  selectedTab: "files",
  rightPanelShown: true,
  unpinnedTabs: [],
  conversationMode: "code",
  subConversationTaskId: null,
  draftMessage: null,
  filesTabDiffView: null,
  filesTabContentViewMode: "rich",
};

const VALID_CONVERSATION_TABS: ReadonlySet<ConversationTab> = new Set([
  "files",
  "browser",
  "vscode",
  "terminal",
  "planner",
  "tasklist",
]);

function sanitizeStoredState(
  stored: Partial<ConversationState>,
): Partial<ConversationState> {
  // Drop selectedTab values that no longer correspond to a real tab (e.g.
  // "editor" or "served" persisted before the Files tab refactor) so the
  // default fallback is applied instead.
  if (
    stored.selectedTab != null &&
    !VALID_CONVERSATION_TABS.has(stored.selectedTab as ConversationTab)
  ) {
    const rest = { ...stored };
    delete rest.selectedTab;
    return rest;
  }
  return stored;
}

/**
 * Check if a conversation ID is a temporary task ID that should not be persisted.
 * Task IDs have the format "task-{uuid}" and are used during V1 conversation initialization.
 */
export function isTaskConversationId(conversationId: string): boolean {
  return conversationId.startsWith("task-");
}

/**
 * Whether persistence should be skipped for this conversation id.
 *
 * Skips:
 *  - empty string ids (callers outside of a conversation route, e.g.
 *    rendered inside a unit test without a NavigationProvider)
 *  - "task-..." ids used as placeholders during V1 conversation
 *    initialization
 */
function shouldSkipPersistence(conversationId: string): boolean {
  return conversationId === "" || isTaskConversationId(conversationId);
}

/**
 * Get the full conversation state from localStorage.
 */
export function getConversationState(
  conversationId: string,
): ConversationState {
  if (shouldSkipPersistence(conversationId)) {
    return DEFAULT_CONVERSATION_STATE;
  }
  try {
    const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;
    const item = localStorage.getItem(key);
    if (item !== null) {
      return {
        ...DEFAULT_CONVERSATION_STATE,
        ...sanitizeStoredState(JSON.parse(item)),
      };
    }
    return DEFAULT_CONVERSATION_STATE;
  } catch {
    return DEFAULT_CONVERSATION_STATE;
  }
}

/**
 * Set the conversation state in localStorage, merging with existing state.
 */
export function setConversationState(
  conversationId: string,
  updates: Partial<ConversationState>,
): void {
  if (shouldSkipPersistence(conversationId)) {
    return;
  }
  try {
    const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;
    const currentState = getConversationState(conversationId);
    const newState = { ...currentState, ...updates };
    localStorage.setItem(key, JSON.stringify(newState));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<ConversationStateUpdatedDetail>(
          CONVERSATION_STATE_UPDATED_EVENT,
          { detail: { conversationId } },
        ),
      );
    }
  } catch (err) {
    console.warn("Failed to set conversation localStorage", err);
  }
}

export function clearConversationLocalStorage(conversationId: string) {
  try {
    const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;
    localStorage.removeItem(key);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<ConversationStateUpdatedDetail>(
          CONVERSATION_STATE_UPDATED_EVENT,
          { detail: { conversationId } },
        ),
      );
    }
  } catch (err) {
    console.warn(
      "Failed to clear conversation localStorage",
      conversationId,
      err,
    );
  }
}

/**
 * React hook for conversation-scoped localStorage state.
 * Returns the full state and individual setters for each property.
 */
export function useConversationLocalStorageState(conversationId: string): {
  state: ConversationState;
  setSelectedTab: (tab: ConversationTab | null) => void;
  setRightPanelShown: (shown: boolean) => void;
  setUnpinnedTabs: (tabs: string[]) => void;
  setConversationMode: (mode: ConversationMode) => void;
  setDraftMessage: (message: string | null) => void;
  setFilesTabDiffView: (diffView: boolean | null) => void;
  setFilesTabContentViewMode: (mode: ViewMode) => void;
} {
  const [state, setState] = useState<ConversationState>(() =>
    getConversationState(conversationId),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const key = `${LOCAL_STORAGE_KEYS.CONVERSATION_STATE}-${conversationId}`;

    const syncState = () => {
      setState(getConversationState(conversationId));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === key) {
        syncState();
      }
    };

    const handleConversationStateUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<ConversationStateUpdatedDetail>;
      if (customEvent.detail?.conversationId === conversationId) {
        syncState();
      }
    };

    // Ensure this hook reflects latest state for the current conversation ID.
    syncState();

    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      CONVERSATION_STATE_UPDATED_EVENT,
      handleConversationStateUpdated,
    );

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        CONVERSATION_STATE_UPDATED_EVENT,
        handleConversationStateUpdated,
      );
    };
  }, [conversationId]);

  const updateState = (updates: Partial<ConversationState>) => {
    if (shouldSkipPersistence(conversationId)) {
      // No durable storage for this id (empty / task placeholder), but the
      // hook is still useful as ephemeral in-memory state — update the
      // local React mirror directly so toggles in the UI behave normally
      // until a real conversation id arrives.
      setState((prev) => ({ ...prev, ...updates }));
      return;
    }
    setConversationState(conversationId, updates);
  };

  return {
    state,
    setSelectedTab: (tab) => updateState({ selectedTab: tab }),
    setRightPanelShown: (shown) => updateState({ rightPanelShown: shown }),
    setUnpinnedTabs: (tabs) => updateState({ unpinnedTabs: tabs }),
    setConversationMode: (mode) => updateState({ conversationMode: mode }),
    setDraftMessage: (message) => updateState({ draftMessage: message }),
    setFilesTabDiffView: (diffView) =>
      updateState({ filesTabDiffView: diffView }),
    setFilesTabContentViewMode: (mode) =>
      updateState({ filesTabContentViewMode: mode }),
  };
}
