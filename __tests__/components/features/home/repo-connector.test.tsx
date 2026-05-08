import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepoConnector } from "#/components/features/home/repo-connector";

const mockUseUserProviders = vi.fn();

vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => mockUseUserProviders(),
}));

vi.mock("#/components/features/home/workspace-selection-form", () => ({
  WorkspaceSelectionForm: () => <div data-testid="stub-workspace-form" />,
}));

describe("RepoConnector", () => {
  beforeEach(() => {
    mockUseUserProviders.mockReturnValue({
      isLoadingSettings: false,
      providers: ["github"],
    });
  });

  it("always shows the workspace launcher for the agent-server build", () => {
    render(<RepoConnector />);

    expect(screen.getByTestId("stub-workspace-form")).toBeInTheDocument();
  });
});
