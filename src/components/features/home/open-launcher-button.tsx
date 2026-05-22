import { Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import RepoForkedIcon from "#/icons/repo-forked.svg?react";
import { cn } from "#/utils/utils";
import {
  formControlBorderClassName,
  formControlSurfaceClassName,
  formControlTransitionClassName,
} from "#/utils/form-control-classes";

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
        "flex flex-row items-center gap-2 rounded-full px-2.5 py-1 text-white",
        formControlBorderClassName,
        formControlSurfaceClassName,
        formControlTransitionClassName,
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:bg-surface-raised",
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {isLocal ? (
          <Folder aria-hidden className="h-4 w-4" strokeWidth={2} />
        ) : (
          <RepoForkedIcon width={16} height={16} className="shrink-0" />
        )}
      </span>
      <span className="text-sm font-normal leading-5">{label}</span>
    </button>
  );
}
