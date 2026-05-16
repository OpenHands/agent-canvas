import { beforeEach, describe, expect, it } from "vitest";
import { useConversationPanelPreferencesStore } from "#/stores/conversation-panel-preferences-store";

const STORAGE_KEY = "conversation-panel-preferences";

describe("conversation-panel-preferences store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to showing older conversations, chronological list, and expected toggles", () => {
    const state = useConversationPanelPreferencesStore.getState();
    expect(state.showOlderConversations).toBe(true);
    expect(state.showRepoBranchMetadata).toBe(false);
    expect(state.showLlmProfiles).toBe(false);
    expect(state.organizeMode).toBe("chronological");
    expect(state.conversationSort).toBe("updated");
    expect(state.threadScope).toBe("all");
  });

  it("toggles showOlderConversations and persists the new value to localStorage", () => {
    useConversationPanelPreferencesStore
      .getState()
      .toggleShowOlderConversations();

    expect(
      useConversationPanelPreferencesStore.getState().showOlderConversations,
    ).toBe(false);

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    expect(persisted.state.showOlderConversations).toBe(false);
  });

  it("toggles showRepoBranchMetadata and persists the new value to localStorage", () => {
    useConversationPanelPreferencesStore
      .getState()
      .toggleShowRepoBranchMetadata();

    expect(
      useConversationPanelPreferencesStore.getState().showRepoBranchMetadata,
    ).toBe(true);

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    expect(persisted.state.showRepoBranchMetadata).toBe(true);
  });

  it("supports explicit setters for both preferences", () => {
    useConversationPanelPreferencesStore
      .getState()
      .setShowOlderConversations(false);
    useConversationPanelPreferencesStore
      .getState()
      .setShowRepoBranchMetadata(true);

    const state = useConversationPanelPreferencesStore.getState();
    expect(state.showOlderConversations).toBe(false);
    expect(state.showRepoBranchMetadata).toBe(true);
  });

  it("persists data fields but not action functions", () => {
    useConversationPanelPreferencesStore
      .getState()
      .toggleShowOlderConversations();

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    expect(Object.keys(persisted.state).sort()).toEqual([
      "conversationSort",
      "organizeMode",
      "showLlmProfiles",
      "showOlderConversations",
      "showRepoBranchMetadata",
      "threadScope",
    ]);
  });
});
