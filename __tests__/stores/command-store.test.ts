import { describe, it, expect, beforeEach } from "vitest";
import { useCommandStore } from "#/stores/command-store";

const MAX_RETAINED_COMMANDS = 400;
const MAX_RETAINED_OUTPUT_LENGTH = 20_000;
const TRUNCATION_MARKER = "\n\n[output truncated in terminal replay]";

const commands = () => useCommandStore.getState().commands;

describe("useCommandStore", () => {
  beforeEach(() => {
    useCommandStore.getState().clearTerminal();
  });

  it("appends input and output entries in order", () => {
    const { appendInput, appendOutput } = useCommandStore.getState();

    appendInput("echo hello");
    appendOutput("hello");

    expect(commands()).toEqual([
      { content: "echo hello", type: "input" },
      { content: "hello", type: "output" },
    ]);
  });

  it("leaves output at or under the limit untouched", () => {
    const content = "x".repeat(MAX_RETAINED_OUTPUT_LENGTH);

    useCommandStore.getState().appendOutput(content);

    const [entry] = commands();
    expect(entry.content).toBe(content);
    expect(entry.content).not.toContain(TRUNCATION_MARKER);
  });

  it("truncates oversized output and appends an explicit marker", () => {
    const content = "y".repeat(MAX_RETAINED_OUTPUT_LENGTH + 5_000);

    useCommandStore.getState().appendOutput(content);

    const [entry] = commands();
    expect(entry.content).toBe(
      `${"y".repeat(MAX_RETAINED_OUTPUT_LENGTH)}${TRUNCATION_MARKER}`,
    );
    // The marker lets users tell a truncated replay apart from genuinely
    // short output.
    expect(entry.content).toContain(TRUNCATION_MARKER);
  });

  it("does not truncate input content", () => {
    const content = "z".repeat(MAX_RETAINED_OUTPUT_LENGTH + 5_000);

    useCommandStore.getState().appendInput(content);

    expect(commands()[0].content).toBe(content);
  });

  it("caps retained commands and drops the oldest first (FIFO)", () => {
    const { appendInput } = useCommandStore.getState();
    const total = MAX_RETAINED_COMMANDS + 5;

    for (let i = 0; i < total; i += 1) {
      appendInput(`cmd-${i}`);
    }

    const retained = commands();
    expect(retained).toHaveLength(MAX_RETAINED_COMMANDS);
    // The five oldest (cmd-0..cmd-4) were dropped; cmd-5 is now the head and
    // the most recent command is the tail.
    expect(retained[0].content).toBe("cmd-5");
    expect(retained[retained.length - 1].content).toBe(`cmd-${total - 1}`);
  });

  it("clears all retained commands", () => {
    const { appendInput, clearTerminal } = useCommandStore.getState();
    appendInput("echo hello");

    clearTerminal();

    expect(commands()).toEqual([]);
  });
});
