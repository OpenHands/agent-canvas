import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Per-conversation mute, keyed by backend id exactly like
 * `pinned-conversations-store`. Muting a conversation suppresses its
 * cross-conversation attention signals — it stops contributing to the
 * tab-title `(N)` count + app badge and never fires a sound / OS interrupt
 * (see `conversation-attention` + `use-conversation-attention`). It does NOT
 * hide the row; the list still shows it (a noisy bot run you want to ignore
 * shouldn't vanish).
 *
 * Per-browser and advisory, like pins/unread — it tunes *your* notifications,
 * not a shared property of the conversation.
 */
interface MutedConversationsState {
  mutedByBackendId: Record<string, string[]>;
}

interface MutedConversationsActions {
  toggleMute: (backendId: string, conversationId: string) => void;
  pruneMissingConversations: (
    backendId: string,
    existingIds: readonly string[],
  ) => void;
}

type MutedConversationsStore = MutedConversationsState &
  MutedConversationsActions;

const initialState: MutedConversationsState = {
  mutedByBackendId: {},
};

function getMutedForBackend(
  mutedByBackendId: Record<string, string[]>,
  backendId: string,
): string[] {
  return mutedByBackendId[backendId] ?? [];
}

export const useMutedConversationsStore = create<MutedConversationsStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      toggleMute: (backendId, conversationId) => {
        const current = getMutedForBackend(get().mutedByBackendId, backendId);
        const next = current.includes(conversationId)
          ? current.filter((id) => id !== conversationId)
          : [conversationId, ...current];
        set((state) => ({
          mutedByBackendId: {
            ...state.mutedByBackendId,
            [backendId]: next,
          },
        }));
      },

      pruneMissingConversations: (backendId, existingIds) => {
        const existing = new Set(existingIds);
        const current = getMutedForBackend(get().mutedByBackendId, backendId);
        const pruned = current.filter((id) => existing.has(id));
        if (pruned.length === current.length) {
          return;
        }
        set((state) => ({
          mutedByBackendId: {
            ...state.mutedByBackendId,
            [backendId]: pruned,
          },
        }));
      },
    }),
    {
      name: "muted-conversations",
      storage: createJSONStorage(() => localStorage),
      partialize: (state): MutedConversationsState => ({
        mutedByBackendId: state.mutedByBackendId,
      }),
    },
  ),
);
