import { create, createStore, type StateCreator, type StoreApi } from "zustand";
import { V1ExecutionStatus } from "#/types/v1/core/base/common";

export interface V1ConversationStateStore {
  execution_status: V1ExecutionStatus | null;

  /**
   * Set the agent status
   */
  setExecutionStatus: (execution_status: V1ExecutionStatus) => void;

  /**
   * Reset the store to initial state
   */
  reset: () => void;
}

export type V1ConversationStateStoreApi = StoreApi<V1ConversationStateStore>;

const createV1ConversationState: StateCreator<V1ConversationStateStore> = (
  set,
) => ({
  execution_status: null,

  setExecutionStatus: (execution_status: V1ExecutionStatus) =>
    set({ execution_status }),

  reset: () => set({ execution_status: null }),
});

export const createV1ConversationStateStore = (): V1ConversationStateStoreApi =>
  createStore<V1ConversationStateStore>()(createV1ConversationState);

export const useV1ConversationStateStore = create<V1ConversationStateStore>(
  createV1ConversationState,
);
