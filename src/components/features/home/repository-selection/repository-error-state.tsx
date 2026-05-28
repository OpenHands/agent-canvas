import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";
import { formControlFieldClassName } from "#/utils/form-control-classes";

export interface RepositoryErrorStateProps {
  wrapperClassName?: string;
}

export function RepositoryErrorState({
  wrapperClassName,
}: RepositoryErrorStateProps) {
  const { t } = useTranslation("openhands");
  return (
    <div
      data-testid="repo-dropdown-error"
      className={cn(
        formControlFieldClassName,
        "flex max-w-[500px] items-center gap-2 text-red-500",
        wrapperClassName,
      )}
    >
      <span className="text-sm">{t("HOME$FAILED_TO_LOAD_REPOSITORIES")}</span>
    </div>
  );
}
