import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ConversationSortField,
  OrganizeMode,
  ThreadScope,
} from "#/components/features/conversation-panel/conversation-panel-list-helpers";

/**
 * User-toggleable display preferences for the sidebar conversation list
 * filter menu. These are intentionally persisted to localStorage (via the
 * same `zustand/persist` pattern used by `home-store` and `workspaces-store`)
 * so the menu state survives full reloads.
 *
 * To add a new preference exposed by the filter menu:
 *   1. Add a field here with a sensible default in `initialState`.
 *   2. Add matching `setX`/`toggleX` actions below.
 *   3. Read/write through the store in `conversation-panel.tsx`.
 * No additional plumbing (storage keys, sanitization, etc.) is required —
 * `persist` handles migration of unknown fields gracefully.
 */
interface ConversationPanelPreferencesState {
  showOlderConversations: boolean;
  showRepoBranchMetadata: boolean;
  showLlmProfiles: boolean;
  organizeMode: OrganizeMode;
  conversationSort: ConversationSortField;
  threadScope: ThreadScope;
}

interface ConversationPanelPreferencesActions {
  setShowOlderConversations: (value: boolean) => void;
  toggleShowOlderConversations: () => void;
  setShowRepoBranchMetadata: (value: boolean) => void;
  toggleShowRepoBranchMetadata: () => void;
  setShowLlmProfiles: (value: boolean) => void;
  toggleShowLlmProfiles: () => void;
  setOrganizeMode: (value: OrganizeMode) => void;
  setConversationSort: (value: ConversationSortField) => void;
  setThreadScope: (value: ThreadScope) => void;
}

type ConversationPanelPreferencesStore = ConversationPanelPreferencesState &
  ConversationPanelPreferencesActions;

const initialState: ConversationPanelPreferencesState = {
  showOlderConversations: true,
  showRepoBranchMetadata: false,
  showLlmProfiles: false,
  organizeMode: "chronological",
  conversationSort: "updated",
  threadScope: "all",
};

export const useConversationPanelPreferencesStore =
  create<ConversationPanelPreferencesStore>()(
    persist(
      (set) => ({
        ...initialState,

        setShowOlderConversations: (value) =>
          set(() => ({ showOlderConversations: value })),
        toggleShowOlderConversations: () =>
          set((state) => ({
            showOlderConversations: !state.showOlderConversations,
          })),

        setShowRepoBranchMetadata: (value) =>
          set(() => ({ showRepoBranchMetadata: value })),
        toggleShowRepoBranchMetadata: () =>
          set((state) => ({
            showRepoBranchMetadata: !state.showRepoBranchMetadata,
          })),

        setShowLlmProfiles: (value) => set(() => ({ showLlmProfiles: value })),
        toggleShowLlmProfiles: () =>
          set((state) => ({
            showLlmProfiles: !state.showLlmProfiles,
          })),

        setOrganizeMode: (value) => set(() => ({ organizeMode: value })),
        setConversationSort: (value) =>
          set(() => ({ conversationSort: value })),
        setThreadScope: (value) => set(() => ({ threadScope: value })),
      }),
      {
        name: "conversation-panel-preferences",
        storage: createJSONStorage(() => localStorage),
        // Only persist the data fields — actions are recreated on each load.
        partialize: (state): ConversationPanelPreferencesState => ({
          showOlderConversations: state.showOlderConversations,
          showRepoBranchMetadata: state.showRepoBranchMetadata,
          showLlmProfiles: state.showLlmProfiles,
          organizeMode: state.organizeMode,
          conversationSort: state.conversationSort,
          threadScope: state.threadScope,
        }),
      },
    ),
  );
