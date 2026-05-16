import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import FolderIcon from "#/icons/folder.svg?react";
import RepoForkedIcon from "#/icons/repo-forked.svg?react";
import { cn } from "#/utils/utils";

interface OpenLauncherButtonProps {
  kind: "local" | "cloud";
  onClick: () => void;
  disabled?: boolean;
}

export function OpenLauncherButton({
  kind,
  onClick,
  disabled = false,
}: OpenLauncherButtonProps) {
  const { t } = useTranslation("openhands");

  const isLocal = kind === "local";
  const label = isLocal
    ? t(I18nKey.HOME$OPEN_WORKSPACE)
    : t(I18nKey.COMMON$OPEN_REPOSITORY);
  const testId = isLocal ? "open-workspace-button" : "open-repository-button";

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-row items-center gap-2 pl-2.5 pr-2.5 py-1 rounded-[100px] border border-[rgba(71,74,84,0.50)] bg-transparent",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:border-[var(--oh-border-subtle)] cursor-pointer",
      )}
    >
      <span className="w-3 h-3 flex items-center justify-center text-white">
        {isLocal ? (
          <FolderIcon width={12} height={12} />
        ) : (
          <RepoForkedIcon width={12} height={12} color="white" />
        )}
      </span>
      <span className="font-normal text-white text-sm leading-5">{label}</span>
    </button>
  );
}
