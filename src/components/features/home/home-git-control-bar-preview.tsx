import { GitControlBarRepoButton } from "#/components/features/chat/git-control-bar-repo-button";
import { GitControlBarBranchButton } from "#/components/features/chat/git-control-bar-branch-button";
import { Branch, GitRepository } from "#/types/git";
import { Provider } from "#/types/settings";
import { LocalWorkspace } from "#/types/workspace";

interface HomeGitControlBarPreviewProps {
  workspace?: LocalWorkspace | null;
  repository?: GitRepository | null;
  branch?: Branch | null;
  provider?: Provider | null;
  onRepoClick: () => void;
}

export function HomeGitControlBarPreview({
  workspace,
  repository,
  branch,
  provider,
  onRepoClick,
}: HomeGitControlBarPreviewProps) {
  const workspaceName = workspace
    ? workspace.path.replace(/\/+$/, "").split("/").pop() || workspace.path
    : null;

  return (
    <div
      className="flex flex-row gap-2.5 items-center flex-wrap"
      data-testid="home-git-control-bar-preview"
    >
      <GitControlBarRepoButton
        selectedRepository={repository?.full_name ?? null}
        gitProvider={provider ?? null}
        workspaceName={workspaceName}
        onClick={onRepoClick}
      />
      {branch ? (
        <GitControlBarBranchButton
          selectedBranch={branch.name}
          selectedRepository={repository?.full_name ?? null}
          gitProvider={provider ?? null}
        />
      ) : null}
    </div>
  );
}
