import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ConversationStatusBucketId } from "#/components/features/conversation-panel/conversation-panel-list-helpers";

// Per-browser manual status overrides. When set, an override wins over the
// computed status bucket (tags / FINISHED fallback) so users can move a
// conversation between buckets themselves. Promote to a server tag later.
interface ConversationStatusOverrideState {
  overridesByBackendId: Record<
    string,
    Record<string, ConversationStatusBucketId>
  >;
}

interface ConversationStatusOverrideActions {
  setStatus: (
    backendId: string,
    conversationId: string,
    bucket: ConversationStatusBucketId,
  ) => void;
  clearStatus: (backendId: string, conversationId: string) => void;
  pruneMissingConversations: (
    backendId: string,
    existingIds: readonly string[],
  ) => void;
}

type ConversationStatusOverrideStore = ConversationStatusOverrideState &
  ConversationStatusOverrideActions;

const initialState: ConversationStatusOverrideState = {
  overridesByBackendId: {},
};

function getOverridesForBackend(
  overridesByBackendId: ConversationStatusOverrideState["overridesByBackendId"],
  backendId: string,
): Record<string, ConversationStatusBucketId> {
  return overridesByBackendId[backendId] ?? {};
}

export const useConversationStatusOverrideStore =
  create<ConversationStatusOverrideStore>()(
    persist(
      (set, get) => ({
        ...initialState,

        setStatus: (backendId, conversationId, bucket) => {
          const current = getOverridesForBackend(
            get().overridesByBackendId,
            backendId,
          );
          if (current[conversationId] === bucket) {
            return;
          }
          set((state) => ({
            overridesByBackendId: {
              ...state.overridesByBackendId,
              [backendId]: { ...current, [conversationId]: bucket },
            },
          }));
        },

        clearStatus: (backendId, conversationId) => {
          const current = getOverridesForBackend(
            get().overridesByBackendId,
            backendId,
          );
          if (!(conversationId in current)) {
            return;
          }
          const { [conversationId]: _removed, ...rest } = current;
          set((state) => ({
            overridesByBackendId: {
              ...state.overridesByBackendId,
              [backendId]: rest,
            },
          }));
        },

        pruneMissingConversations: (backendId, existingIds) => {
          const existing = new Set(existingIds);
          const current = getOverridesForBackend(
            get().overridesByBackendId,
            backendId,
          );
          const entries = Object.entries(current).filter(([id]) =>
            existing.has(id),
          );
          if (entries.length === Object.keys(current).length) {
            return;
          }
          set((state) => ({
            overridesByBackendId: {
              ...state.overridesByBackendId,
              [backendId]: Object.fromEntries(entries),
            },
          }));
        },
      }),
      {
        name: "conversation-status-overrides",
        storage: createJSONStorage(() => localStorage),
        partialize: (state): ConversationStatusOverrideState => ({
          overridesByBackendId: state.overridesByBackendId,
        }),
      },
    ),
  );
