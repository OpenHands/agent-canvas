import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cloneLocalRepository } from "#/api/git-service/clone-local-repository";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";
import {
  formControlBorderClassName,
  formControlSurfaceClassName,
  formControlTransitionClassName,
} from "#/utils/form-control-classes";
import { I18nKey } from "#/i18n/declaration";
import { LocalWorkspace } from "#/types/workspace";
import { Card } from "#/ui/card";
import { CardTitle } from "#/ui/card-title";
import { Typography } from "#/ui/typography";
import RepoForkedIcon from "#/icons/repo-forked.svg?react";
import { BrandButton } from "../settings/brand-button";

interface OpenLocalRepositoryCardProps {
  /** Called once the repo has been cloned, with the resulting workspace. */
  onConfirm: (workspace: LocalWorkspace) => void;
  disabled?: boolean;
}

const inputClassName = cn(
  "w-full rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-tertiary",
  formControlBorderClassName,
  formControlSurfaceClassName,
  formControlTransitionClassName,
);

/**
 * Inline, themed "Open Repository" card for Local backend mode (which also
 * covers self-hosted *remote* backends — anything that isn't OpenHands Cloud).
 *
 * Such backends can't browse a Git provider's repositories (that search API is
 * cloud-only), so instead of the provider-driven dropdown the cloud card uses,
 * the user pastes a repo reference (owner/repo or a clone URL) and we clone it
 * into a managed workspace directory via the runtime's bash endpoint, then open
 * a conversation scoped to the clone. Mirrors the cloud "Open Repository" card
 * layout so the home screen stays consistent across backends (#976).
 */
export function OpenLocalRepositoryCard({
  onConfirm,
  disabled = false,
}: OpenLocalRepositoryCardProps) {
  const { t } = useTranslation("openhands");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [isCloning, setIsCloning] = useState(false);

  const canSubmit = repo.trim().length > 0 && !isCloning && !disabled;

  const handleClone = async () => {
    if (!canSubmit) return;
    setIsCloning(true);
    try {
      const { path, name } = await cloneLocalRepository(repo, branch);
      onConfirm({ id: path, name, path });
      setRepo("");
      setBranch("");
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

      <input
        data-testid="local-repo-input"
        type="text"
        value={repo}
        onChange={(e) => setRepo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleClone();
        }}
        placeholder={t(I18nKey.HOME$REPO_URL_PLACEHOLDER)}
        disabled={isCloning || disabled}
        className={inputClassName}
      />

      <input
        data-testid="local-repo-branch-input"
        type="text"
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleClone();
        }}
        placeholder={t(I18nKey.HOME$REPO_BRANCH_PLACEHOLDER)}
        disabled={isCloning || disabled}
        className={inputClassName}
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
