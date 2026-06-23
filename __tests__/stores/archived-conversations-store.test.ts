import { beforeEach, describe, expect, it } from "vitest";
import { useArchivedConversationsStore } from "#/stores/archived-conversations-store";

const STORAGE_KEY = "archived-conversations";
const BACKEND_ID = "default-local";

describe("archived-conversations store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useArchivedConversationsStore.setState({ archivedByBackendId: {} });
  });

  it("archives a conversation at the front of the backend list", () => {
    const { archiveConversation } = useArchivedConversationsStore.getState();
    archiveConversation(BACKEND_ID, "conversation-a");
    archiveConversation(BACKEND_ID, "conversation-b");

    expect(
      useArchivedConversationsStore.getState().archivedByBackendId[BACKEND_ID],
    ).toEqual(["conversation-b", "conversation-a"]);
  });

  it("does not duplicate archives for the same conversation", () => {
    const { archiveConversation } = useArchivedConversationsStore.getState();
    archiveConversation(BACKEND_ID, "conversation-a");
    archiveConversation(BACKEND_ID, "conversation-a");

    expect(
      useArchivedConversationsStore.getState().archivedByBackendId[BACKEND_ID],
    ).toEqual(["conversation-a"]);
  });

  it("toggles archive state", () => {
    const { toggleArchive } = useArchivedConversationsStore.getState();
    toggleArchive(BACKEND_ID, "conversation-a");
    expect(
      useArchivedConversationsStore.getState().archivedByBackendId[BACKEND_ID],
    ).toEqual(["conversation-a"]);

    toggleArchive(BACKEND_ID, "conversation-a");
    expect(
      useArchivedConversationsStore.getState().archivedByBackendId[BACKEND_ID],
    ).toEqual([]);
  });

  it("prunes missing conversations and persists", () => {
    const { archiveConversation, pruneMissingConversations } =
      useArchivedConversationsStore.getState();
    archiveConversation(BACKEND_ID, "conversation-a");
    archiveConversation(BACKEND_ID, "conversation-b");
    pruneMissingConversations(BACKEND_ID, ["conversation-b"]);

    expect(
      useArchivedConversationsStore.getState().archivedByBackendId[BACKEND_ID],
    ).toEqual(["conversation-b"]);

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    expect(persisted.state.archivedByBackendId[BACKEND_ID]).toEqual([
      "conversation-b",
    ]);
  });
});
