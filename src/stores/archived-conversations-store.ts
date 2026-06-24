import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ArchivedConversationsState {
  archivedByBackendId: Record<string, string[]>;
}

interface ArchivedConversationsActions {
  archiveConversation: (backendId: string, conversationId: string) => void;
  unarchiveConversation: (backendId: string, conversationId: string) => void;
  toggleArchive: (backendId: string, conversationId: string) => void;
  pruneMissingConversations: (
    backendId: string,
    existingIds: readonly string[],
  ) => void;
}

type ArchivedConversationsStore = ArchivedConversationsState &
  ArchivedConversationsActions;

const initialState: ArchivedConversationsState = {
  archivedByBackendId: {},
};

function getArchivedForBackend(
  archivedByBackendId: Record<string, string[]>,
  backendId: string,
): string[] {
  return archivedByBackendId[backendId] ?? [];
}

export const useArchivedConversationsStore =
  create<ArchivedConversationsStore>()(
    persist(
      (set, get) => ({
        ...initialState,

        archiveConversation: (backendId, conversationId) => {
          const current = getArchivedForBackend(
            get().archivedByBackendId,
            backendId,
          );
          if (current.includes(conversationId)) {
            return;
          }
          set((state) => ({
            archivedByBackendId: {
              ...state.archivedByBackendId,
              [backendId]: [conversationId, ...current],
            },
          }));
        },

        unarchiveConversation: (backendId, conversationId) => {
          const current = getArchivedForBackend(
            get().archivedByBackendId,
            backendId,
          );
          if (!current.includes(conversationId)) {
            return;
          }
          set((state) => ({
            archivedByBackendId: {
              ...state.archivedByBackendId,
              [backendId]: current.filter((id) => id !== conversationId),
            },
          }));
        },

        toggleArchive: (backendId, conversationId) => {
          const current = getArchivedForBackend(
            get().archivedByBackendId,
            backendId,
          );
          if (current.includes(conversationId)) {
            get().unarchiveConversation(backendId, conversationId);
          } else {
            get().archiveConversation(backendId, conversationId);
          }
        },

        pruneMissingConversations: (backendId, existingIds) => {
          const existing = new Set(existingIds);
          const current = getArchivedForBackend(
            get().archivedByBackendId,
            backendId,
          );
          const pruned = current.filter((id) => existing.has(id));
          if (pruned.length === current.length) {
            return;
          }
          set((state) => ({
            archivedByBackendId: {
              ...state.archivedByBackendId,
              [backendId]: pruned,
            },
          }));
        },
      }),
      {
        name: "archived-conversations",
        storage: createJSONStorage(() => localStorage),
        partialize: (state): ArchivedConversationsState => ({
          archivedByBackendId: state.archivedByBackendId,
        }),
      },
    ),
  );
