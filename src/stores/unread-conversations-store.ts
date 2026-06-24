import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Manual unread flag only — there is no server-side read/activity tracking yet.
// "Mark as unread" sets the flag; opening or "Mark as read" clears it.
interface UnreadConversationsState {
  unreadByBackendId: Record<string, string[]>;
}

interface UnreadConversationsActions {
  markUnread: (backendId: string, conversationId: string) => void;
  markRead: (backendId: string, conversationId: string) => void;
  toggleUnread: (backendId: string, conversationId: string) => void;
  pruneMissingConversations: (
    backendId: string,
    existingIds: readonly string[],
  ) => void;
}

type UnreadConversationsStore = UnreadConversationsState &
  UnreadConversationsActions;

const initialState: UnreadConversationsState = {
  unreadByBackendId: {},
};

function getUnreadForBackend(
  unreadByBackendId: Record<string, string[]>,
  backendId: string,
): string[] {
  return unreadByBackendId[backendId] ?? [];
}

export const useUnreadConversationsStore = create<UnreadConversationsStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      markUnread: (backendId, conversationId) => {
        const current = getUnreadForBackend(get().unreadByBackendId, backendId);
        if (current.includes(conversationId)) {
          return;
        }
        set((state) => ({
          unreadByBackendId: {
            ...state.unreadByBackendId,
            [backendId]: [conversationId, ...current],
          },
        }));
      },

      markRead: (backendId, conversationId) => {
        const current = getUnreadForBackend(get().unreadByBackendId, backendId);
        if (!current.includes(conversationId)) {
          return;
        }
        set((state) => ({
          unreadByBackendId: {
            ...state.unreadByBackendId,
            [backendId]: current.filter((id) => id !== conversationId),
          },
        }));
      },

      toggleUnread: (backendId, conversationId) => {
        const current = getUnreadForBackend(get().unreadByBackendId, backendId);
        if (current.includes(conversationId)) {
          get().markRead(backendId, conversationId);
        } else {
          get().markUnread(backendId, conversationId);
        }
      },

      pruneMissingConversations: (backendId, existingIds) => {
        const existing = new Set(existingIds);
        const current = getUnreadForBackend(get().unreadByBackendId, backendId);
        const pruned = current.filter((id) => existing.has(id));
        if (pruned.length === current.length) {
          return;
        }
        set((state) => ({
          unreadByBackendId: {
            ...state.unreadByBackendId,
            [backendId]: pruned,
          },
        }));
      },
    }),
    {
      name: "unread-conversations",
      storage: createJSONStorage(() => localStorage),
      partialize: (state): UnreadConversationsState => ({
        unreadByBackendId: state.unreadByBackendId,
      }),
    },
  ),
);
