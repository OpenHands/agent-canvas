import { describe, expect, it } from "vitest";
import { ConversationSource } from "#/components/features/conversation-panel/conversation-card/conversation-source";

describe("ConversationSource.fromTags", () => {
  it("returns null when tags are absent", () => {
    expect(ConversationSource.fromTags(null)).toBeNull();
    expect(ConversationSource.fromTags(undefined)).toBeNull();
  });

  it("returns null when no provenance tags are present", () => {
    expect(
      ConversationSource.fromTags({ repo: "spotwise/ui", status: "review" }),
    ).toBeNull();
  });

  it("extracts origin, linear, requester, and url", () => {
    expect(
      ConversationSource.fromTags({
        source: "hermes",
        linear: "ENG-123",
        requester: "raimonds",
        sourceurl: "https://linear.app/issue/ENG-123",
      }),
    ).toEqual({
      origin: "hermes",
      linear: "ENG-123",
      requester: "raimonds",
      url: "https://linear.app/issue/ENG-123",
    });
  });

  it("trims whitespace and ignores blank values", () => {
    expect(
      ConversationSource.fromTags({
        source: "  hermes  ",
        linear: "   ",
      }),
    ).toEqual({ origin: "hermes", linear: undefined, requester: undefined });
  });

  it("falls back across alternate key spellings", () => {
    expect(
      ConversationSource.fromTags({
        origin: "hermes",
        source_url: "https://example.test/x",
      }),
    ).toEqual({
      origin: "hermes",
      linear: undefined,
      requester: undefined,
      url: "https://example.test/x",
    });
  });
});
