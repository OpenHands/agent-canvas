import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { LaunchTabs } from "#/components/features/home/launch-tabs";

// LaunchTabs's children pull a lot of git/data — stub them so the test
// stays focused on the tab visibility decision.
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

function renderTabs() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ActiveBackendProvider>
        <LaunchTabs onRepoSelection={() => {}} />
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("LaunchTabs", () => {
  it("shows the Workspaces tab when active backend is local", () => {
    renderTabs();
    expect(screen.getByTestId("repositories-tab")).toBeInTheDocument();
    expect(screen.getByTestId("workspaces-tab")).toBeInTheDocument();
  });

  it("hides the Workspaces tab when active backend is cloud", () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    renderTabs();
    expect(screen.getByTestId("repositories-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("workspaces-tab")).not.toBeInTheDocument();
  });
});
