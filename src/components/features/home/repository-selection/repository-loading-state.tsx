import { useTranslation } from "react-i18next";
import { Spinner } from "@heroui/react";
import { cn } from "#/utils/utils";
import { formControlFieldClassName } from "#/utils/form-control-classes";
import { I18nKey } from "#/i18n/declaration";

export interface RepositoryLoadingStateProps {
  wrapperClassName?: string;
}

export function RepositoryLoadingState({
  wrapperClassName,
}: RepositoryLoadingStateProps) {
  const { t } = useTranslation("openhands");
  return (
    <div
      data-testid="repo-dropdown-loading"
      className={cn(
        formControlFieldClassName,
        "flex max-w-[500px] items-center gap-2",
        wrapperClassName,
      )}
    >
      <Spinner size="sm" />
      <span className="text-sm">{t(I18nKey.HOME$LOADING_REPOSITORIES)}</span>
    </div>
  );
}
