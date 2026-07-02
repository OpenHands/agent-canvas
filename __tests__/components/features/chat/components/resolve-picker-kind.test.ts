import { describe, expect, it } from "vitest";
import {
  resolvePickerKind,
  type ResolvePickerKindInput,
} from "#/components/features/chat/components/resolve-picker-kind";

const base: ResolvePickerKindInput = {
  hasConversation: false,
  isCloud: false,
  isAcp: false,
  profilesAvailable: true,
};

describe("resolvePickerKind", () => {
  describe("home (no active conversation)", () => {
    it("shows the agent-profile picker when profiles are available", () => {
      expect(resolvePickerKind({ ...base, hasConversation: false })).toBe(
        "agent-profile",
      );
      // isCloud / isAcp don't matter once profiles exist.
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: false,
          isCloud: true,
          isAcp: true,
        }),
      ).toBe("agent-profile");
    });

    it("falls back to the LLM-profile picker on local when no profiles exist", () => {
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: false,
          isCloud: false,
          profilesAvailable: false,
        }),
      ).toBe("llm-profile");
    });

    it("falls back to the model picker on cloud when no profiles exist", () => {
      // Cloud has no home LLM-profile activate path.
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: false,
          isCloud: true,
          profilesAvailable: false,
        }),
      ).toBe("model");
    });
  });

  describe("inside a conversation", () => {
    it("shows the model picker on cloud regardless of ACP", () => {
      expect(
        resolvePickerKind({ ...base, hasConversation: true, isCloud: true }),
      ).toBe("model");
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: true,
          isCloud: true,
          isAcp: true,
        }),
      ).toBe("model");
    });

    it("shows the model picker for a local ACP conversation", () => {
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: true,
          isCloud: false,
          isAcp: true,
        }),
      ).toBe("model");
    });

    it("shows the LLM-profile picker for a local OpenHands conversation", () => {
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: true,
          isCloud: false,
          isAcp: false,
        }),
      ).toBe("llm-profile");
    });

    it("ignores profilesAvailable once a conversation is active", () => {
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: true,
          isCloud: false,
          isAcp: false,
          profilesAvailable: false,
        }),
      ).toBe("llm-profile");
    });
  });
});
