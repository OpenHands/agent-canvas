import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { ConversationGroupFolderRow } from "#/components/features/conversation-panel/conversation-group-folder-row";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

function conversation(id: string, branch: string | null): AppConversation {
  return {
    id,
    title: id,
    selected_branch: branch,
    updated_at: "2026-06-22T00:00:00Z",
    created_at: "2026-06-22T00:00:00Z",
  } as unknown as AppConversation;
}

function renderRow(conversations: AppConversation[]) {
  return renderWithProviders(
    <ConversationGroupFolderRow
      group={{
        id: "repo:spotwise/ui",
        label: "ui",
        conversations,
        launch: {},
      }}
      expanded={false}
      previewExpanded={false}
      isDragging={false}
      dropIndicatorPosition={null}
      animateLayout={false}
      isCreatingConversationFlow={false}
      onToggleExpanded={vi.fn()}
      onDragStart={vi.fn()}
      onDragEnd={vi.fn()}
      onDragOver={vi.fn()}
      onDragLeave={vi.fn()}
      onDrop={vi.fn()}
      onTogglePreviewExpanded={vi.fn()}
      onLaunchFromGroup={vi.fn()}
      renderConversationCard={() => null}
    />,
  );
}

describe("ConversationGroupFolderRow chips", () => {
  it("shows the conversation count", () => {
    renderRow([conversation("a", "main"), conversation("b", "main")]);
    expect(
      screen.getByTestId("thread-folder-count-repo-spotwise-ui"),
    ).toHaveTextContent("2");
  });

  it("shows a branch chip when all conversations share one branch", () => {
    renderRow([conversation("a", "main"), conversation("b", "main")]);
    expect(
      screen.getByTestId("thread-folder-branch-repo-spotwise-ui"),
    ).toHaveTextContent("main");
  });

  it("hides the branch chip when branches diverge", () => {
    renderRow([conversation("a", "main"), conversation("b", "feature/x")]);
    expect(
      screen.queryByTestId("thread-folder-branch-repo-spotwise-ui"),
    ).not.toBeInTheDocument();
  });
});
