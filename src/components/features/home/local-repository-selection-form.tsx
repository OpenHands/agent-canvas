import React from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, Search } from "lucide-react";

import { useCloneLocalGithubRepository } from "#/hooks/mutation/use-clone-local-github-repository";
import {
  useLocalGithubBranches,
  useLocalGithubRepositories,
} from "#/hooks/query/use-local-github-repositories";
import { I18nKey } from "#/i18n/declaration";
import { LocalWorkspace } from "#/types/workspace";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";

import { BrandButton } from "../settings/brand-button";

interface LocalRepositorySelectionFormProps {
  onConfirm: (workspace: LocalWorkspace) => void;
}

function toWorkspace(path: string): LocalWorkspace {
  const normalized = path.replace(/\/+$/, "");
  return {
    id: normalized,
    name: normalized.split("/").pop() || normalized,
    path: normalized,
    parentPath: "/projects",
  };
}

function selectClassName(disabled: boolean): string {
  return cn(
    "w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-sm text-foreground outline-none",
    disabled
      ? "cursor-not-allowed opacity-50"
      : "focus:border-[var(--oh-border-subtle)]",
  );
}

export function LocalRepositorySelectionForm({
  onConfirm,
}: LocalRepositorySelectionFormProps) {
  const { t } = useTranslation("openhands");
  const [filter, setFilter] = React.useState("");
  const [selectedRepositoryName, setSelectedRepositoryName] =
    React.useState("");
  const [selectedBranchName, setSelectedBranchName] = React.useState("");

  const repositoriesQuery = useLocalGithubRepositories();
  const repositories = repositoriesQuery.data ?? [];
  const selectedRepository = React.useMemo(
    () =>
      repositories.find((repo) => repo.full_name === selectedRepositoryName),
    [repositories, selectedRepositoryName],
  );
  const branchesQuery = useLocalGithubBranches(selectedRepository?.full_name);
  const branches = branchesQuery.data ?? [];
  const selectedBranch = React.useMemo(
    () => branches.find((branch) => branch.name === selectedBranchName),
    [branches, selectedBranchName],
  );
  const cloneRepository = useCloneLocalGithubRepository();

  React.useEffect(() => {
    if (selectedRepositoryName || repositories.length === 0) return;
    setSelectedRepositoryName(repositories[0].full_name);
  }, [repositories, selectedRepositoryName]);

  React.useEffect(() => {
    if (!selectedRepository) {
      setSelectedBranchName("");
      return;
    }

    const preferredBranch = selectedRepository.main_branch;
    const nextBranch =
      branches.find((branch) => branch.name === preferredBranch) ?? branches[0];
    setSelectedBranchName(nextBranch?.name ?? "");
  }, [branches, selectedRepository]);

  const filteredRepositories = React.useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return repositories;
    return repositories.filter((repo) =>
      repo.full_name.toLowerCase().includes(query),
    );
  }, [filter, repositories]);

  const isLoading = repositoriesQuery.isLoading;
  const isDisabled =
    isLoading ||
    repositoriesQuery.isError ||
    cloneRepository.isPending ||
    !selectedRepository ||
    branchesQuery.isLoading ||
    branchesQuery.isError ||
    !selectedBranch;

  const handleCloneAndConfirm = () => {
    if (!selectedRepository || !selectedBranch) return;

    cloneRepository.mutate(
      { repository: selectedRepository, branch: selectedBranch },
      {
        onSuccess: (result) => onConfirm(toWorkspace(result.path)),
        onError: (error) =>
          displayErrorToast(error instanceof Error ? error.message : null),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3" data-testid="local-repository-form">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="local-repository-filter"
          className="text-sm font-medium text-[var(--oh-text-primary)]"
        >
          {t(I18nKey.HOME$LOCAL_REPOSITORY_SEARCH_LABEL)}
        </label>
        <div className="relative">
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--oh-text-secondary)]"
          />
          <input
            id="local-repository-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t(I18nKey.HOME$LOCAL_REPOSITORY_SEARCH_PLACEHOLDER)}
            className="w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-[var(--oh-text-secondary)] focus:border-[var(--oh-border-subtle)]"
            disabled={isLoading || repositoriesQuery.isError}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="local-repository-select"
          className="text-sm font-medium text-[var(--oh-text-primary)]"
        >
          {t(I18nKey.COMMON$OPEN_REPOSITORY)}
        </label>
        <select
          id="local-repository-select"
          value={selectedRepositoryName}
          onChange={(event) => setSelectedRepositoryName(event.target.value)}
          className={selectClassName(isLoading || repositoriesQuery.isError)}
          disabled={isLoading || repositoriesQuery.isError}
          data-testid="local-repository-select"
        >
          {filteredRepositories.map((repository) => (
            <option key={repository.full_name} value={repository.full_name}>
              {repository.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="local-branch-select"
          className="flex items-center gap-1 text-sm font-medium text-[var(--oh-text-primary)]"
        >
          <GitBranch aria-hidden className="h-4 w-4" />
          {t(I18nKey.HOME$LOCAL_REPOSITORY_BRANCH_LABEL)}
        </label>
        <select
          id="local-branch-select"
          value={selectedBranchName}
          onChange={(event) => setSelectedBranchName(event.target.value)}
          className={selectClassName(branchesQuery.isLoading)}
          disabled={!selectedRepository || branchesQuery.isLoading}
          data-testid="local-branch-select"
        >
          {branches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name}
            </option>
          ))}
        </select>
      </div>

      {repositoriesQuery.isLoading ? (
        <p className="text-xs text-[var(--oh-text-secondary)]">
          {t(I18nKey.HOME$LOCAL_REPOSITORY_LOADING)}
        </p>
      ) : null}

      {repositoriesQuery.isError ? (
        <p className="text-xs text-red-400" data-testid="local-repo-error">
          {repositoriesQuery.error instanceof Error
            ? repositoriesQuery.error.message
            : t(I18nKey.HOME$LOCAL_REPOSITORY_ERROR)}
        </p>
      ) : null}

      {!repositoriesQuery.isLoading &&
      !repositoriesQuery.isError &&
      repositories.length === 0 ? (
        <p className="text-xs text-[var(--oh-text-secondary)]">
          {t(I18nKey.HOME$LOCAL_REPOSITORY_EMPTY)}
        </p>
      ) : null}

      <p className="text-xs text-[var(--oh-text-secondary)]">
        {t(I18nKey.HOME$LOCAL_REPOSITORY_WORKTREE_NOTE)}
      </p>

      <BrandButton
        testId="local-repository-confirm-button"
        variant="primary"
        type="button"
        isDisabled={isDisabled}
        onClick={handleCloneAndConfirm}
        className="w-full"
      >
        {cloneRepository.isPending
          ? t(I18nKey.HOME$LOCAL_REPOSITORY_CLONING)
          : t(I18nKey.HOME$LOCAL_REPOSITORY_CLONE_AND_OPEN)}
      </BrandButton>
    </div>
  );
}
