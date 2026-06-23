import { describe, it, expect } from "vitest";
import {
  appendToDraft,
  formatSelectionPrompt,
} from "#/components/features/chat/selection-prompt";

describe("formatSelectionPrompt", () => {
  it("quotes a single line", () => {
    expect(formatSelectionPrompt("hello world", "")).toBe("> hello world");
  });

  it("quotes every line of a multi-line selection", () => {
    expect(formatSelectionPrompt("line one\nline two", "")).toBe(
      "> line one\n> line two",
    );
  });

  it("appends a trimmed comment after a blank line", () => {
    expect(formatSelectionPrompt("snippet", "  please explain  ")).toBe(
      "> snippet\n\nplease explain",
    );
  });

  it("trims surrounding whitespace from the selection", () => {
    expect(formatSelectionPrompt("  spaced  ", "")).toBe("> spaced");
  });
});

describe("appendToDraft", () => {
  it("returns the addition when the draft is empty", () => {
    expect(appendToDraft("", "> quote")).toBe("> quote");
  });

  it("treats whitespace-only drafts as empty", () => {
    expect(appendToDraft("   \n  ", "> quote")).toBe("> quote");
  });

  it("separates existing content from the addition with a blank line", () => {
    expect(appendToDraft("my question", "> quote")).toBe(
      "my question\n\n> quote",
    );
  });

  it("strips trailing whitespace from the draft before joining", () => {
    expect(appendToDraft("my question   \n", "> quote")).toBe(
      "my question\n\n> quote",
    );
  });
});
