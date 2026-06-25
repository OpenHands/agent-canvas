import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import {
  removeStoredConversationMetadata,
  setStoredConversationMetadata,
} from "#/api/conversation-metadata-store";
import { PluginsModal } from "#/components/features/conversation-panel/plugins-modal";

const CONVERSATION_ID = "conv-plugins-modal";

afterEach(() => removeStoredConversationMetadata(CONVERSATION_ID));

function renderModal() {
  return renderWithProviders(<PluginsModal onClose={vi.fn()} />, {
    navigation: { conversationId: CONVERSATION_ID },
  });
}

describe("PluginsModal", () => {
  it("lists the plugins attached to the conversation with their source and ref", () => {
    setStoredConversationMetadata(CONVERSATION_ID, {
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
      plugins: [
        {
          source: "github:OpenHands/extensions",
          ref: "main",
          repo_path: "plugins/city-weather",
        },
      ],
    });

    renderModal();

    expect(
      screen.getByTestId("active-plugin-city-weather"),
    ).toBeInTheDocument();
    expect(screen.getByText("OpenHands/extensions @ main")).toBeInTheDocument();
  });

  it("shows the empty state when no plugins are attached", () => {
    setStoredConversationMetadata(CONVERSATION_ID, {
      selected_repository: null,
      selected_branch: null,
      git_provider: null,
    });

    renderModal();

    expect(screen.getByText("PLUGINS_MODAL$EMPTY")).toBeInTheDocument();
  });
});
