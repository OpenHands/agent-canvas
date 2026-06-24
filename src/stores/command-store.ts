import { create } from "zustand";

export type Command = {
  content: string;
  type: "input" | "output";
};

// Terminal output is replayed from the agent and can stream indefinitely. Cap
// the retained entries so a long-running session can't grow this array (and the
// per-chunk clone below) without bound. The xterm view keeps its own scrollback;
// this only bounds what the store holds in memory.
const MAX_TERMINAL_ENTRIES = 5000;

const appendBounded = (commands: Command[], entry: Command): Command[] => {
  const next = [...commands, entry];
  return next.length > MAX_TERMINAL_ENTRIES
    ? next.slice(next.length - MAX_TERMINAL_ENTRIES)
    : next;
};

interface CommandState {
  commands: Command[];
  appendInput: (content: string) => void;
  appendOutput: (content: string) => void;
  clearTerminal: () => void;
}

export const useCommandStore = create<CommandState>((set) => ({
  commands: [],
  appendInput: (content: string) =>
    set((state) => ({
      commands: appendBounded(state.commands, { content, type: "input" }),
    })),
  appendOutput: (content: string) =>
    set((state) => ({
      commands: appendBounded(state.commands, { content, type: "output" }),
    })),
  clearTerminal: () => set({ commands: [] }),
}));
