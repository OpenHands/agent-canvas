import { create, createStore, type StateCreator, type StoreApi } from "zustand";
import { AgentState } from "#/types/agent-state";

export interface AgentStateData {
  curAgentState: AgentState;
}

export interface AgentStore extends AgentStateData {
  setCurrentAgentState: (state: AgentState) => void;
  reset: () => void;
}

export type AgentStoreApi = StoreApi<AgentStore>;

const initialState: AgentStateData = {
  curAgentState: AgentState.LOADING,
};

const createAgentState: StateCreator<AgentStore> = (set) => ({
  ...initialState,
  setCurrentAgentState: (state: AgentState) => set({ curAgentState: state }),
  reset: () => set(initialState),
});

export const createAgentStore = (): AgentStoreApi =>
  createStore<AgentStore>()(createAgentState);

export const useAgentStore = create<AgentStore>()(createAgentState);
