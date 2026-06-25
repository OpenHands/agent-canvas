import { describe, expect, it } from "vitest";
import {
  getConversationHref,
  isWorkConversation,
} from "#/utils/work-conversations";
import { WORK_MODE_TAG, WORK_MODE_TAG_VALUE } from "#/types/work-manifest";

describe("work-conversations", () => {
  it("detects work conversations by tag", () => {
    expect(
      isWorkConversation({ [WORK_MODE_TAG]: WORK_MODE_TAG_VALUE }),
    ).toBe(true);
    expect(isWorkConversation({ appmode: "code" })).toBe(false);
  });

  it("builds mode-aware conversation links", () => {
    expect(getConversationHref("abc", { appmode: "work" })).toBe(
      "/work/tasks/abc",
    );
    expect(getConversationHref("abc", undefined)).toBe("/conversations/abc");
  });
});
