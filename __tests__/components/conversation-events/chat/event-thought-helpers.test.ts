import { describe, it, expect } from "vitest";
import { splitInlineThink } from "#/components/conversation-events/chat/event-thought-helpers";

describe("splitInlineThink", () => {
  it("returns content unchanged when there is no <think> block", () => {
    expect(splitInlineThink("Hello! How can I help?")).toEqual({
      reasoning: "",
      message: "Hello! How can I help?",
    });
  });

  it("extracts a leading <think> block and keeps the trailing message", () => {
    const content =
      "<think>The user wants a greeting. Simple.</think>\n\n\nHello!";
    expect(splitInlineThink(content)).toEqual({
      reasoning: "The user wants a greeting. Simple.",
      message: "Hello!",
    });
  });

  it("treats an unclosed <think> (mid-stream) as reasoning so it never leaks", () => {
    expect(splitInlineThink("<think>The user is asking me to")).toEqual({
      reasoning: "The user is asking me to",
      message: "",
    });
  });

  it("joins multiple <think> blocks and keeps interleaved message text", () => {
    const content = "<think>a</think>Hello <think>b</think>world";
    expect(splitInlineThink(content)).toEqual({
      reasoning: "a\n\nb",
      message: "Hello world",
    });
  });

  it("returns an empty message when the content is reasoning only", () => {
    expect(splitInlineThink("<think>just thinking</think>")).toEqual({
      reasoning: "just thinking",
      message: "",
    });
  });
});
