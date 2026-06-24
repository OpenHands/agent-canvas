import { beforeEach, describe, expect, it } from "vitest";
import { useMutedConversationsStore } from "#/stores/muted-conversations-store";

const BACKEND_ID = "default-local";
const OTHER_BACKEND = "cloud-1";

const muted = (backendId: string) =>
  useMutedConversationsStore.getState().mutedByBackendId[backendId] ?? [];

describe("muted-conversations store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useMutedConversationsStore.setState({ mutedByBackendId: {} });
  });

  it("toggles a conversation muted, then unmuted", () => {
    const { toggleMute } = useMutedConversationsStore.getState();
    toggleMute(BACKEND_ID, "a");
    expect(muted(BACKEND_ID)).toEqual(["a"]);
    toggleMute(BACKEND_ID, "a");
    expect(muted(BACKEND_ID)).toEqual([]);
  });

  it("mutes multiple, newest first, without duplicates", () => {
    const { toggleMute } = useMutedConversationsStore.getState();
    toggleMute(BACKEND_ID, "a");
    toggleMute(BACKEND_ID, "b");
    expect(muted(BACKEND_ID)).toEqual(["b", "a"]);
  });

  it("scopes mutes per backend id", () => {
    const { toggleMute } = useMutedConversationsStore.getState();
    toggleMute(BACKEND_ID, "a");
    toggleMute(OTHER_BACKEND, "b");
    expect(muted(BACKEND_ID)).toEqual(["a"]);
    expect(muted(OTHER_BACKEND)).toEqual(["b"]);
  });

  it("prunes muted ids no longer present, leaving the rest", () => {
    const { toggleMute, pruneMissingConversations } =
      useMutedConversationsStore.getState();
    toggleMute(BACKEND_ID, "a");
    toggleMute(BACKEND_ID, "b");
    pruneMissingConversations(BACKEND_ID, ["b"]);
    expect(muted(BACKEND_ID)).toEqual(["b"]);
  });

  it("persists to localStorage", () => {
    useMutedConversationsStore.getState().toggleMute(BACKEND_ID, "a");
    expect(window.localStorage.getItem("muted-conversations")).toContain("a");
  });
});
