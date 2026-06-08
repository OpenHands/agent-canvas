import { create } from "zustand";

export type Command = {
  content: string;
  type: "input" | "output";
};

const MAX_RETAINED_COMMANDS = 400;
const MAX_RETAINED_OUTPUT_LENGTH = 20_000;

const truncateOutput = (content: string): string => {
  if (content.length <= MAX_RETAINED_OUTPUT_LENGTH) return content;
  return `${content.slice(0, MAX_RETAINED_OUTPUT_LENGTH)}\n\n[output truncated in terminal replay]`;
};

const appendCommand = (commands: Command[], command: Command): Command[] => {
  const next = [...commands, command];
  if (next.length <= MAX_RETAINED_COMMANDS) return next;
  return next.slice(next.length - MAX_RETAINED_COMMANDS);
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
      commands: appendCommand(state.commands, { content, type: "input" }),
    })),
  appendOutput: (content: string) =>
    set((state) => ({
      commands: appendCommand(state.commands, {
        content: truncateOutput(content),
        type: "output",
      }),
    })),
  clearTerminal: () => set({ commands: [] }),
}));
