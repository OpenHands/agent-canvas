import React from "react";
import { useTranslation } from "react-i18next";

import {
  useAddWorkspaces,
  useAddWorkspaceParents,
  useRemoveWorkspace,
  useRemoveWorkspaceParent,
} from "#/hooks/mutation/use-local-workspaces-mutations";
import { useLocalWorkspaces } from "#/hooks/query/use-local-workspaces";
import { useResolvedWorkspaces } from "#/hooks/query/use-resolved-workspaces";
import { useUserProviders } from "#/hooks/use-user-providers";
import { Branch, GitRepository } from "#/types/git";
import { Provider } from "#/types/settings";
import { LocalWorkspace } from "#/types/workspace";
import { I18nKey } from "#/i18n/declaration";
import { getWorkspacesUnsupportedMessage } from "#/utils/workspaces-compatibility";

import { GitBranchDropdown } from "./git-branch-dropdown";
import { GitProviderDropdown } from "./git-provider-dropdown";
import { GitRepoDropdown } from "./git-repo-dropdown";
import { FolderBrowserModal } from "./workspace-dropdown/folder-browser-modal";
import { ManageWorkspacesModal } from "./workspace-dropdown/manage-workspaces-modal";
import { WorkspaceDropdown } from "./workspace-dropdown/workspace-dropdown";

interface HomeGitControlBarPreviewProps {
  isLocal: boolean;
  disabled?: boolean;
  workspace?: LocalWorkspace | null;
  onWorkspaceChange?: (workspace: LocalWorkspace | null) => void;
  repository?: GitRepository | null;
  branch?: Branch | null;
  provider?: Provider | null;
  onRepositoryChange?: (repository: GitRepository | null) => void;
  onBranchChange?: (branch: Branch | null) => void;
  onProviderChange?: (provider: Provider | null) => void;
}

