import { describe, expect, it } from "vitest";
import {
  hasConversationStarted,
  resolvePickerKind,
  type ResolvePickerKindInput,
} from "#/components/features/chat/components/resolve-picker-kind";

const base: ResolvePickerKindInput = {
  hasConversation: false,
  isCloud: false,
  isAcp: false,
};

describe("resolvePickerKind", () => {
  // The pill is always an LLM selector (OSS-5735) — agent-profile switching
  // lives in the "+" tools menu, so no input combination yields a profile
  // picker here.
  describe("home (no active conversation)", () => {
    it("shows the LLM-profile picker on local", () => {
      expect(
        resolvePickerKind({ ...base, hasConversation: false, isCloud: false }),
      ).toBe("llm-profile");
    });

    it("shows the model picker on cloud", () => {
      // Cloud has no home LLM-profile activate path.
      expect(
        resolvePickerKind({ ...base, hasConversation: false, isCloud: true }),
      ).toBe("model");
    });

    it("shows the constrained model picker when the active agent is ACP, regardless of backend", () => {
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: false,
          isCloud: false,
          isAcp: true,
        }),
      ).toBe("model");
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: false,
          isCloud: true,
          isAcp: true,
        }),
      ).toBe("model");
    });
  });

  describe("inside a conversation", () => {
    it("uses the pre-run fallback for an unstarted conversation", () => {
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: true,
          hasStartedConversation: false,
          isCloud: false,
        }),
      ).toBe("llm-profile");
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: true,
          hasStartedConversation: false,
          isCloud: true,
        }),
      ).toBe("model");
    });

    it("shows the model picker for an unstarted ACP conversation", () => {
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: true,
          hasStartedConversation: false,
          isCloud: false,
          isAcp: true,
        }),
      ).toBe("model");
    });

    it("shows the model picker for an ACP conversation regardless of backend", () => {
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: true,
          hasStartedConversation: true,
          isCloud: false,
          isAcp: true,
        }),
      ).toBe("model");
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: true,
          hasStartedConversation: true,
          isCloud: true,
          isAcp: true,
        }),
      ).toBe("model");
    });

    it("shows the LLM-profile picker for an OpenHands conversation regardless of backend", () => {
      // /switch_profile is a real endpoint on both backends (cloud proxies
      // POST /api/v1/app-conversations/{id}/switch_profile) — no cloud
      // restriction here.
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: true,
          hasStartedConversation: true,
          isCloud: false,
          isAcp: false,
        }),
      ).toBe("llm-profile");
      expect(
        resolvePickerKind({
          ...base,
          hasConversation: true,
          hasStartedConversation: true,
          isCloud: true,
          isAcp: false,
        }),
      ).toBe("llm-profile");
    });
  });
});

describe("hasConversationStarted", () => {
  const empty = {
    isLoadingHistory: false,
    hasUserEvents: false,
    hasPendingUserMessages: false,
    hasSubstantiveAgentActions: false,
    hasModelEntries: false,
  };

  it("keeps a fully loaded blank conversation in pre-run state", () => {
    expect(hasConversationStarted(empty)).toBe(false);
  });

  it.each([
    "isLoadingHistory",
    "hasUserEvents",
    "hasPendingUserMessages",
    "hasSubstantiveAgentActions",
    "hasModelEntries",
  ] as const)("treats %s as started", (field) => {
    expect(hasConversationStarted({ ...empty, [field]: true })).toBe(true);
  });
});
