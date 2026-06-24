import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  type ConversationSortField,
  type OrganizeMode,
  type ThreadScope,
} from "#/components/features/conversation-panel/conversation-panel-list-helpers";
import type { OwnerScope, SourceScope } from "#/utils/conversation-ownership";
import { PROJECT_FILTER_ALL } from "#/utils/project";

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
  showHoverMetadata: boolean;
  organizeMode: OrganizeMode;
  conversationSort: ConversationSortField;
  threadScope: ThreadScope;
  ownerScope: OwnerScope;
  sourceScope: SourceScope;
  groupFolderOrder: string[];
  /** Repo/workspace id to filter the list to, or "all". */
  repoFilter: string;
  /**
   * Active project slug to filter the list to, or "all". Doubles as the
   * launch target: new conversations created while a project is active inherit
   * its slug as `tags.project` (read in `use-create-conversation`). "all" ⇒
   * no project scope and no stamping (firehose default — see
   * `.context/research/project-scoping.md`).
   */
  projectFilter: string;
}

interface ConversationPanelPreferencesActions {
  setShowOlderConversations: (value: boolean) => void;
  toggleShowOlderConversations: () => void;
  setShowRepoBranchMetadata: (value: boolean) => void;
  toggleShowRepoBranchMetadata: () => void;
  setShowLlmProfiles: (value: boolean) => void;
  toggleShowLlmProfiles: () => void;
  setShowHoverMetadata: (value: boolean) => void;
  toggleShowHoverMetadata: () => void;
  setOrganizeMode: (value: OrganizeMode) => void;
  setConversationSort: (value: ConversationSortField) => void;
  setThreadScope: (value: ThreadScope) => void;
  setOwnerScope: (value: OwnerScope) => void;
  setSourceScope: (value: SourceScope) => void;
  setGroupFolderOrder: (order: readonly string[]) => void;
  setRepoFilter: (value: string) => void;
  setProjectFilter: (value: string) => void;
}

type ConversationPanelPreferencesStore = ConversationPanelPreferencesState &
  ConversationPanelPreferencesActions;

const initialState: ConversationPanelPreferencesState = {
  showOlderConversations: true,
  showRepoBranchMetadata: false,
  showLlmProfiles: false,
  showHoverMetadata: true,
  organizeMode: "chronological",
  conversationSort: "updated",
  threadScope: "all",
  // Default to "all" (no behavior change). "mine" is opt-in; until owner tags
  // backfill on existing conversations, defaulting to "mine" would hide most
  // of the list. See firehose-plan.md.
  ownerScope: "all",
  sourceScope: "all",
  groupFolderOrder: [],
  repoFilter: "all",
  projectFilter: PROJECT_FILTER_ALL,
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

        setShowHoverMetadata: (value) =>
          set(() => ({ showHoverMetadata: value })),
        toggleShowHoverMetadata: () =>
          set((state) => ({
            showHoverMetadata: !state.showHoverMetadata,
          })),

        setOrganizeMode: (value) => set(() => ({ organizeMode: value })),
        setConversationSort: (value) =>
          set(() => ({ conversationSort: value })),
        setThreadScope: (value) => set(() => ({ threadScope: value })),
        setOwnerScope: (value) => set(() => ({ ownerScope: value })),
        setSourceScope: (value) => set(() => ({ sourceScope: value })),
        setGroupFolderOrder: (order) =>
          set(() => ({ groupFolderOrder: [...order] })),
        setRepoFilter: (value) => set(() => ({ repoFilter: value })),
        setProjectFilter: (value) => set(() => ({ projectFilter: value })),
      }),
      {
        name: "conversation-panel-preferences",
        storage: createJSONStorage(() => localStorage),
        // Only persist the data fields — actions are recreated on each load.
        partialize: (state): ConversationPanelPreferencesState => ({
          showOlderConversations: state.showOlderConversations,
          showRepoBranchMetadata: state.showRepoBranchMetadata,
          showLlmProfiles: state.showLlmProfiles,
          showHoverMetadata: state.showHoverMetadata,
          organizeMode: state.organizeMode,
          conversationSort: state.conversationSort,
          threadScope: state.threadScope,
          ownerScope: state.ownerScope,
          sourceScope: state.sourceScope,
          groupFolderOrder: state.groupFolderOrder,
          repoFilter: state.repoFilter,
          projectFilter: state.projectFilter,
        }),
      },
    ),
  );

/**
 * The active project slug to stamp on a new conversation, or undefined when no
 * project is active ("all"). Read imperatively (not as a hook) at launch time
 * so creation paths pick up the *current* selection rather than a value
 * captured at render — see `use-create-conversation`.
 */
export function getActiveProjectSlug(): string | undefined {
  const value = useConversationPanelPreferencesStore.getState().projectFilter;
  return value && value !== PROJECT_FILTER_ALL ? value : undefined;
}
