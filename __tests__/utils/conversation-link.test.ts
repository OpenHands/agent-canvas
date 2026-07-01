import { describe, expect, it } from "vitest";
import { buildConversationHref } from "#/utils/conversation-link";

describe("buildConversationHref", () => {
  it("includes backendId as bid param", () => {
    const href = buildConversationHref("conv-1", "backend-abc", null);
    expect(href).toBe("/conversations/conv-1?bid=backend-abc");
  });

  it("includes orgId as oid param when present", () => {
    const href = buildConversationHref("conv-1", "backend-abc", "org-42");
    expect(href).toBe("/conversations/conv-1?bid=backend-abc&oid=org-42");
  });
});
