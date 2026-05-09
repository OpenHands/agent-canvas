import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { RepoConnector } from "#/components/features/home/repo-connector";

const mockUseUserProviders = vi.fn();

vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => mockUseUserProviders(),
}));

vi.mock("#/components/features/home/repo-selection-form", () => ({
  RepositorySelectionForm: () => <div data-testid="stub-repo-form" />,
}));

vi.mock("#/components/features/home/workspace-selection-form", () => ({
  WorkspaceSelectionForm: () => <div data-testid="stub-workspace-form" />,
}));

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "k",
  kind: "cloud",
};

function renderRepoConnector() {
  return render(
    <ActiveBackendProvider>
      <RepoConnector onRepoSelection={() => {}} />
    </ActiveBackendProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  mockUseUserProviders.mockReturnValue({
    isLoadingSettings: false,
    providers: ["github"],
  });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("RepoConnector", () => {
  it("shows the workspace launcher for local backends", () => {
    renderRepoConnector();

    expect(screen.getByTestId("stub-workspace-form")).toBeInTheDocument();
    expect(screen.queryByTestId("stub-repo-form")).not.toBeInTheDocument();
  });

  it("shows the repository launcher for cloud backends with providers", () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    renderRepoConnector();

    expect(screen.getByTestId("stub-repo-form")).toBeInTheDocument();
    expect(
      screen.queryByTestId("stub-workspace-form"),
    ).not.toBeInTheDocument();
  });

  it("does not render the repository launcher for cloud backends without providers", () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });
    mockUseUserProviders.mockReturnValue({
      isLoadingSettings: false,
      providers: [],
    });

    renderRepoConnector();

    expect(screen.queryByTestId("stub-repo-form")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("stub-workspace-form"),
    ).not.toBeInTheDocument();
  });
});
