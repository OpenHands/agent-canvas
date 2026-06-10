import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeGitControlBarPreview } from "#/components/features/home/home-git-control-bar-preview";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/hooks/query/use-local-workspaces", () => ({
  useLocalWorkspaces: () => ({
    data: { workspaceParents: [] },
    error: null,
  }),
}));

vi.mock("#/hooks/query/use-resolved-workspaces", () => ({
  useResolvedWorkspaces: () => ({
    workspaces: [{ id: "/p/app", name: "app", path: "/p/app" }],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("#/hooks/mutation/use-local-workspaces-mutations", () => ({
  useAddWorkspaces: () => ({ mutate: vi.fn() }),
  useAddWorkspaceParents: () => ({ mutate: vi.fn() }),
  useRemoveWorkspace: () => ({ mutate: vi.fn() }),
  useRemoveWorkspaceParent: () => ({ mutate: vi.fn() }),
}));

vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => ({
    providers: ["github"],
    isLoadingSettings: false,
  }),
}));

vi.mock("#/components/features/home/workspace-dropdown/workspace-dropdown", () => ({
  WorkspaceDropdown: ({
    value,
    disabled,
  }: {
    value: { name: string } | null;
    disabled?: boolean;
  }) => (
    <input
      data-testid="workspace-dropdown"
      value={value?.name ?? ""}
      readOnly
      disabled={disabled}
    />
  ),
}));

vi.mock("#/components/features/home/workspace-dropdown/folder-browser-modal", () => ({
  FolderBrowserModal: () => null,
}));

vi.mock("#/components/features/home/workspace-dropdown/manage-workspaces-modal", () => ({
  ManageWorkspacesModal: () => null,
}));

vi.mock("#/components/features/home/git-repo-dropdown", () => ({
  GitRepoDropdown: ({
    repositoryName,
    disabled,
  }: {
    repositoryName?: string | null;
    disabled?: boolean;
  }) => (
    <input
      data-testid="git-repo-dropdown"
      value={repositoryName ?? ""}
      readOnly
      disabled={disabled}
    />
  ),
}));

vi.mock("#/components/features/home/git-branch-dropdown", () => ({
  GitBranchDropdown: ({
    selectedBranch,
    disabled,
  }: {
    selectedBranch: { name: string } | null;
    disabled?: boolean;
  }) => (
    <input
      data-testid="git-branch-dropdown-input"
      value={selectedBranch?.name ?? ""}
      readOnly
      disabled={disabled}
    />
  ),
}));

vi.mock("#/components/features/home/git-provider-dropdown", () => ({
  GitProviderDropdown: () => <div data-testid="git-provider-dropdown" />,
}));

describe("HomeGitControlBarPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a workspace dropdown for local backends", () => {
    render(
      <HomeGitControlBarPreview
        isLocal
        workspace={{ id: "/p/app", name: "app", path: "/p/app" }}
      />,
    );

    expect(screen.getByTestId("home-git-control-bar-preview")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-dropdown")).toHaveValue("app");
    expect(screen.queryByTestId("git-repo-dropdown")).not.toBeInTheDocument();
  });

  it("renders repo and branch dropdowns for cloud backends", () => {
    render(
      <HomeGitControlBarPreview
        isLocal={false}
        repository={{
          id: "1",
          full_name: "org/repo",
          git_provider: "github",
          is_public: true,
        }}
        branch={{ name: "main", commit_sha: "abc", protected: false }}
        provider="github"
      />,
    );

    expect(screen.getByTestId("git-repo-dropdown")).toHaveValue("org/repo");
    expect(screen.getByTestId("git-branch-dropdown-input")).toHaveValue("main");
    expect(screen.queryByTestId("workspace-dropdown")).not.toBeInTheDocument();
  });

  it("disables dropdowns while a conversation is being created", () => {
    render(
      <HomeGitControlBarPreview
        isLocal={false}
        disabled
        repository={{
          id: "1",
          full_name: "org/repo",
          git_provider: "github",
          is_public: true,
        }}
        branch={{ name: "main", commit_sha: "abc", protected: false }}
        provider="github"
      />,
    );

    expect(screen.getByTestId("git-repo-dropdown")).toBeDisabled();
    expect(screen.getByTestId("git-branch-dropdown-input")).toBeDisabled();
  });
});
