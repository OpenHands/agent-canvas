import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConversationStore } from "#/stores/conversation-store";

const defaultConversationState = {
  selectedTab: "files" as const,
  unpinnedTabs: [] as string[],
  conversationMode: "code" as const,
};

const mockGetConversationState = vi.fn(
  (_id: string) => defaultConversationState,
);
const mockSetConversationState = vi.fn();

vi.mock("#/utils/conversation-local-storage", () => ({
  getConversationState: (id: string) => mockGetConversationState(id),
  setConversationState: (id: string, updates: object) =>
    mockSetConversationState(id, updates),
}));

const CONV_ID = "conv-test-1";

describe("conversation store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversationState.mockReturnValue(defaultConversationState);
    Object.defineProperty(window, "location", {
      value: { pathname: `/conversations/${CONV_ID}` },
      writable: true,
    });
    useConversationStore.setState({
      conversationMode: "code",
      planContent: null,
      subConversationTaskId: null,
      shouldHideSuggestions: false,
      uploadImagesAsFiles: false,
    });
  });

  describe("setConversationMode", () => {
    it("updates store state and persists via setConversationState when conversation ID is in location", () => {
      useConversationStore.getState().setConversationMode("plan");

      expect(useConversationStore.getState().conversationMode).toBe("plan");
      expect(mockSetConversationState).toHaveBeenCalledWith(CONV_ID, {
        conversationMode: "plan",
      });
    });
  });

  describe("uploadImagesAsFiles", () => {
    it("defaults to false and is updated by setUploadImagesAsFiles", () => {
      expect(useConversationStore.getState().uploadImagesAsFiles).toBe(false);

      useConversationStore.getState().setUploadImagesAsFiles(true);
      expect(useConversationStore.getState().uploadImagesAsFiles).toBe(true);

      useConversationStore.getState().setUploadImagesAsFiles(false);
      expect(useConversationStore.getState().uploadImagesAsFiles).toBe(false);
    });

    it("is reset to false by clearAllFiles", () => {
      useConversationStore.getState().setUploadImagesAsFiles(true);
      expect(useConversationStore.getState().uploadImagesAsFiles).toBe(true);

      useConversationStore.getState().clearAllFiles();
      expect(useConversationStore.getState().uploadImagesAsFiles).toBe(false);
    });
  });

  describe("resetConversationState", () => {
    it("sets conversationMode from getConversationState", () => {
      useConversationStore.setState({ conversationMode: "plan" });
      mockGetConversationState.mockReturnValue({
        selectedTab: "files",
        unpinnedTabs: [],
        conversationMode: "code",
      });

      useConversationStore.getState().resetConversationState();

      expect(useConversationStore.getState().conversationMode).toBe("code");
      expect(mockGetConversationState).toHaveBeenCalledWith(CONV_ID);
    });
  });
});
