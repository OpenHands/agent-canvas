import { create } from "zustand";

interface AttentionStore {
  /**
   * Number of background conversations currently awaiting the user
   * (blocked + needs-input). Written by `useConversationAttention`, read by
   * `useAppTitle`'s consumer to prefix the tab title with `(N)` and by the
   * app-badge side effect. Excludes the open conversation and finished ones.
   */
  pendingCount: number;
  setPendingCount: (pendingCount: number) => void;
}

export const useAttentionStore = create<AttentionStore>((set) => ({
  pendingCount: 0,
  setPendingCount: (pendingCount) => set({ pendingCount }),
}));
