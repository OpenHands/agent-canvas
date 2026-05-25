import React from "react";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";

const useActiveConversationMock = vi.fn<
  () => {
    data: { conversation_id: string; llm_model: string | null } | undefined;
  }
>(() => ({ data: undefined }));

vi.mock("#/components/features/controls/agent-status", () => ({
  AgentStatus: () => <div data-testid="agent-status-stub" />,
}));

vi.mock("#/components/features/chat/change-agent-button", () => ({
  ChangeAgentButton: () => <div data-testid="change-agent-button-stub" />,
}));

vi.mock("#/components/features/chat/switch-profile-button", () => ({
  SwitchProfileButton: () => <div data-testid="switch-profile-button-stub" />,
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

vi.mock("#/hooks/mutation/conversation-mutation-utils", () => ({
  pauseConversation: vi.fn(),
  resumeConversation: vi.fn(),
  askAgent: vi.fn(),
  updateConversationExecutionStatusInCache: vi.fn(),
  invalidateConversationQueries: vi.fn(),
}));

// eslint-disable-next-line import/first
import { ChatInputActions } from "#/components/features/chat/components/chat-input-actions";

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

describe("ChatInputActions", () => {
  afterEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
    useActiveConversationMock.mockReset();
    useActiveConversationMock.mockReturnValue({ data: undefined });
  });

  it("renders the SwitchProfileButton on a local backend", () => {
    useActiveConversationMock.mockReturnValue({
      data: { conversation_id: "test-conversation-id", llm_model: "gpt-4o" },
    });

    renderWithProviders(<ChatInputActions disabled={false} />);

    expect(
      screen.getByTestId("switch-profile-button-stub"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("chat-input-llm-model"),
    ).not.toBeInTheDocument();
  });

  it("renders the active conversation model on a cloud backend", () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });
    useActiveConversationMock.mockReturnValue({
      data: { conversation_id: "test-conversation-id", llm_model: "gpt-4o" },
    });

    renderWithProviders(
      <ActiveBackendProvider>
        <ChatInputActions disabled={false} />
      </ActiveBackendProvider>,
    );

    expect(screen.getByTestId("chat-input-llm-model")).toHaveTextContent(
      "gpt-4o",
    );
    expect(
      screen.queryByTestId("switch-profile-button-stub"),
    ).not.toBeInTheDocument();
  });

  it("omits the model label on cloud when the active conversation has no llm_model", () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });
    useActiveConversationMock.mockReturnValue({
      data: { conversation_id: "test-conversation-id", llm_model: null },
    });

    renderWithProviders(
      <ActiveBackendProvider>
        <ChatInputActions disabled={false} />
      </ActiveBackendProvider>,
    );

    expect(
      screen.queryByTestId("chat-input-llm-model"),
    ).not.toBeInTheDocument();
  });

  it("hides the Change Agent button on a local backend", () => {
    renderWithProviders(<ChatInputActions disabled={false} />);

    expect(
      screen.queryByTestId("change-agent-button-stub"),
    ).not.toBeInTheDocument();
  });

  it("shows the Change Agent button on a cloud backend", () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    renderWithProviders(
      <ActiveBackendProvider>
        <ChatInputActions disabled={false} />
      </ActiveBackendProvider>,
    );

    expect(screen.getByTestId("change-agent-button-stub")).toBeInTheDocument();
  });
});
