import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "test-utils";
import { ConfirmDeleteModal } from "#/components/features/conversation-panel/confirm-delete-modal";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  Trans: ({
    values,
    components,
  }: {
    values: { title: string };
    components: { title: React.ReactElement };
  }) => React.cloneElement(components.title, {}, values.title),
}));

describe("ConfirmDeleteModal", () => {
  it("should display the conversation title", () => {
    renderWithProviders(
      <ConfirmDeleteModal
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        conversationTitle="My Test Conversation"
      />,
    );

    expect(screen.getByText(/My Test Conversation/)).toBeInTheDocument();
  });

  it("falls back to the default warning when description is null", () => {
    renderWithProviders(
      <ConfirmDeleteModal
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        description={null}
      />,
    );

    expect(
      screen.getByText("CONVERSATION$DELETE_WARNING"),
    ).toBeInTheDocument();
  });
});
