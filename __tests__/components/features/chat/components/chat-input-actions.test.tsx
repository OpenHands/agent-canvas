import React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderWithProviders } from "test-utils";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";

vi.mock("#/components/features/controls/agent-status", () => ({
  AgentStatus: () => <div data-testid="agent-status-stub" />,
}));

vi.mock("#/components/features/controls/tools", () => ({
  Tools: () => <div data-testid="tools-stub" />,
}));

vi.mock("#/components/features/chat/change-agent-button", () => ({
  ChangeAgentButton: () => <div data-testid="change-agent-button-stub" />,
}));

// Mock the underlying mutation service module that the pause/resume hooks call.
vi.mock("#/hooks/mutation/conversation-mutation-utils", () => ({
  pauseV1Conversation: vi.fn(),
  resumeV1Conversation: vi.fn(),
  askV1Agent: vi.fn(),
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

describe("ChatInputActions Change Agent button visibility", () => {
  afterEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
  });

  it("hides the Change Agent button on a local backend", () => {
    // Arrange + Act — default active backend is the bundled local one.
    renderWithProviders(<ChatInputActions disabled={false} />);

    // Assert
    expect(
      screen.queryByTestId("change-agent-button-stub"),
    ).not.toBeInTheDocument();
  });

  it("shows the Change Agent button on a cloud backend", () => {
    // Arrange
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    // Act
    renderWithProviders(
      <ActiveBackendProvider>
        <ChatInputActions disabled={false} />
      </ActiveBackendProvider>,
    );

    // Assert
    expect(screen.getByTestId("change-agent-button-stub")).toBeInTheDocument();
  });
});
