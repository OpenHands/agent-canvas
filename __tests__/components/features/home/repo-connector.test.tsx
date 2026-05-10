import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepoConnector } from "#/components/features/home/repo-connector";

const mockUseUserProviders = vi.fn();
const mockUseActiveBackend = vi.fn();

vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => mockUseUserProviders(),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => mockUseActiveBackend(),
}));

vi.mock("#/components/features/home/workspace-selection-form", () => ({
  WorkspaceSelectionForm: () => <div data-testid="stub-workspace-form" />,
}));

vi.mock("#/components/features/home/repo-selection-form", () => ({
  RepositorySelectionForm: () => <div data-testid="stub-repository-form" />,
}));

describe("RepoConnector", () => {
  beforeEach(() => {
    mockUseUserProviders.mockReturnValue({
      isLoadingSettings: false,
      providers: ["github"],
    });
  });

  it("shows the workspace launcher when the active backend is local", () => {
    mockUseActiveBackend.mockReturnValue({
      backend: { kind: "local" },
      orgId: null,
    });

    render(<RepoConnector />);

    expect(screen.getByTestId("stub-workspace-form")).toBeInTheDocument();
    expect(
      screen.queryByTestId("stub-repository-form"),
    ).not.toBeInTheDocument();
  });

  it("shows the git repository launcher when the active backend is cloud", () => {
    mockUseActiveBackend.mockReturnValue({
      backend: { kind: "cloud" },
      orgId: null,
    });

    render(<RepoConnector />);

    expect(screen.getByTestId("stub-repository-form")).toBeInTheDocument();
    expect(screen.queryByTestId("stub-workspace-form")).not.toBeInTheDocument();
  });
});
