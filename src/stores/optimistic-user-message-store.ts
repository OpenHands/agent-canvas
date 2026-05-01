import { create, createStore, type StateCreator, type StoreApi } from "zustand";

export interface OptimisticUserMessageState {
  optimisticUserMessage: string | null;
}

export interface OptimisticUserMessageActions {
  setOptimisticUserMessage: (message: string) => void;
  getOptimisticUserMessage: () => string | null;
  removeOptimisticUserMessage: () => void;
}

export type OptimisticUserMessageStore = OptimisticUserMessageState &
  OptimisticUserMessageActions;
export type OptimisticUserMessageStoreApi =
  StoreApi<OptimisticUserMessageStore>;

const createOptimisticUserMessageState =
  (
    initialMessage: string | null = null,
  ): StateCreator<OptimisticUserMessageStore> =>
  (set, get) => ({
    optimisticUserMessage: initialMessage,

    setOptimisticUserMessage: (message: string) =>
      set(() => ({
        optimisticUserMessage: message,
      })),

    getOptimisticUserMessage: () => get().optimisticUserMessage,

    removeOptimisticUserMessage: () =>
      set(() => ({
        optimisticUserMessage: null,
      })),
  });

export const createOptimisticUserMessageStore = (
  initialMessage: string | null = null,
): OptimisticUserMessageStoreApi =>
  createStore<OptimisticUserMessageStore>()(
    createOptimisticUserMessageState(initialMessage),
  );

export const useOptimisticUserMessageStore =
  create<OptimisticUserMessageStore>()(createOptimisticUserMessageState());
