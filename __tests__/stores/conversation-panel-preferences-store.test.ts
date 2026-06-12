import { beforeEach, describe, expect, it } from "vitest";
import { useConversationPanelPreferencesStore } from "#/stores/conversation-panel-preferences-store";

const STORAGE_KEY = "conversation-panel-preferences";

describe("conversation-panel-preferences store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to showRecentOnly=true and expected preferences", () => {
    const state = useConversationPanelPreferencesStore.getState();
    expect(state.showRecentOnly).toBe(true);
    expect(state.showRepoBranchMetadata).toBe(false);
    expect(state.showLlmProfiles).toBe(false);
    expect(state.organizeMode).toBe("chronological");
    expect(state.conversationSort).toBe("updated");
  });

  it("sets showRecentOnly and persists to localStorage", () => {
    useConversationPanelPreferencesStore.getState().setShowRecentOnly(false);

    expect(
      useConversationPanelPreferencesStore.getState().showRecentOnly,
    ).toBe(false);

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    expect(persisted.state.showRecentOnly).toBe(false);
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

  it("persists data fields but not action functions", () => {
    useConversationPanelPreferencesStore.getState().setShowRecentOnly(false);

    const persisted = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    expect(Object.keys(persisted.state).sort()).toEqual([
      "conversationSort",
      "organizeMode",
      "showLlmProfiles",
      "showRecentOnly",
      "showRepoBranchMetadata",
    ]);
  });

  it("exposes setters and a toggler for the LLM-profiles preference", () => {
    useConversationPanelPreferencesStore.getState().setShowLlmProfiles(true);
    expect(
      useConversationPanelPreferencesStore.getState().showLlmProfiles,
    ).toBe(true);

    useConversationPanelPreferencesStore
      .getState()
      .toggleShowLlmProfiles();
    expect(
      useConversationPanelPreferencesStore.getState().showLlmProfiles,
    ).toBe(false);
  });

  it("updates organize and sort preferences via their setters", () => {
    const store = useConversationPanelPreferencesStore.getState();
    store.setOrganizeMode("grouped");
    store.setConversationSort("created");

    const next = useConversationPanelPreferencesStore.getState();
    expect({
      organizeMode: next.organizeMode,
      conversationSort: next.conversationSort,
    }).toEqual({
      organizeMode: "grouped",
      conversationSort: "created",
    });
  });

  it("rehydrates legacy localStorage payloads (new fields filled with defaults)", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          showRepoBranchMetadata: true,
        },
        version: 0,
      }),
    );

    await useConversationPanelPreferencesStore.persist.rehydrate();

    const state = useConversationPanelPreferencesStore.getState();
    expect({
      showRecentOnly: state.showRecentOnly,
      showRepoBranchMetadata: state.showRepoBranchMetadata,
      showLlmProfiles: state.showLlmProfiles,
      organizeMode: state.organizeMode,
      conversationSort: state.conversationSort,
    }).toEqual({
      showRecentOnly: true,
      showRepoBranchMetadata: true,
      showLlmProfiles: false,
      organizeMode: "chronological",
      conversationSort: "updated",
    });
  });
});
