import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import i18n from "i18next";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "test-utils";
import { ModelMessages } from "#/components/features/chat/model-messages";
import { useModelStore } from "#/stores/model-store";
import type { ProfileInfo } from "#/api/profiles-service/profiles-service.api";

const CONVERSATION_ID = "conv-1";

const profiles: ProfileInfo[] = [
  {
    name: "haiku",
    model: "anthropic/claude-haiku-4-5",
    base_url: "https://llm.example.test",
    api_key_set: true,
  },
  {
    name: "gpt",
    model: "openai/gpt-5.1",
    base_url: null,
    api_key_set: false,
  },
];

describe("ModelMessages", () => {
  beforeEach(() => {
    i18n.addResourceBundle(
      "en",
      "translation",
      {
        MODEL$AVAILABLE_PROFILES: "Available profiles ({{count}})",
        MODEL$NO_SAVED_PROFILES: "No saved profiles",
        MODEL$NO_PROFILES_HINT:
          "Use the LLM settings page to create a profile, then run /model <name> to switch.",
        MODEL$SWITCHED_TO_PROFILE: "ℹ️ Switched to profile <cmd>{{name}}</cmd>",
      },
      true,
      true,
    );
    useModelStore.setState({ entriesByConversation: {} });
  });

  it("renders only entries anchored to the requested event", async () => {
    const user = userEvent.setup();
    useModelStore.getState().show(CONVERSATION_ID, "event-1", [profiles[0]]);
    useModelStore.getState().show(CONVERSATION_ID, "event-2", [profiles[1]]);

    renderWithProviders(
      <ModelMessages
        conversationId={CONVERSATION_ID}
        anchorEventId="event-1"
      />,
    );

    expect(screen.getByTestId("model-messages")).toBeInTheDocument();
    expect(screen.getByText("MODEL$AVAILABLE_PROFILES")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.getByRole("button", { name: "haiku" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "gpt" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "haiku" }));

    expect(
      screen.getByText(/model:\s+anthropic\/claude-haiku-4-5/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/base_url:\s+https:\/\/llm\.example\.test/),
    ).toBeInTheDocument();
    expect(screen.getByText(/api_key:\s+set/)).toBeInTheDocument();
  });

  it("renders empty-profile hints expanded by default", () => {
    useModelStore.getState().show(CONVERSATION_ID, null, []);

    renderWithProviders(
      <ModelMessages conversationId={CONVERSATION_ID} anchorEventId={null} />,
    );

    expect(screen.getByText("MODEL$NO_SAVED_PROFILES")).toBeInTheDocument();
    expect(screen.getByText("MODEL$NO_PROFILES_HINT")).toBeInTheDocument();
  });

  it("renders switch confirmations for the matching anchor", () => {
    useModelStore.getState().recordSwitch(CONVERSATION_ID, "event-1", "haiku");

    renderWithProviders(
      <ModelMessages
        conversationId={CONVERSATION_ID}
        anchorEventId="event-1"
      />,
    );

    expect(screen.getByTestId("model-messages")).toHaveTextContent(
      "ℹ️ Switched to profile haiku",
    );
  });
});
