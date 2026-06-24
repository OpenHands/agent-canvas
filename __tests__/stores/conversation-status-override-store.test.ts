import { beforeEach, describe, expect, it } from "vitest";
import { useConversationStatusOverrideStore } from "#/stores/conversation-status-override-store";

const STORAGE_KEY = "conversation-status-overrides";
const BACKEND_ID = "default-local";

describe("conversation-status-override store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useConversationStatusOverrideStore.setState({ overridesByBackendId: {} });
  });

  it("sets and overwrites a status override", () => {
    const { setStatus } = useConversationStatusOverrideStore.getState();
    setStatus(BACKEND_ID, "conversation-a", "in_review");
    expect(
      useConversationStatusOverrideStore.getState().overridesByBackendId[
        BACKEND_ID
      ],
    ).toEqual({ "conversation-a": "in_review" });

    setStatus(BACKEND_ID, "conversation-a", "done");
    expect(
      useConversationStatusOverrideStore.getState().overridesByBackendId[
        BACKEND_ID
      ],
    ).toEqual({ "conversation-a": "done" });
  });

  it("clears a status override", () => {
    const { setStatus, clearStatus } =
      useConversationStatusOverrideStore.getState();
    setStatus(BACKEND_ID, "conversation-a", "done");
    setStatus(BACKEND_ID, "conversation-b", "in_progress");
    clearStatus(BACKEND_ID, "conversation-a");

    expect(
      useConversationStatusOverrideStore.getState().overridesByBackendId[
        BACKEND_ID
      ],
    ).toEqual({ "conversation-b": "in_progress" });
  });

  it("prunes missing conversations and persists", () => {
    const { setStatus, pruneMissingConversations } =
      useConversationStatusOverrideStore.getState();
    setStatus(BACKEND_ID, "conversation-a", "done");
    setStatus(BACKEND_ID, "conversation-b", "in_review");
    pruneMissingConversations(BACKEND_ID, ["conversation-b"]);

    expect(
      useConversationStatusOverrideStore.getState().overridesByBackendId[
        BACKEND_ID
      ],
    ).toEqual({ "conversation-b": "in_review" });

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    expect(persisted.state.overridesByBackendId[BACKEND_ID]).toEqual({
      "conversation-b": "in_review",
    });
  });
});