function LocalWorkspacePreview({
  disabled,
  workspace,
  onWorkspaceChange,
}: {
  disabled?: boolean;
  workspace?: LocalWorkspace | null;
  onWorkspaceChange?: (workspace: LocalWorkspace | null) => void;
}) {
  const { t } = useTranslation("openhands");
  const { data: workspacesData, error: workspacesError } = useLocalWorkspaces();
  const workspaceParents = workspacesData?.workspaceParents ?? [];
  const { mutate: addWorkspaces } = useAddWorkspaces();
  const { mutate: removeWorkspace } = useRemoveWorkspace();
  const { mutate: addWorkspaceParents } = useAddWorkspaceParents();
  const { mutate: removeWorkspaceParent } = useRemoveWorkspaceParent();
  const {
    workspaces,
    isLoading: isLoadingWorkspaces,
    isError: hasWorkspaceError,
    error: resolvedWorkspacesError,
  } = useResolvedWorkspaces();
  const workspacesUnsupportedMessage = getWorkspacesUnsupportedMessage(
    workspacesError ?? resolvedWorkspacesError,
    t,
  );
  const [isBrowserOpen, setIsBrowserOpen] = React.useState(false);
  const [isManageOpen, setIsManageOpen] = React.useState(false);

  const isDropdownDisabled =
    Boolean(disabled) ||
    Boolean(workspacesUnsupportedMessage) ||
    (isLoadingWorkspaces && workspaces.length === 0);

  let workspaceStatusText: string | null = null;
  if (workspacesUnsupportedMessage) {
    workspaceStatusText = workspacesUnsupportedMessage;
  } else if (isLoadingWorkspaces) {
    workspaceStatusText = t(I18nKey.HOME$LOADING);
  } else if (hasWorkspaceError) {
    workspaceStatusText = t(I18nKey.HOME$WORKSPACE_SCAN_ERROR);
  }

  return (
    <>
      <WorkspaceDropdown
        workspaces={workspaces}
        value={workspace ?? null}
        placeholder={
          workspacesUnsupportedMessage
            ? t(I18nKey.HOME$WORKSPACES_UNSUPPORTED_PLACEHOLDER)
            : isDropdownDisabled
              ? t(I18nKey.HOME$LOADING)
              : undefined
        }
        disabled={isDropdownDisabled}
        disabledTooltip={workspacesUnsupportedMessage}
        showManage={workspaces.length > 0 || workspaceParents.length > 0}
        onChange={(nextWorkspace) => onWorkspaceChange?.(nextWorkspace)}
        onAddClick={() => setIsBrowserOpen(true)}
        onManageClick={() => setIsManageOpen(true)}
        className="min-w-[180px] flex-1"
      />
      {workspaceStatusText ? (
        <span className="sr-only" data-testid="home-workspace-status-message">
          {workspaceStatusText}
        </span>
      ) : null}

      <FolderBrowserModal
        isOpen={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        onAdd={(items) => addWorkspaces(items)}
        onAddParent={(items) => addWorkspaceParents(items)}
      />

      <ManageWorkspacesModal
        isOpen={isManageOpen}
        workspaces={workspaces}
        workspaceParents={workspaceParents}
        onClose={() => setIsManageOpen(false)}
        onRemove={(path) => {
          if (workspace?.path === path) {
            onWorkspaceChange?.(null);
          }
          removeWorkspace(path);
        }}
        onRemoveParent={(path) => {
          if (workspace?.parentPath === path) {
            onWorkspaceChange?.(null);
          }
          removeWorkspaceParent(path);
        }}
      />
    </>
  );
}

function CloudRepositoryPreview({
  disabled,
  repository,
  branch,
  provider,
  onRepositoryChange,
  onBranchChange,
  onProviderChange,
}: {
  disabled?: boolean;
  repository?: GitRepository | null;
  branch?: Branch | null;
  provider?: Provider | null;
  onRepositoryChange?: (repository: GitRepository | null) => void;
  onBranchChange?: (branch: Branch | null) => void;
  onProviderChange?: (provider: Provider | null) => void;
}) {
  const { providers, isLoadingSettings } = useUserProviders();
  const effectiveProvider = provider ?? providers[0] ?? null;

  const handleRepoSelection = (nextRepository?: GitRepository) => {
    onRepositoryChange?.(nextRepository ?? null);
    if (!nextRepository) {
      onBranchChange?.(null);
    }
  };

  const handleProviderSelection = (nextProvider: Provider | null) => {
    if (nextProvider === effectiveProvider) {
      return;
    }
    onProviderChange?.(nextProvider);
    onRepositoryChange?.(null);
    onBranchChange?.(null);
  };

  return (
    <>
      {providers.length > 1 ? (
        <GitProviderDropdown
          providers={providers}
          value={effectiveProvider}
          placeholder="Select Provider"
          className="w-[140px] flex-shrink-0"
          onChange={handleProviderSelection}
          disabled={Boolean(disabled) || isLoadingSettings}
        />
      ) : null}
      <GitRepoDropdown
        provider={effectiveProvider ?? "github"}
        value={repository?.id ?? null}
        repositoryName={repository?.full_name ?? null}
        placeholder="user/repo"
        disabled={Boolean(disabled) || !effectiveProvider || isLoadingSettings}
        onChange={handleRepoSelection}
        className="min-w-[180px] flex-1"
      />
      <GitBranchDropdown
        repository={repository?.full_name ?? null}
        provider={effectiveProvider ?? "github"}
        selectedBranch={branch ?? null}
        onBranchSelect={(nextBranch) => onBranchChange?.(nextBranch)}
        defaultBranch={repository?.main_branch ?? null}
        placeholder="Select branch..."
        className="w-[200px] max-w-[200px] flex-shrink-0"
        disabled={Boolean(disabled) || !repository || isLoadingSettings}
      />
    </>
  );
}

export function HomeGitControlBarPreview({
  isLocal,
  disabled,
  workspace,
  onWorkspaceChange,
  repository,
  branch,
  provider,
  onRepositoryChange,
  onBranchChange,
  onProviderChange,
}: HomeGitControlBarPreviewProps) {
  return (
    <div
      className="flex flex-row flex-wrap items-center gap-2.5"
      data-testid="home-git-control-bar-preview"
    >
      {isLocal ? (
        <LocalWorkspacePreview
          disabled={disabled}
          workspace={workspace}
          onWorkspaceChange={onWorkspaceChange}
        />
      ) : (
        <CloudRepositoryPreview
          disabled={disabled}
          repository={repository}
          branch={branch}
          provider={provider}
          onRepositoryChange={onRepositoryChange}
          onBranchChange={onBranchChange}
          onProviderChange={onProviderChange}
        />
      )}
    </div>
  );
}
