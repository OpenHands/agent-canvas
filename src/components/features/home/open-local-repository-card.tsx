import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cloneLocalRepository } from "#/api/git-service/clone-local-repository";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import {
  useLocalRepositories,
  useLocalRepoBranches,
} from "#/hooks/query/use-local-repositories";
import { I18nKey } from "#/i18n/declaration";
import { LocalWorkspace } from "#/types/workspace";
import { Card } from "#/ui/card";
import { CardTitle } from "#/ui/card-title";
import { Typography } from "#/ui/typography";
import { Dropdown } from "#/ui/dropdown/dropdown";
import { DropdownOption } from "#/ui/dropdown/types";
import RepoForkedIcon from "#/icons/repo-forked.svg?react";
import { BrandButton } from "../settings/brand-button";

interface OpenLocalRepositoryCardProps {
  /** Called once the repo has been cloned, with the resulting workspace. */
  onConfirm: (workspace: LocalWorkspace) => void;
  disabled?: boolean;
}

/**
 * Inline, themed "Open Repository" card for Local backend mode (which also
 * covers self-hosted *remote* backends — anything that isn't OpenHands Cloud).
 *
 * The agent-server exposes no cloud provider-search API, so we replicate the
 * OpenHands app's "pick, don't type" UX a different way: when the backend has a
 * `GITHUB_TOKEN`, the runtime's `gh` CLI lists the user's repositories and the
 * selected repo's branches (see `local-repo-listing.ts`). The chosen repo/branch
 * is then cloned into a managed workspace directory and opened as a conversation.
 * Mirrors the cloud "Open Repository" card layout so the home screen stays
 * consistent across backends (#976).
 */
export function OpenLocalRepositoryCard({
  onConfirm,
  disabled = false,
}: OpenLocalRepositoryCardProps) {
  const { t } = useTranslation("openhands");
  const [repo, setRepo] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [isCloning, setIsCloning] = useState(false);

  const {
    data: repositories = [],
    isLoading: isLoadingRepos,
    isError: reposError,
  } = useLocalRepositories(!disabled);
  const { data: branches = [], isLoading: isLoadingBranches } =
    useLocalRepoBranches(repo);

  const repoOptions = useMemo<DropdownOption[]>(
    () => repositories.map((r) => ({ value: r.full_name, label: r.full_name })),
    [repositories],
  );
  const branchOptions = useMemo<DropdownOption[]>(
    () => branches.map((b) => ({ value: b, label: b })),
    [branches],
  );
  const defaultBranch = useMemo(
    () =>
      repositories.find((r) => r.full_name === repo)?.default_branch ?? null,
    [repositories, repo],
  );

  const canSubmit = !!repo && !isCloning && !disabled;

  const handleClone = async () => {
    if (!repo || isCloning || disabled) return;
    setIsCloning(true);
    try {
      const { path, name } = await cloneLocalRepository(
        repo,
        branch ?? defaultBranch ?? undefined,
      );
      onConfirm({ id: path, name, path });
      setRepo(null);
      setBranch(null);
    } catch (error) {
      displayErrorToast(
        error instanceof Error ? error.message : t(I18nKey.HOME$CLONE_FAILED),
      );
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Card
      testId="open-local-repository-card"
      className="w-full flex-col gap-2.5 p-5"
    >
      <CardTitle icon={<RepoForkedIcon width={20} height={20} />}>
        {t(I18nKey.COMMON$OPEN_REPOSITORY)}
      </CardTitle>
      <Typography.Text>{t(I18nKey.HOME$SELECT_OR_INSERT_URL)}</Typography.Text>

      <Dropdown
        testId="local-repo-dropdown"
        options={repoOptions}
        loading={isLoadingRepos}
        disabled={disabled || isCloning}
        clearable
        placeholder={t(I18nKey.HOME$REPO_URL_PLACEHOLDER)}
        emptyMessage={
          reposError
            ? "Couldn't load repositories — set GITHUB_TOKEN on this backend."
            : "No repositories found"
        }
        onChange={(option) => {
          setRepo(option?.value ?? null);
          setBranch(null);
        }}
      />

      <Dropdown
        testId="local-branch-dropdown"
        options={branchOptions}
        loading={isLoadingBranches}
        disabled={!repo || disabled || isCloning}
        clearable
        placeholder={t(I18nKey.HOME$REPO_BRANCH_PLACEHOLDER)}
        emptyMessage="No branches found"
        onChange={(option) => setBranch(option?.value ?? null)}
      />

      <BrandButton
        testId="clone-and-open-button"
        variant="primary"
        type="button"
        isDisabled={!canSubmit}
        onClick={handleClone}
        className="w-full"
      >
        {isCloning
          ? t(I18nKey.HOME$CLONING_REPOSITORY)
          : t(I18nKey.HOME$CLONE_AND_OPEN)}
      </BrandButton>
    </Card>
  );
}
