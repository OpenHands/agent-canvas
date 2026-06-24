import { beforeEach, describe, expect, it } from "vitest";
import { useUnreadConversationsStore } from "#/stores/unread-conversations-store";

const STORAGE_KEY = "unread-conversations";
const BACKEND_ID = "default-local";

describe("unread-conversations store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUnreadConversationsStore.setState({ unreadByBackendId: {} });
  });

  it("marks a conversation unread at the front of the backend list", () => {
    const { markUnread } = useUnreadConversationsStore.getState();
    markUnread(BACKEND_ID, "conversation-a");
    markUnread(BACKEND_ID, "conversation-b");

    expect(
      useUnreadConversationsStore.getState().unreadByBackendId[BACKEND_ID],
    ).toEqual(["conversation-b", "conversation-a"]);
  });

  it("marking read removes the flag", () => {
    const { markUnread, markRead } = useUnreadConversationsStore.getState();
    markUnread(BACKEND_ID, "conversation-a");
    markRead(BACKEND_ID, "conversation-a");

    expect(
      useUnreadConversationsStore.getState().unreadByBackendId[BACKEND_ID],
    ).toEqual([]);
  });

  it("toggles unread state", () => {
    const { toggleUnread } = useUnreadConversationsStore.getState();
    toggleUnread(BACKEND_ID, "conversation-a");
    expect(
      useUnreadConversationsStore.getState().unreadByBackendId[BACKEND_ID],
    ).toEqual(["conversation-a"]);

    toggleUnread(BACKEND_ID, "conversation-a");
    expect(
      useUnreadConversationsStore.getState().unreadByBackendId[BACKEND_ID],
    ).toEqual([]);
  });

  it("prunes missing conversations and persists", () => {
    const { markUnread, pruneMissingConversations } =
      useUnreadConversationsStore.getState();
    markUnread(BACKEND_ID, "conversation-a");
    markUnread(BACKEND_ID, "conversation-b");
    pruneMissingConversations(BACKEND_ID, ["conversation-b"]);

    expect(
      useUnreadConversationsStore.getState().unreadByBackendId[BACKEND_ID],
    ).toEqual(["conversation-b"]);

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    expect(persisted.state.unreadByBackendId[BACKEND_ID]).toEqual([
      "conversation-b",
    ]);
  });
});
