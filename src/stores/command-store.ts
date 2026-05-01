import { create, createStore, type StateCreator, type StoreApi } from "zustand";

export type Command = {
  content: string;
  type: "input" | "output";
};

export interface CommandState {
  commands: Command[];
  appendInput: (content: string) => void;
  appendOutput: (content: string) => void;
  clearTerminal: () => void;
}

export type CommandStoreApi = StoreApi<CommandState>;

const createCommandState: StateCreator<CommandState> = (set) => ({
  commands: [],
  appendInput: (content: string) =>
    set((state) => ({
      commands: [...state.commands, { content, type: "input" }],
    })),
  appendOutput: (content: string) =>
    set((state) => ({
      commands: [...state.commands, { content, type: "output" }],
    })),
  clearTerminal: () => set({ commands: [] }),
});

export const createCommandStore = (): CommandStoreApi =>
  createStore<CommandState>()(createCommandState);

export const useCommandStore = create<CommandState>()(createCommandState);
